// Protocol Safety Monitor
// Cross-references active protocol safety markers against lab results
// and wearable proxy signals. Runs at lab upload AND weekly review.
//
// Core principle: NEVER alarmist. Graduated severity, confidence-weighted.
// All alerts include "discuss with provider" framing.

import { prisma } from './prisma'
import {
  getSafetyMarkersForProtocol,
  getLabExpectationsForProtocol,
  type SafetyMarker,
} from './protocol-lab-expectations'
import { normalizeProtocolName } from './supplement-normalization'
import { differenceInDays, subDays } from 'date-fns'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface SafetyAlert {
  protocolId: string
  protocolName: string
  alertType: 'lab_safety' | 'wearable_proxy'
  severity: 'warning' | 'critical'
  biomarkerKey?: string
  wearableMetric?: string
  currentValue: number
  threshold: number
  direction: string
  explanation: string
  recommendation: string
  detectedAt: string
}

export interface SafetyMonitorResult {
  alerts: SafetyAlert[]
  protocolsChecked: number
  markersChecked: number
  allClear: boolean
}

// ─── Main Function ───────────────────────────────────────────────────────────

/**
 * Run safety monitoring for all active protocols.
 * Checks lab biomarkers against safety thresholds and monitors wearable proxies.
 */
export async function runSafetyMonitor(
  userId: string
): Promise<SafetyMonitorResult> {
  const alerts: SafetyAlert[] = []
  let markersChecked = 0

  // 1. Fetch active protocols with peptide names
  const activeProtocols = await prisma.protocol.findMany({
    where: { userId, status: 'active' },
    include: { peptide: { select: { name: true, canonicalName: true } } },
  })

  if (activeProtocols.length === 0) {
    return { alerts: [], protocolsChecked: 0, markersChecked: 0, allClear: true }
  }

  // 2. Fetch latest lab upload with biomarkers
  const latestUpload = await prisma.labUpload.findFirst({
    where: { userId },
    orderBy: { testDate: 'desc' },
    include: { biomarkers: true },
  })

  // Build biomarker lookup map from latest upload
  const labMap = new Map<string, { value: number; unit: string }>()
  if (latestUpload?.biomarkers) {
    for (const b of latestUpload.biomarkers) {
      labMap.set(b.biomarkerKey, { value: b.value, unit: b.unit })
    }
  }

  // 3. Check each protocol against safety markers
  for (const protocol of activeProtocols) {
    const protocolName = protocol.peptide.canonicalName || protocol.peptide.name
    const safetyMarkers = getSafetyMarkersForProtocol(protocolName)

    for (const marker of safetyMarkers) {
      markersChecked++
      const labValue = labMap.get(marker.biomarkerKey)
      if (!labValue) continue

      const triggered = checkThreshold(labValue.value, marker.alertThreshold)
      if (triggered) {
        const weeksSinceStart = Math.floor(
          differenceInDays(new Date(), protocol.startDate) / 7
        )

        alerts.push({
          protocolId: protocol.id,
          protocolName: protocolName,
          alertType: 'lab_safety',
          severity: marker.severity,
          biomarkerKey: marker.biomarkerKey,
          currentValue: labValue.value,
          threshold: marker.alertThreshold.value,
          direction: marker.alertThreshold.direction,
          explanation: buildLabSafetyExplanation(marker, labValue.value, protocolName, weeksSinceStart),
          recommendation: marker.explanation,
          detectedAt: new Date().toISOString(),
        })
      }
    }
  }

  // 4. Check wearable proxies for all active protocols
  const wearableAlerts = await checkWearableProxies(userId, activeProtocols)
  alerts.push(...wearableAlerts)

  // Sort: critical first, then warning
  alerts.sort((a, b) => {
    if (a.severity === 'critical' && b.severity !== 'critical') return -1
    if (a.severity !== 'critical' && b.severity === 'critical') return 1
    return 0
  })

  return {
    alerts,
    protocolsChecked: activeProtocols.length,
    markersChecked,
    allClear: alerts.length === 0,
  }
}

// ─── Threshold Check ─────────────────────────────────────────────────────────

function checkThreshold(
  value: number,
  threshold: { direction: 'above' | 'below'; value: number }
): boolean {
  if (threshold.direction === 'above') return value > threshold.value
  return value < threshold.value
}

// ─── Lab Safety Explanation Builder ──────────────────────────────────────────

function buildLabSafetyExplanation(
  marker: SafetyMarker,
  currentValue: number,
  protocolName: string,
  weeksSinceStart: number
): string {
  const directionWord = marker.alertThreshold.direction === 'above' ? 'above' : 'below'
  const thresholdStr = marker.alertThreshold.value.toString()

  return `${marker.displayName} at ${currentValue} (${directionWord} monitoring threshold of ${thresholdStr}) since starting ${protocolName} ${weeksSinceStart} weeks ago. ${marker.explanation}`
}

// ─── Wearable Proxy Monitoring ───────────────────────────────────────────────

interface ActiveProtocol {
  id: string
  startDate: Date
  peptide: { name: string; canonicalName: string | null }
}

async function checkWearableProxies(
  userId: string,
  protocols: ActiveProtocol[]
): Promise<SafetyAlert[]> {
  const alerts: SafetyAlert[] = []

  // Get 7-day and 28-day HRV averages
  const [recentHRV, baselineHRV] = await Promise.all([
    getMetricAverage(userId, 'hrv', 7),
    getMetricAverage(userId, 'hrv', 28),
  ])

  // Get 7-day and 28-day RHR averages
  const [recentRHR, baselineRHR] = await Promise.all([
    getMetricAverage(userId, 'resting_heart_rate', 7),
    getMetricAverage(userId, 'resting_heart_rate', 28),
  ])

  // Check for HRV crash (>20% decline from 28-day baseline)
  const hrvCrash = recentHRV !== null && baselineHRV !== null && baselineHRV > 0
    && ((baselineHRV - recentHRV) / baselineHRV) > 0.20

  // Check for RHR spike (>10% increase from 28-day baseline)
  const rhrSpike = recentRHR !== null && baselineRHR !== null && baselineRHR > 0
    && ((recentRHR - baselineRHR) / baselineRHR) > 0.10

  // If both HRV crash AND RHR spike, flag for each active protocol
  if (hrvCrash && rhrSpike) {
    for (const protocol of protocols) {
      const protocolName = protocol.peptide.canonicalName || protocol.peptide.name
      const weeksSinceStart = Math.floor(
        differenceInDays(new Date(), protocol.startDate) / 7
      )

      alerts.push({
        protocolId: protocol.id,
        protocolName,
        alertType: 'wearable_proxy',
        severity: 'warning',
        wearableMetric: 'hrv + resting_heart_rate',
        currentValue: recentHRV!,
        threshold: baselineHRV!,
        direction: 'decline',
        explanation: `Recovery metrics have declined significantly over the past 7 days while on ${protocolName} (week ${weeksSinceStart}). HRV dropped ${Math.round(((baselineHRV! - recentHRV!) / baselineHRV!) * 100)}% from your baseline and resting heart rate increased ${Math.round(((recentRHR! - baselineRHR!) / baselineRHR!) * 100)}%.`,
        recommendation: 'Recovery metrics can decline for many reasons (stress, illness, overtraining). If this persists, consider discussing with your provider whether the current protocol may be a factor.',
        detectedAt: new Date().toISOString(),
      })
    }
  }
  // Also flag HRV crash alone (less urgent)
  else if (hrvCrash) {
    for (const protocol of protocols) {
      const protocolName = protocol.peptide.canonicalName || protocol.peptide.name
      const weeksSinceStart = Math.floor(
        differenceInDays(new Date(), protocol.startDate) / 7
      )

      alerts.push({
        protocolId: protocol.id,
        protocolName,
        alertType: 'wearable_proxy',
        severity: 'warning',
        wearableMetric: 'hrv',
        currentValue: recentHRV!,
        threshold: baselineHRV!,
        direction: 'decline',
        explanation: `HRV has declined ${Math.round(((baselineHRV! - recentHRV!) / baselineHRV!) * 100)}% from your 28-day baseline while on ${protocolName} (week ${weeksSinceStart}).`,
        recommendation: 'HRV declines can have many causes. Monitor over the next week and consider discussing with your provider if the trend continues.',
        detectedAt: new Date().toISOString(),
      })
    }
  }

  return alerts
}

// ─── Metric Average Helper ───────────────────────────────────────────────────

async function getMetricAverage(
  userId: string,
  metricType: string,
  windowDays: number
): Promise<number | null> {
  const since = subDays(new Date(), windowDays)

  const metrics = await prisma.healthMetric.findMany({
    where: {
      userId,
      metricType,
      recordedAt: { gte: since },
    },
    select: { value: true },
  })

  if (metrics.length < 3) return null // Need sufficient data

  const sum = metrics.reduce((acc, m) => acc + m.value, 0)
  return sum / metrics.length
}
