/**
 * Gaussian Process Lab Forecasting — Phase 3B
 *
 * Predicts future biomarker values using GP regression.
 * Pure TypeScript — no external ML libraries.
 * Matrix sizes are at most ~10x10 (sparse lab data), so Cholesky is trivially fast.
 */

import prisma from './prisma';
import {
  gpPosterior,
  rbfKernel,
  matern32Kernel,
  matern52Kernel,
  periodicKernel,
  normalCDF,
  type KernelFn,
} from './statistical-utils';
import { BIOMARKER_REGISTRY } from './lab-biomarker-contract';
import { PROTOCOL_LAB_EXPECTATIONS } from './protocol-lab-expectations';

// ============================================================
// Interfaces
// ============================================================

export interface LabForecast {
  biomarkerKey: string;
  displayName: string;
  unit: string;
  currentEstimate: { mean: number; ci95Low: number; ci95High: number } | null;
  lastMeasured: { value: number; date: string } | null;
  forecast3m: { mean: number; ci95Low: number; ci95High: number } | null;
  forecast6m: { mean: number; ci95Low: number; ci95High: number } | null;
  thresholdCrossingProb: number | null;
  thresholdType: string | null;
  dataPoints: number;
  confidenceLevel: 'high' | 'medium' | 'low' | 'insufficient';
  stalenessWarning: string | null;
  protocolAdjustments: string[];
  kernelType: string;
}

export interface ForecastResult {
  forecasts: LabForecast[];
  overallConfidence: 'high' | 'medium' | 'low';
  narrative: string;
}

interface KernelConfig {
  kernelFn: KernelFn;
  kernelType: string;
  noiseVariance: number;
}

// ============================================================
// Kernel Selection per Biomarker
// ============================================================

const KERNEL_OVERRIDES: Record<string, { type: string; lengthscale: number; variance: number; period?: number }> = {
  hba1c:               { type: 'matern52', lengthscale: 6, variance: 1 },
  hs_crp:              { type: 'rbf',      lengthscale: 2, variance: 1 },
  apob:                { type: 'matern32', lengthscale: 4, variance: 1 },
  ldl_cholesterol:     { type: 'matern32', lengthscale: 4, variance: 1 },
  total_testosterone:  { type: 'periodic_matern', lengthscale: 4, variance: 1, period: 12 },
  free_testosterone:   { type: 'periodic_matern', lengthscale: 4, variance: 1, period: 12 },
};

const DEFAULT_KERNEL = { type: 'matern52', lengthscale: 4, variance: 1 };

function selectKernel(biomarkerKey: string, noiseVar: number): KernelConfig {
  const config = KERNEL_OVERRIDES[biomarkerKey] ?? DEFAULT_KERNEL;

  let kernelFn: KernelFn;
  let kernelType: string;

  switch (config.type) {
    case 'rbf':
      kernelFn = (x1, x2) => rbfKernel(x1, x2, config.lengthscale, config.variance);
      kernelType = `RBF(l=${config.lengthscale})`;
      break;
    case 'matern32':
      kernelFn = (x1, x2) => matern32Kernel(x1, x2, config.lengthscale, config.variance);
      kernelType = `Matern3/2(l=${config.lengthscale})`;
      break;
    case 'periodic_matern':
      kernelFn = (x1, x2) => {
        const period = config.period ?? 12;
        const pk = periodicKernel(x1, x2, period, config.lengthscale, 0.3 * config.variance);
        const mk = matern52Kernel(x1, x2, config.lengthscale, 0.7 * config.variance);
        return pk + mk;
      };
      kernelType = `Periodic(p=${config.period})+Matern5/2(l=${config.lengthscale})`;
      break;
    default: // matern52
      kernelFn = (x1, x2) => matern52Kernel(x1, x2, config.lengthscale, config.variance);
      kernelType = `Matern5/2(l=${config.lengthscale})`;
  }

  return { kernelFn, kernelType, noiseVariance: noiseVar };
}

// ============================================================
// Confidence Level from Data Count
// ============================================================

function confidenceFromCount(n: number): 'high' | 'medium' | 'low' | 'insufficient' {
  if (n < 2) return 'insufficient';
  if (n <= 3) return 'low';
  if (n <= 6) return 'medium';
  return 'high';
}

// ============================================================
// Staleness Warning
// ============================================================

function computeStalenessWarning(lastDate: Date): string | null {
  const daysSince = (Date.now() - lastDate.getTime()) / (1000 * 60 * 60 * 24);
  if (daysSince > 365) return `Last measurement ${Math.round(daysSince / 30)} months ago — forecast uncertainty is very high`;
  if (daysSince > 180) return `Last measurement ${Math.round(daysSince / 30)} months ago — consider retesting`;
  if (daysSince > 90) return `Last measurement ${Math.round(daysSince / 30)} months ago`;
  return null;
}

// ============================================================
// Threshold Crossing Probability
// ============================================================

function thresholdCrossingProbability(
  mean: number,
  variance: number,
  threshold: number,
  direction: 'above' | 'below',
): number {
  const sd = Math.sqrt(variance);
  if (sd <= 0) return mean > threshold ? (direction === 'above' ? 1 : 0) : (direction === 'below' ? 1 : 0);
  const z = (threshold - mean) / sd;
  if (direction === 'above') return 1 - normalCDF(z); // P(X > threshold)
  return normalCDF(z); // P(X < threshold)
}

// ============================================================
// Observation Noise from Registry
// ============================================================

function getNoiseVariance(biomarkerKey: string, values: number[]): number {
  const def = BIOMARKER_REGISTRY[biomarkerKey];
  if (def?.biologicalVariation?.withinSubjectCV) {
    const meanVal = values.reduce((a, b) => a + b, 0) / values.length;
    const noiseSD = (def.biologicalVariation.withinSubjectCV / 100) * Math.abs(meanVal);
    return noiseSD * noiseSD;
  }
  // Fallback: 10% of range
  const range = Math.max(...values) - Math.min(...values);
  const fallbackSD = Math.max(range * 0.1, 0.01);
  return fallbackSD * fallbackSD;
}

// ============================================================
// Protocol Adjustments (mean shift for active protocols)
// ============================================================

async function getProtocolAdjustments(userId: string, biomarkerKey: string): Promise<{
  adjustments: string[];
  meanShiftPerMonth: number;
}> {
  const activeProtocols = await prisma.protocol.findMany({
    where: {
      userId,
      status: 'active',
    },
    include: { peptide: true },
  });

  const adjustments: string[] = [];
  let totalShiftPerMonth = 0;

  for (const proto of activeProtocols) {
    const peptideName = proto.peptide?.name?.toLowerCase().replace(/[\s-]+/g, '_') ?? '';
    const expectations = PROTOCOL_LAB_EXPECTATIONS[peptideName];
    if (!expectations) continue;

    const labEffect = expectations.expectedLabEffects?.find(
      (e: { biomarkerKey: string }) => e.biomarkerKey === biomarkerKey
    );
    if (!labEffect) continue;

    const startDate = new Date(proto.startDate);
    const monthsOn = (Date.now() - startDate.getTime()) / (1000 * 60 * 60 * 24 * 30);

    // Ramp: effect scales from 0 to full over onset-to-peak weeks
    const onsetMonths = (labEffect.onsetWeeks?.min ?? 4) / 4.33;
    const peakMonths = (labEffect.peakWeeks?.max ?? 16) / 4.33;
    const rampFraction = Math.min(1, Math.max(0, (monthsOn - onsetMonths) / (peakMonths - onsetMonths)));

    const midMagnitude = ((labEffect.magnitudeRange?.min ?? 0) + (labEffect.magnitudeRange?.max ?? 0)) / 2;
    const dirSign = labEffect.expectedDirection === 'decrease' ? -1 : 1;
    const monthlyShift = (dirSign * midMagnitude / 100) * rampFraction;

    if (Math.abs(monthlyShift) > 0.001) {
      totalShiftPerMonth += monthlyShift;
      const dirLabel = labEffect.expectedDirection === 'decrease' ? 'decrease' : 'increase';
      adjustments.push(
        `${proto.peptide?.name ?? 'Protocol'}: expected ${midMagnitude}% ${dirLabel} (${labEffect.evidenceLevel})`
      );
    }
  }

  return { adjustments, meanShiftPerMonth: totalShiftPerMonth };
}

// ============================================================
// Single Biomarker Forecast
// ============================================================

export async function forecastSingleBiomarker(userId: string, biomarkerKey: string): Promise<LabForecast> {
  const def = BIOMARKER_REGISTRY[biomarkerKey];
  const displayName = def?.displayName ?? biomarkerKey;
  const unit = def?.unit ?? '';

  // Fetch all measurements for this biomarker, ordered by date
  const measurements = await prisma.labBiomarker.findMany({
    where: {
      upload: { userId },
      biomarkerKey,
    },
    include: { upload: true },
    orderBy: { upload: { testDate: 'asc' } },
  });

  const dataPoints = measurements.length;
  const confidence = confidenceFromCount(dataPoints);

  if (confidence === 'insufficient') {
    return {
      biomarkerKey,
      displayName,
      unit,
      currentEstimate: null,
      lastMeasured: dataPoints === 1
        ? { value: measurements[0].value, date: measurements[0].upload.testDate.toISOString() }
        : null,
      forecast3m: null,
      forecast6m: null,
      thresholdCrossingProb: null,
      thresholdType: null,
      dataPoints,
      confidenceLevel: 'insufficient',
      stalenessWarning: dataPoints === 1 ? computeStalenessWarning(measurements[0].upload.testDate) : null,
      protocolAdjustments: [],
      kernelType: 'none',
    };
  }

  // Convert to months since first measurement
  const firstDate = measurements[0].upload.testDate.getTime();
  const xTrain = measurements.map(m => (m.upload.testDate.getTime() - firstDate) / (1000 * 60 * 60 * 24 * 30));
  const yTrain = measurements.map(m => m.value);

  const lastMeasurement = measurements[measurements.length - 1];
  const lastDate = lastMeasurement.upload.testDate;
  const nowMonths = (Date.now() - firstDate) / (1000 * 60 * 60 * 24 * 30);

  // Noise variance from biological variation
  const noiseVar = getNoiseVariance(biomarkerKey, yTrain);
  const kernelConfig = selectKernel(biomarkerKey, noiseVar);

  // Test points: now, +3 months, +6 months
  const xTest = [nowMonths, nowMonths + 3, nowMonths + 6];

  // GP posterior
  const posterior = gpPosterior(xTrain, yTrain, xTest, kernelConfig.kernelFn, kernelConfig.noiseVariance);

  if (!posterior) {
    // Cholesky failed — return last-value estimate with high uncertainty
    return {
      biomarkerKey,
      displayName,
      unit,
      currentEstimate: null,
      lastMeasured: { value: lastMeasurement.value, date: lastDate.toISOString() },
      forecast3m: null,
      forecast6m: null,
      thresholdCrossingProb: null,
      thresholdType: null,
      dataPoints,
      confidenceLevel: 'low',
      stalenessWarning: computeStalenessWarning(lastDate),
      protocolAdjustments: [],
      kernelType: kernelConfig.kernelType,
    };
  }

  // Staleness widening: extra variance proportional to (monthsSinceLastMeasurement)²
  const monthsSinceLast = (Date.now() - lastDate.getTime()) / (1000 * 60 * 60 * 24 * 30);
  const stalenessExtra = noiseVar * 0.1 * monthsSinceLast * monthsSinceLast;
  const adjustedVariances = posterior.variance.map(v => v + stalenessExtra);

  // Protocol adjustments (mean shift)
  const { adjustments, meanShiftPerMonth } = await getProtocolAdjustments(userId, biomarkerKey);
  const adjustedMeans = posterior.mean.map((m, i) => {
    const monthsFromNow = xTest[i] - nowMonths;
    return m + meanShiftPerMonth * lastMeasurement.value * monthsFromNow;
  });

  // Build estimates
  const ci95 = (mean: number, variance: number) => {
    const sd = Math.sqrt(Math.max(variance, 1e-10));
    return { mean: +mean.toFixed(2), ci95Low: +(mean - 1.96 * sd).toFixed(2), ci95High: +(mean + 1.96 * sd).toFixed(2) };
  };

  const currentEstimate = ci95(adjustedMeans[0], adjustedVariances[0]);
  const forecast3m = ci95(adjustedMeans[1], adjustedVariances[1]);
  const forecast6m = ci95(adjustedMeans[2], adjustedVariances[2]);

  // Threshold crossing probability
  let thresholdCrossProb: number | null = null;
  let thresholdType: string | null = null;

  if (def?.referenceRange) {
    const polarity = def.polarity;
    if (polarity === 'lower_better') {
      // Risk: going above upper reference
      thresholdCrossProb = thresholdCrossingProbability(
        adjustedMeans[2], adjustedVariances[2], def.referenceRange.max, 'above'
      );
      thresholdType = `above ${def.referenceRange.max} ${unit}`;
    } else if (polarity === 'higher_better') {
      // Risk: dropping below lower reference
      thresholdCrossProb = thresholdCrossingProbability(
        adjustedMeans[2], adjustedVariances[2], def.referenceRange.min, 'below'
      );
      thresholdType = `below ${def.referenceRange.min} ${unit}`;
    } else if (polarity === 'optimal_range' && def.optimalRange) {
      // Risk: going outside optimal range (check both ends, take max)
      const probHigh = thresholdCrossingProbability(
        adjustedMeans[2], adjustedVariances[2], def.optimalRange.max, 'above'
      );
      const probLow = thresholdCrossingProbability(
        adjustedMeans[2], adjustedVariances[2], def.optimalRange.min, 'below'
      );
      if (probHigh >= probLow) {
        thresholdCrossProb = probHigh;
        thresholdType = `above optimal (${def.optimalRange.max} ${unit})`;
      } else {
        thresholdCrossProb = probLow;
        thresholdType = `below optimal (${def.optimalRange.min} ${unit})`;
      }
    }
    if (thresholdCrossProb !== null) {
      thresholdCrossProb = +thresholdCrossProb.toFixed(3);
    }
  }

  return {
    biomarkerKey,
    displayName,
    unit,
    currentEstimate,
    lastMeasured: { value: lastMeasurement.value, date: lastDate.toISOString() },
    forecast3m,
    forecast6m,
    thresholdCrossingProb: thresholdCrossProb,
    thresholdType,
    dataPoints,
    confidenceLevel: confidence,
    stalenessWarning: computeStalenessWarning(lastDate),
    protocolAdjustments: adjustments,
    kernelType: kernelConfig.kernelType,
  };
}

// ============================================================
// All Biomarkers Forecast
// ============================================================

export async function forecastAllBiomarkers(userId: string): Promise<ForecastResult> {
  // Find all distinct biomarker keys for this user with >= 2 data points
  const biomarkerCounts = await prisma.labBiomarker.groupBy({
    by: ['biomarkerKey'],
    where: {
      upload: { userId },
    },
    _count: { biomarkerKey: true },
  });

  const eligibleKeys = biomarkerCounts
    .filter(b => b._count.biomarkerKey >= 2)
    .map(b => b.biomarkerKey);

  // Also include keys with 1 data point (insufficient, but shown)
  const singleKeys = biomarkerCounts
    .filter(b => b._count.biomarkerKey === 1)
    .map(b => b.biomarkerKey);

  const allKeys = [...eligibleKeys, ...singleKeys];

  const forecasts: LabForecast[] = [];

  for (const key of allKeys) {
    try {
      const forecast = await forecastSingleBiomarker(userId, key);
      forecasts.push(forecast);
    } catch {
      // Skip biomarker on error
    }
  }

  // Sort: high confidence first, then by data points desc
  const confOrder = { high: 0, medium: 1, low: 2, insufficient: 3 };
  forecasts.sort((a, b) => {
    const ca = confOrder[a.confidenceLevel];
    const cb = confOrder[b.confidenceLevel];
    if (ca !== cb) return ca - cb;
    return b.dataPoints - a.dataPoints;
  });

  // Cache all forecasts to HealthPrediction
  for (const f of forecasts) {
    try {
      await prisma.healthPrediction.upsert({
        where: {
          userId_biomarkerKey: { userId, biomarkerKey: f.biomarkerKey },
        },
        create: {
          userId,
          biomarkerKey: f.biomarkerKey,
          currentEstimate: f.currentEstimate?.mean ?? null,
          currentCI: f.currentEstimate ? JSON.stringify({ lower: f.currentEstimate.ci95Low, upper: f.currentEstimate.ci95High }) : null,
          forecast3m: f.forecast3m?.mean ?? null,
          forecast3mCI: f.forecast3m ? JSON.stringify({ lower: f.forecast3m.ci95Low, upper: f.forecast3m.ci95High }) : null,
          forecast6m: f.forecast6m?.mean ?? null,
          forecast6mCI: f.forecast6m ? JSON.stringify({ lower: f.forecast6m.ci95Low, upper: f.forecast6m.ci95High }) : null,
          thresholdCrossProb: f.thresholdCrossingProb,
          thresholdType: f.thresholdType,
          dataPoints: f.dataPoints,
          confidenceLevel: f.confidenceLevel,
          stalenessWarning: f.stalenessWarning,
          protocolAdjustmentJson: f.protocolAdjustments.length > 0 ? JSON.stringify(f.protocolAdjustments) : null,
        },
        update: {
          currentEstimate: f.currentEstimate?.mean ?? null,
          currentCI: f.currentEstimate ? JSON.stringify({ lower: f.currentEstimate.ci95Low, upper: f.currentEstimate.ci95High }) : null,
          forecast3m: f.forecast3m?.mean ?? null,
          forecast3mCI: f.forecast3m ? JSON.stringify({ lower: f.forecast3m.ci95Low, upper: f.forecast3m.ci95High }) : null,
          forecast6m: f.forecast6m?.mean ?? null,
          forecast6mCI: f.forecast6m ? JSON.stringify({ lower: f.forecast6m.ci95Low, upper: f.forecast6m.ci95High }) : null,
          thresholdCrossProb: f.thresholdCrossingProb,
          thresholdType: f.thresholdType,
          dataPoints: f.dataPoints,
          confidenceLevel: f.confidenceLevel,
          stalenessWarning: f.stalenessWarning,
          protocolAdjustmentJson: f.protocolAdjustments.length > 0 ? JSON.stringify(f.protocolAdjustments) : null,
          computedAt: new Date(),
        },
      });
    } catch {
      // Non-critical: caching failure shouldn't block response
    }
  }

  // Overall confidence
  const highCount = forecasts.filter(f => f.confidenceLevel === 'high').length;
  const medCount = forecasts.filter(f => f.confidenceLevel === 'medium').length;
  const overallConfidence: 'high' | 'medium' | 'low' =
    highCount >= 3 ? 'high' : (highCount + medCount >= 2 ? 'medium' : 'low');

  // Narrative
  const forecastable = forecasts.filter(f => f.confidenceLevel !== 'insufficient');
  const risky = forecasts.filter(f => (f.thresholdCrossingProb ?? 0) > 0.3);
  let narrative = '';
  if (forecastable.length === 0) {
    narrative = 'Not enough lab data for forecasting. Upload at least 2 lab panels to see predictions.';
  } else {
    narrative = `Forecasting ${forecastable.length} biomarker${forecastable.length !== 1 ? 's' : ''} from ${forecasts.reduce((max, f) => Math.max(max, f.dataPoints), 0)} lab draws.`;
    if (risky.length > 0) {
      narrative += ` ${risky.length} biomarker${risky.length !== 1 ? 's' : ''} may approach reference boundaries in the next 6 months.`;
    }
  }

  return { forecasts, overallConfidence, narrative };
}
