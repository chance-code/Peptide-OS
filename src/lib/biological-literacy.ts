// Biological Literacy Engine
// Manages user literacy tier (explorer → scientist) and renders content per level

import prisma from '@/lib/prisma'

export type LiteracyLevel = 'explorer' | 'student' | 'practitioner' | 'scientist'

export interface LiteracyRecord {
  id: string
  userId: string
  level: LiteracyLevel
  selfSelected: boolean
  detailTaps: number
  labViewCount: number
  insightViews: number
  lastLevelChange: string | null
}

export type EngagementAction = 'detail_tap' | 'lab_view' | 'insight_view'

// ─── Database Operations ──────────────────────────────────────────────────

export async function getLiteracyLevel(userId: string): Promise<LiteracyRecord> {
  let record = await prisma.userBiologicalLiteracy.findUnique({
    where: { userId },
  })

  if (!record) {
    record = await prisma.userBiologicalLiteracy.create({
      data: { userId, level: 'explorer' },
    })
  }

  return {
    id: record.id,
    userId: record.userId,
    level: record.level as LiteracyLevel,
    selfSelected: record.selfSelected,
    detailTaps: record.detailTaps,
    labViewCount: record.labViewCount,
    insightViews: record.insightViews,
    lastLevelChange: record.lastLevelChange?.toISOString() ?? null,
  }
}

export async function setLiteracyLevel(
  userId: string,
  level: LiteracyLevel,
  selfSelected: boolean = false,
): Promise<LiteracyRecord> {
  const record = await prisma.userBiologicalLiteracy.upsert({
    where: { userId },
    update: { level, selfSelected, lastLevelChange: new Date() },
    create: { userId, level, selfSelected, lastLevelChange: new Date() },
  })

  return {
    id: record.id,
    userId: record.userId,
    level: record.level as LiteracyLevel,
    selfSelected: record.selfSelected,
    detailTaps: record.detailTaps,
    labViewCount: record.labViewCount,
    insightViews: record.insightViews,
    lastLevelChange: record.lastLevelChange?.toISOString() ?? null,
  }
}

export async function updateEngagement(
  userId: string,
  action: EngagementAction,
): Promise<LiteracyRecord> {
  const incrementField =
    action === 'detail_tap' ? 'detailTaps'
      : action === 'lab_view' ? 'labViewCount'
        : 'insightViews'

  const record = await prisma.userBiologicalLiteracy.upsert({
    where: { userId },
    update: { [incrementField]: { increment: 1 } },
    create: { userId, level: 'explorer', [incrementField]: 1 },
  })

  // Check auto-progression (only if not self-selected)
  if (!record.selfSelected) {
    const newLevel = computeAutoProgression(record)
    if (newLevel && newLevel !== record.level) {
      return setLiteracyLevel(userId, newLevel, false)
    }
  }

  return {
    id: record.id,
    userId: record.userId,
    level: record.level as LiteracyLevel,
    selfSelected: record.selfSelected,
    detailTaps: record.detailTaps,
    labViewCount: record.labViewCount,
    insightViews: record.insightViews,
    lastLevelChange: record.lastLevelChange?.toISOString() ?? null,
  }
}

// ─── Auto-Progression ─────────────────────────────────────────────────────

function computeAutoProgression(record: {
  level: string
  detailTaps: number
  labViewCount: number
  insightViews: number
  createdAt: Date
  lastLevelChange: Date | null
}): LiteracyLevel | null {
  const { level, detailTaps, labViewCount, createdAt, lastLevelChange } = record
  const weeksOnLevel = (Date.now() - (lastLevelChange ?? createdAt).getTime()) / (7 * 86400000)

  // Explorer → Student: 5+ insight taps, 3+ domain views, 2+ weeks
  if (level === 'explorer' && detailTaps >= 5 && labViewCount >= 3 && weeksOnLevel >= 2) {
    return 'student'
  }

  // Student → Practitioner: 15+ detail taps, 3+ lab views, 6+ weeks
  if (level === 'student' && detailTaps >= 15 && labViewCount >= 3 && weeksOnLevel >= 6) {
    return 'practitioner'
  }

  // Practitioner → Scientist: self-select only OR 12+ weeks with extensive engagement
  if (level === 'practitioner' && detailTaps >= 50 && labViewCount >= 10 && weeksOnLevel >= 12) {
    return 'scientist'
  }

  return null
}

// ─── Content Rendering ────────────────────────────────────────────────────

export interface DomainSummaryData {
  domain: string
  displayName: string
  score?: number
  trend?: 'improving' | 'stable' | 'declining'
  topMarker?: string
  topMarkerDelta?: number
  trajectoryPerQuarter?: number
  confidenceInterval?: { low: number; high: number }
}

export function renderDomainSummary(level: LiteracyLevel, data: DomainSummaryData): string {
  const { displayName, score, trend, topMarker, topMarkerDelta, trajectoryPerQuarter, confidenceInterval } = data
  const trendLabel = trend === 'improving' ? 'improving' : trend === 'declining' ? 'needs attention' : 'steady'

  switch (level) {
    case 'explorer':
      return `${displayName}: ${trendLabel}`

    case 'student': {
      if (topMarker && topMarkerDelta !== undefined) {
        const dir = topMarkerDelta > 0 ? 'improved' : 'shifted'
        return `Your ${displayName.toLowerCase()} markers ${dir} — ${topMarker} changed ${Math.abs(topMarkerDelta).toFixed(0)}%`
      }
      return `${displayName}: ${trendLabel}`
    }

    case 'practitioner': {
      const parts = [displayName]
      if (score !== undefined) parts.push(`score ${score}/100`)
      if (topMarker && topMarkerDelta !== undefined) {
        parts.push(`${topMarker} ${topMarkerDelta > 0 ? '+' : ''}${topMarkerDelta.toFixed(1)}%`)
      }
      if (trajectoryPerQuarter !== undefined) {
        parts.push(`trajectory ${trajectoryPerQuarter > 0 ? '+' : ''}${trajectoryPerQuarter.toFixed(1)}/quarter`)
      }
      return parts.join(' · ')
    }

    case 'scientist': {
      const parts = [displayName]
      if (score !== undefined) parts.push(`score ${score}/100`)
      if (trajectoryPerQuarter !== undefined) {
        let ciStr = ''
        if (confidenceInterval) {
          ciStr = ` (95% CI: ${confidenceInterval.low.toFixed(1)} to ${confidenceInterval.high.toFixed(1)})`
        }
        parts.push(`trajectory ${trajectoryPerQuarter > 0 ? '+' : ''}${trajectoryPerQuarter.toFixed(1)}/quarter${ciStr}`)
      }
      return parts.join(' · ')
    }
  }
}

export interface BiomarkerChangeData {
  displayName: string
  shortName?: string
  value: number
  unit: string
  previousValue?: number
  optimalMax?: number
  longevityTarget?: string
  trajectoryPerQuarter?: number
  confidenceInterval?: { low: number; high: number }
}

export function renderBiomarkerChange(level: LiteracyLevel, data: BiomarkerChangeData): string {
  const { displayName, shortName, value, unit, previousValue, optimalMax, longevityTarget, trajectoryPerQuarter, confidenceInterval } = data
  const name = shortName ?? displayName

  switch (level) {
    case 'explorer': {
      if (previousValue !== undefined) {
        const dir = value > previousValue ? 'went up' : value < previousValue ? 'went down' : 'stayed the same'
        return `${name} ${dir}`
      }
      return `${name}: ${value} ${unit}`
    }

    case 'student': {
      if (previousValue !== undefined) {
        const pctChange = ((value - previousValue) / Math.abs(previousValue)) * 100
        const dir = pctChange > 0 ? 'up' : 'down'
        return `${name} is ${dir} ${Math.abs(pctChange).toFixed(0)}% to ${value} ${unit}`
      }
      return `${name}: ${value} ${unit}`
    }

    case 'practitioner': {
      const parts = [`${name} ${value} ${unit}`]
      if (longevityTarget) parts.push(`(${longevityTarget})`)
      if (previousValue !== undefined) parts.push(`from ${previousValue}`)
      if (trajectoryPerQuarter !== undefined) {
        parts.push(`trajectory ${trajectoryPerQuarter > 0 ? '+' : ''}${trajectoryPerQuarter.toFixed(1)}/quarter`)
      }
      return parts.join(', ')
    }

    case 'scientist': {
      const parts = [`${name} ${value} ${unit}`]
      if (longevityTarget) parts.push(`(${longevityTarget})`)
      if (previousValue !== undefined) parts.push(`prev ${previousValue}`)
      if (trajectoryPerQuarter !== undefined) {
        let ciStr = ''
        if (confidenceInterval) {
          ciStr = ` (95% CI: ${confidenceInterval.low.toFixed(1)} to ${confidenceInterval.high.toFixed(1)})`
        }
        parts.push(`Δ ${trajectoryPerQuarter > 0 ? '+' : ''}${trajectoryPerQuarter.toFixed(1)}/q${ciStr}`)
      }
      return parts.join(' · ')
    }
  }
}
