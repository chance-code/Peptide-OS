/**
 * Bayesian Online Changepoint Detection (BOCD) — Phase 3B
 *
 * Implements Adams & MacKay (2007) for detecting when a protocol's effect
 * manifests in wearable/health metric time series.
 *
 * Key features:
 * - Conjugate Normal-Inverse-Gamma predictive (Student-t)
 * - All computations in log-space via logSumExp (no underflow)
 * - Multi-stream synchronization with temporal clustering
 * - Protocol attribution alignment
 */

import prisma from './prisma';
import { studentTLogPDF, logSumExp, stableNormalize } from './statistical-utils';
import { PROTOCOL_LAB_EXPECTATIONS } from './protocol-lab-expectations';

// ============================================================
// Interfaces
// ============================================================

export interface BOCDConfig {
  hazardLambda: number;   // Expected run length (higher = fewer changepoints expected)
  minRunLength: number;   // Ignore changepoints in first N observations
  posteriorThreshold: number; // Minimum posterior for detection
}

export interface ChangepointResult {
  metricType: string;
  detected: boolean;
  detectedDate: Date | null;
  posteriorProb: number;
  credibleInterval: { lo: Date; hi: Date } | null;
  effectSize: number | null;  // Cohen's d
  preMean: number;
  postMean: number;
  confidenceLevel: 'high' | 'moderate' | 'low';
}

interface ClusteredChangepoint {
  date: Date;
  streams: string[];
  clusterPosterior: number;
  effectSummary: string;
}

export interface MultiStreamResult {
  perStream: ChangepointResult[];
  clusteredChangepoints: ClusteredChangepoint[];
  protocolAttribution: {
    protocolId: string;
    protocolName: string;
    changepointAlignment: 'aligned' | 'delayed' | 'unaligned' | 'no_changepoint';
    delayDays: number | null;
  } | null;
}

const DEFAULT_CONFIG: BOCDConfig = {
  hazardLambda: 60,
  minRunLength: 7,
  posteriorThreshold: 0.5,
};

// Max run length to track (prevents unbounded memory)
const MAX_RUN_LENGTH = 300;

// Standard wearable metrics to always check
const STANDARD_METRICS = ['hrv', 'deep_sleep_duration', 'resting_heart_rate', 'readiness_score', 'sleep_score'];

// ============================================================
// Core BOCD Algorithm (Single Stream)
// ============================================================

/**
 * Run Bayesian Online Changepoint Detection on a single time series.
 * Pure function — no side effects.
 *
 * Algorithm (Adams & MacKay 2007):
 * Maintains a run-length posterior R[r] using conjugate Normal-Inverse-Gamma
 * sufficient statistics. At each observation, computes:
 * 1. Student-t predictive probability for each run length
 * 2. Growth probability: R_new[r+1] = R[r] × pred(x|r) × (1 - 1/λ)
 * 3. Changepoint probability: R_new[0] = Σ R[r] × pred(x|r) × (1/λ)
 * 4. Normalize via logSumExp
 */
export function runBOCD(
  values: number[],
  dates: Date[],
  config: BOCDConfig = DEFAULT_CONFIG,
): ChangepointResult & { metricType: string } {
  const n = values.length;

  if (n < 14) {
    return {
      metricType: '',
      detected: false,
      detectedDate: null,
      posteriorProb: 0,
      credibleInterval: null,
      effectSize: null,
      preMean: n > 0 ? values.reduce((a, b) => a + b, 0) / n : 0,
      postMean: 0,
      confidenceLevel: 'low',
    };
  }

  const { hazardLambda, minRunLength, posteriorThreshold } = config;
  const logHazard = Math.log(1 / hazardLambda);
  const logOneMinusHazard = Math.log(1 - 1 / hazardLambda);

  // Normal-Inverse-Gamma sufficient statistics per run length
  // mu_0 = global mean, kappa_0 = 1, alpha_0 = 1, beta_0 = global variance
  const globalMean = values.reduce((a, b) => a + b, 0) / n;
  const globalVar = values.reduce((s, v) => s + (v - globalMean) ** 2, 0) / n;
  const beta0 = Math.max(globalVar, 1e-6);

  // State arrays: one entry per run length [0..maxR]
  // logR[r] = log P(r_t = r | x_{1:t})
  let logR = [0]; // Start with run length 0 (probability 1)

  // Sufficient statistics per run length
  let mu: number[] = [globalMean];
  let kappa: number[] = [1];
  let alpha: number[] = [1];
  let beta: number[] = [beta0];

  // Track changepoint posteriors over time
  const changepointProb: number[] = []; // P(r_t = 0) at each time step
  let bestChangepointIdx = -1;
  let bestChangepointProb = 0;

  for (let t = 0; t < n; t++) {
    const x = values[t];
    const maxR = Math.min(logR.length, MAX_RUN_LENGTH);

    // Predictive probabilities: Student-t for each run length
    const logPred = new Array(maxR);
    for (let r = 0; r < maxR; r++) {
      const nuR = 2 * alpha[r];
      const muR = mu[r];
      const sigmaR = Math.sqrt(beta[r] * (kappa[r] + 1) / (alpha[r] * kappa[r]));
      logPred[r] = studentTLogPDF(x, muR, sigmaR, nuR);
    }

    // Growth probabilities: log R_new[r+1] = log R[r] + log pred[r] + log(1 - H)
    const newLogR = new Array(maxR + 1);
    newLogR[0] = -Infinity; // Will be filled by changepoint

    for (let r = 0; r < maxR; r++) {
      newLogR[r + 1] = logR[r] + logPred[r] + logOneMinusHazard;
    }

    // Changepoint probability: log R_new[0] = logSumExp(log R[r] + log pred[r] + log H)
    const changepointTerms = new Array(maxR);
    for (let r = 0; r < maxR; r++) {
      changepointTerms[r] = logR[r] + logPred[r] + logHazard;
    }
    newLogR[0] = logSumExp(changepointTerms);

    // Normalize
    const logZ = logSumExp(newLogR);
    for (let r = 0; r <= maxR; r++) {
      newLogR[r] -= logZ;
    }

    // Update sufficient statistics
    const newMu = new Array(maxR + 1);
    const newKappa = new Array(maxR + 1);
    const newAlpha = new Array(maxR + 1);
    const newBeta = new Array(maxR + 1);

    // Run length 0: reset to prior
    newMu[0] = globalMean;
    newKappa[0] = 1;
    newAlpha[0] = 1;
    newBeta[0] = beta0;

    for (let r = 0; r < maxR; r++) {
      const kappaNew = kappa[r] + 1;
      newMu[r + 1] = (kappa[r] * mu[r] + x) / kappaNew;
      newKappa[r + 1] = kappaNew;
      newAlpha[r + 1] = alpha[r] + 0.5;
      newBeta[r + 1] = beta[r] + (kappa[r] * (x - mu[r]) ** 2) / (2 * kappaNew);
    }

    // Truncate to MAX_RUN_LENGTH
    const truncLen = Math.min(newLogR.length, MAX_RUN_LENGTH);
    logR = newLogR.slice(0, truncLen);
    mu = newMu.slice(0, truncLen);
    kappa = newKappa.slice(0, truncLen);
    alpha = newAlpha.slice(0, truncLen);
    beta = newBeta.slice(0, truncLen);

    // Record changepoint probability
    const cpProb = Math.exp(newLogR[0]);
    changepointProb.push(cpProb);

    // Track best changepoint (after minRunLength)
    if (t >= minRunLength && cpProb > bestChangepointProb) {
      bestChangepointProb = cpProb;
      bestChangepointIdx = t;
    }
  }

  // Detection
  const detected = bestChangepointProb >= posteriorThreshold && bestChangepointIdx >= minRunLength;

  if (!detected) {
    return {
      metricType: '',
      detected: false,
      detectedDate: null,
      posteriorProb: bestChangepointProb,
      credibleInterval: null,
      effectSize: null,
      preMean: globalMean,
      postMean: globalMean,
      confidenceLevel: 'low',
    };
  }

  // Credible interval: find 5th/95th percentile around detected changepoint
  // Look at changepoint probabilities in a window and find where cumulative mass is
  const windowStart = Math.max(0, bestChangepointIdx - 14);
  const windowEnd = Math.min(n - 1, bestChangepointIdx + 14);
  const windowProbs = changepointProb.slice(windowStart, windowEnd + 1);
  const windowSum = windowProbs.reduce((a, b) => a + b, 0);

  let ci5Idx = windowStart;
  let ci95Idx = windowEnd;
  if (windowSum > 0) {
    let cumSum = 0;
    for (let i = 0; i < windowProbs.length; i++) {
      cumSum += windowProbs[i] / windowSum;
      if (cumSum >= 0.05 && ci5Idx === windowStart) ci5Idx = windowStart + i;
      if (cumSum >= 0.95) { ci95Idx = windowStart + i; break; }
    }
  }

  // Effect size: Cohen's d between pre and post segments
  const preValues = values.slice(0, bestChangepointIdx);
  const postValues = values.slice(bestChangepointIdx);
  const preMean = preValues.reduce((a, b) => a + b, 0) / preValues.length;
  const postMean = postValues.reduce((a, b) => a + b, 0) / postValues.length;
  const preVar = preValues.reduce((s, v) => s + (v - preMean) ** 2, 0) / preValues.length;
  const postVar = postValues.reduce((s, v) => s + (v - postMean) ** 2, 0) / postValues.length;
  const pooledSD = Math.sqrt((preVar + postVar) / 2);
  const effectSize = pooledSD > 0 ? (postMean - preMean) / pooledSD : null;

  // Confidence level
  const confidenceLevel: 'high' | 'moderate' | 'low' =
    bestChangepointProb >= 0.8 && n >= 30 ? 'high' :
    bestChangepointProb >= 0.5 && n >= 14 ? 'moderate' : 'low';

  return {
    metricType: '',
    detected: true,
    detectedDate: dates[bestChangepointIdx],
    posteriorProb: +bestChangepointProb.toFixed(4),
    credibleInterval: {
      lo: dates[Math.max(0, ci5Idx)],
      hi: dates[Math.min(n - 1, ci95Idx)],
    },
    effectSize: effectSize !== null ? +effectSize.toFixed(3) : null,
    preMean: +preMean.toFixed(3),
    postMean: +postMean.toFixed(3),
    confidenceLevel,
  };
}

// ============================================================
// Multi-Stream Temporal Clustering
// ============================================================

function clusterChangepoints(
  results: ChangepointResult[],
  windowDays: number = 7,
): ClusteredChangepoint[] {
  const detected = results.filter(r => r.detected && r.detectedDate);
  if (detected.length === 0) return [];

  // Sort by detected date
  detected.sort((a, b) => a.detectedDate!.getTime() - b.detectedDate!.getTime());

  const clusters: ClusteredChangepoint[] = [];
  let currentCluster: ChangepointResult[] = [detected[0]];

  for (let i = 1; i < detected.length; i++) {
    const dayDiff = (detected[i].detectedDate!.getTime() - currentCluster[0].detectedDate!.getTime())
      / (1000 * 60 * 60 * 24);

    if (dayDiff <= windowDays) {
      currentCluster.push(detected[i]);
    } else {
      // Finalize current cluster
      clusters.push(finalizeCluster(currentCluster));
      currentCluster = [detected[i]];
    }
  }
  clusters.push(finalizeCluster(currentCluster));

  return clusters;
}

function finalizeCluster(items: ChangepointResult[]): ClusteredChangepoint {
  // Median date
  const sorted = items.map(i => i.detectedDate!.getTime()).sort((a, b) => a - b);
  const medianDate = new Date(sorted[Math.floor(sorted.length / 2)]);

  // Average posterior
  const avgPosterior = items.reduce((s, i) => s + i.posteriorProb, 0) / items.length;

  // Effect summary
  const effects = items
    .filter(i => i.effectSize !== null)
    .map(i => `${i.metricType}: d=${i.effectSize! > 0 ? '+' : ''}${i.effectSize!.toFixed(2)}`);

  return {
    date: medianDate,
    streams: items.map(i => i.metricType),
    clusterPosterior: +avgPosterior.toFixed(4),
    effectSummary: effects.join(', ') || 'Effect sizes not computed',
  };
}

// ============================================================
// Main Entry: Protocol Changepoint Detection
// ============================================================

export async function detectProtocolChangepoints(
  userId: string,
  protocolId: string,
  config?: Partial<BOCDConfig>,
): Promise<MultiStreamResult> {
  const mergedConfig = { ...DEFAULT_CONFIG, ...config };

  // Fetch protocol details
  const protocol = await prisma.protocol.findUnique({
    where: { id: protocolId },
    include: { peptide: true },
  });

  if (!protocol) {
    return { perStream: [], clusteredChangepoints: [], protocolAttribution: null };
  }

  const protocolStart = new Date(protocol.startDate);
  const peptideName = protocol.peptide?.name ?? '';

  // Determine which metrics to track
  const metricTypes = new Set<string>(STANDARD_METRICS);

  // Add protocol-specific wearable correlations from expectations
  const expectations = PROTOCOL_LAB_EXPECTATIONS[peptideName];
  if (expectations) {
    // The expected lab effects may have wearable correlations
    for (const effect of expectations.expectedLabEffects) {
      // Map common lab effects to wearable metrics
      if (effect.biomarkerKey === 'hs_crp') metricTypes.add('resting_heart_rate');
      if (effect.biomarkerKey === 'igf1') metricTypes.add('deep_sleep_duration');
      if (effect.biomarkerKey === 'fasting_glucose') metricTypes.add('hrv');
    }
  }

  // Fetch health metrics: 90 days before protocol start → today
  const dataStart = new Date(protocolStart.getTime() - 90 * 24 * 60 * 60 * 1000);
  const dataEnd = new Date();

  const metrics = await prisma.healthMetric.findMany({
    where: {
      userId,
      recordedAt: { gte: dataStart, lte: dataEnd },
      metricType: { in: Array.from(metricTypes) },
    },
    orderBy: { recordedAt: 'asc' },
  });

  // Group by metric type and aggregate to daily values
  const byMetric = new Map<string, Map<string, number[]>>();
  for (const m of metrics) {
    if (!byMetric.has(m.metricType)) byMetric.set(m.metricType, new Map());
    const dayKey = m.recordedAt.toISOString().split('T')[0];
    const dayMap = byMetric.get(m.metricType)!;
    if (!dayMap.has(dayKey)) dayMap.set(dayKey, []);
    dayMap.get(dayKey)!.push(m.value);
  }

  // Run BOCD on each stream
  const perStream: ChangepointResult[] = [];

  for (const [metricType, dayMap] of byMetric) {
    // Aggregate: daily mean
    const sortedDays = Array.from(dayMap.keys()).sort();
    if (sortedDays.length < 14) continue;

    const values = sortedDays.map(d => {
      const vals = dayMap.get(d)!;
      return vals.reduce((a, b) => a + b, 0) / vals.length;
    });
    const dates = sortedDays.map(d => new Date(d));

    const result = runBOCD(values, dates, mergedConfig);
    result.metricType = metricType;
    perStream.push(result);
  }

  // Cluster changepoints across streams
  const clusteredChangepoints = clusterChangepoints(perStream);

  // Protocol attribution
  let protocolAttribution: MultiStreamResult['protocolAttribution'] = null;

  if (clusteredChangepoints.length > 0) {
    // Find the cluster closest to the expected onset
    const expectedOnsetWeeks = expectations?.expectedLabEffects?.[0]?.onsetWeeks?.min ?? 4;
    const expectedOnsetDate = new Date(protocolStart.getTime() + expectedOnsetWeeks * 7 * 24 * 60 * 60 * 1000);

    let closestCluster = clusteredChangepoints[0];
    let minDelay = Math.abs(closestCluster.date.getTime() - expectedOnsetDate.getTime());

    for (const cluster of clusteredChangepoints) {
      const delay = Math.abs(cluster.date.getTime() - expectedOnsetDate.getTime());
      if (delay < minDelay) {
        minDelay = delay;
        closestCluster = cluster;
      }
    }

    const delayDays = Math.round((closestCluster.date.getTime() - protocolStart.getTime()) / (1000 * 60 * 60 * 24));
    const expectedDays = expectedOnsetWeeks * 7;
    const alignment: 'aligned' | 'delayed' | 'unaligned' =
      Math.abs(delayDays - expectedDays) <= 14 ? 'aligned' :
      delayDays > expectedDays ? 'delayed' : 'unaligned';

    protocolAttribution = {
      protocolId,
      protocolName: peptideName,
      changepointAlignment: alignment,
      delayDays,
    };
  } else {
    const anyDetected = perStream.some(r => r.detected);
    protocolAttribution = {
      protocolId,
      protocolName: peptideName,
      changepointAlignment: anyDetected ? 'unaligned' : 'no_changepoint',
      delayDays: null,
    };
  }

  // Cache results to BayesianChangepoint table
  for (const result of perStream) {
    if (!result.detected || !result.detectedDate) continue;

    try {
      await prisma.bayesianChangepoint.create({
        data: {
          userId,
          protocolId,
          metricType: result.metricType,
          detectedDate: result.detectedDate,
          posteriorProb: result.posteriorProb,
          credibleIntervalLo: result.credibleInterval?.lo ?? result.detectedDate,
          credibleIntervalHi: result.credibleInterval?.hi ?? result.detectedDate,
          effectSize: result.effectSize,
          preMean: result.preMean,
          postMean: result.postMean,
          runLength: null,
          confidenceLevel: result.confidenceLevel,
          multiStreamCluster: clusteredChangepoints.length > 0
            ? JSON.stringify(clusteredChangepoints.find(c => c.streams.includes(result.metricType)))
            : null,
        },
      });
    } catch {
      // Non-critical: caching failure shouldn't block response
    }
  }

  return { perStream, clusteredChangepoints, protocolAttribution };
}
