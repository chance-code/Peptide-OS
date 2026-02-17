// ─── Rich Health Context Builder for Chat ────────────────────────────────────
// Assembles comprehensive health data for the AI copilot, replacing the
// impoverished protocol-only context previously used in route.ts.

import prisma from '@/lib/prisma'
import { subDays, startOfDay, endOfDay, differenceInDays } from 'date-fns'
import { getLatestSnapshot, type BrainOutput } from '@/lib/health-brain'
import { computePremiumEvidence, type PremiumProtocolEvidence } from '@/lib/health-evidence-engine'
import { calculateHealthTrends, calculateHealthScore, type HealthTrend, type HealthScore } from '@/lib/health-synthesis'
import { getDailyStatus, type DailyStatus } from '@/lib/health-daily-status'
import { BIOMARKER_REGISTRY, computeFlag } from '@/lib/lab-biomarker-contract'

// ─── Types ───────────────────────────────────────────────────────────────────

interface LabBiomarkerRow {
  biomarkerKey: string
  value: number
  unit: string
  flag: string
  rangeLow?: number | null
  rangeHigh?: number | null
}

interface RichHealthContext {
  userContext: string       // Full formatted context string for the AI system prompt
  hasBrainData: boolean     // Whether HealthBrain snapshot was available
  hasEvidenceData: boolean  // Whether protocol evidence was computed
  dataCompleteness: number  // 0-100 % of expected data available
}

// ─── Main Builder ────────────────────────────────────────────────────────────

export async function buildRichHealthContext(userId: string): Promise<RichHealthContext> {
  const today = new Date()
  const thirtyDaysAgo = subDays(today, 30)

  // ── Parallel fetch: existing data + new health engines ──
  const [
    protocols,
    user,
    inventory,
    recentDoses,
    labUpload,
    labResult,
    brainSnapshot,
    dailyStatus,
    healthTrends,
    healthScore,
    protocolEvidence,
  ] = await Promise.all([
    // Existing data (from original route.ts)
    prisma.protocol.findMany({
      where: { userId },
      include: { peptide: true },
    }),
    prisma.userProfile.findUnique({
      where: { id: userId },
    }),
    prisma.inventoryVial.findMany({
      where: { userId },
      include: { peptide: true },
    }),
    prisma.doseLog.findMany({
      where: {
        userId,
        scheduledDate: { gte: thirtyDaysAgo },
      },
      include: {
        protocol: { include: { peptide: true } },
      },
      orderBy: { scheduledDate: 'desc' },
    }),
    prisma.labUpload.findFirst({
      where: { userId },
      orderBy: { testDate: 'desc' },
      include: { biomarkers: true },
    }),
    prisma.labResult.findFirst({
      where: { userId },
      orderBy: { testDate: 'desc' },
    }),
    // New health engine data
    safeGetBrainSnapshot(userId),
    safeGetDailyStatus(userId),
    safeGetHealthTrends(userId),
    safeGetHealthScore(userId),
    safeGetProtocolEvidence(userId),
  ])

  // ── Build sections ──
  const sections: string[] = []

  // 1. User basics
  sections.push(buildUserSection(user, today, recentDoses))

  // 2. Active protocols with evidence verdicts
  sections.push(buildProtocolsSection(protocols, protocolEvidence))

  // 3. Adherence
  sections.push(buildAdherenceSection(recentDoses, today))

  // 4. Health state (from Brain snapshot)
  if (brainSnapshot) {
    sections.push(buildBrainSection(brainSnapshot))
  }

  // 5. Daily status
  if (dailyStatus) {
    sections.push(buildDailyStatusSection(dailyStatus))
  }

  // 6. Health trends (top movers)
  if (healthTrends && healthTrends.length > 0) {
    sections.push(buildTrendsSection(healthTrends))
  }

  // 7. Health score
  if (healthScore) {
    sections.push(buildScoreSection(healthScore))
  }

  // 8. Lab context
  sections.push(buildLabContext(labUpload, labResult))

  // 9. Nutrition (energy balance from wearable data)
  const nutritionSection = await buildNutritionSection(userId, today)
  if (nutritionSection) {
    sections.push(nutritionSection)
  }

  // 10. Inventory
  sections.push(buildInventorySection(inventory, today))

  // 11. Action items (from Brain)
  if (brainSnapshot?.actionItems && brainSnapshot.actionItems.length > 0) {
    sections.push(buildActionItemsSection(brainSnapshot.actionItems))
  }

  return {
    userContext: sections.filter(s => s.length > 0).join('\n\n'),
    hasBrainData: brainSnapshot !== null,
    hasEvidenceData: protocolEvidence !== null && protocolEvidence.length > 0,
    dataCompleteness: brainSnapshot?.dataCompleteness ?? 0,
  }
}

// ─── Safe Wrappers (graceful degradation) ────────────────────────────────────

async function safeGetBrainSnapshot(userId: string): Promise<BrainOutput | null> {
  try {
    return await getLatestSnapshot(userId)
  } catch (e) {
    console.warn('[Chat] Brain snapshot unavailable:', (e as Error).message)
    return null
  }
}

async function safeGetDailyStatus(userId: string): Promise<DailyStatus | null> {
  try {
    return await getDailyStatus(userId)
  } catch (e) {
    console.warn('[Chat] Daily status unavailable:', (e as Error).message)
    return null
  }
}

async function safeGetHealthTrends(userId: string): Promise<HealthTrend[] | null> {
  try {
    return await calculateHealthTrends(userId)
  } catch (e) {
    console.warn('[Chat] Health trends unavailable:', (e as Error).message)
    return null
  }
}

async function safeGetHealthScore(userId: string): Promise<HealthScore | null> {
  try {
    return await calculateHealthScore(userId)
  } catch (e) {
    console.warn('[Chat] Health score unavailable:', (e as Error).message)
    return null
  }
}

async function safeGetProtocolEvidence(userId: string): Promise<PremiumProtocolEvidence[] | null> {
  try {
    return await computePremiumEvidence(userId)
  } catch (e) {
    console.warn('[Chat] Protocol evidence unavailable:', (e as Error).message)
    return null
  }
}

// ─── Section Builders ────────────────────────────────────────────────────────

function buildUserSection(
  user: { name: string | null } | null,
  today: Date,
  recentDoses: Array<{
    scheduledDate: Date
    status: string
    protocol: { peptide: { name: string } }
  }>
): string {
  const todaysDoses = recentDoses.filter(d => {
    const doseDate = new Date(d.scheduledDate)
    return doseDate >= startOfDay(today) && doseDate <= endOfDay(today)
  })
  const todayCompleted = todaysDoses.filter(d => d.status === 'completed').length
  const todayTotal = todaysDoses.length

  let section = `User: ${user?.name || 'Unknown'}`
  if (todayTotal > 0) {
    section += `\nToday: ${todayCompleted}/${todayTotal} doses done`
    section += '\n' + todaysDoses.map(d => `  ${d.protocol.peptide.name}: ${d.status}`).join('\n')
  } else {
    section += '\nToday: No doses scheduled'
  }
  return section
}

function buildProtocolsSection(
  protocols: Array<{
    status: string
    peptide: { name: string }
    doseAmount: number
    doseUnit: string
    frequency: string
    customDays: string | null
    timing: string | null
    notes: string | null
    startDate: Date
    endDate: Date | null
  }>,
  evidence: PremiumProtocolEvidence[] | null
): string {
  const active = protocols.filter(p => p.status === 'active')
  if (active.length === 0) return 'Active protocols: None'

  const evidenceMap = new Map<string, PremiumProtocolEvidence>()
  if (evidence) {
    for (const e of evidence) {
      evidenceMap.set(e.protocolName.toLowerCase(), e)
    }
  }

  const lines = active.map(p => {
    const days = p.customDays ? JSON.parse(p.customDays).join(', ') : p.frequency
    let line = `  ${p.peptide.name} ${p.doseAmount}${p.doseUnit} ${days} ${p.timing || ''}`.trim()

    // Add duration
    const daysOn = differenceInDays(new Date(), new Date(p.startDate))
    line += ` (${daysOn}d on protocol`
    if (p.endDate) {
      const daysLeft = differenceInDays(new Date(p.endDate), new Date())
      line += `, ${daysLeft}d remaining`
    }
    line += ')'

    // Add evidence verdict if available
    const ev = evidenceMap.get(p.peptide.name.toLowerCase())
    if (ev) {
      line += `\n    Evidence: ${ev.verdict} (${ev.verdictScore}/100)`
      if (ev.effects.primary) {
        const effect = ev.effects.primary
        const direction = effect.interpretation.isImprovement ? 'improving' : 'declining'
        line += ` | Primary effect: ${effect.metricName} ${direction} (${effect.change.percent > 0 ? '+' : ''}${effect.change.percent.toFixed(1)}%)`
      }
      if (ev.effects.mechanisms.length > 0) {
        line += `\n    Mechanisms: ${ev.effects.mechanisms.map(m => m.name).join(', ')}`
      }
      line += `\n    Phase: ${ev.rampPhase} (${ev.rampExplanation})`
    }

    if (p.notes) line += `\n    Notes: ${p.notes}`
    return line
  })

  const past = protocols.filter(p => p.status !== 'active')
  const pastLine = past.length > 0
    ? `\nPast protocols: ${past.map(p => `${p.peptide.name} (${p.status})`).join('; ')}`
    : ''

  return `Active protocols:\n${lines.join('\n')}${pastLine}`
}

function buildAdherenceSection(
  recentDoses: Array<{ status: string }>,
  today: Date
): string {
  const totalDoses = recentDoses.length
  const completedDoses = recentDoses.filter(d => d.status === 'completed').length
  const skippedDoses = recentDoses.filter(d => d.status === 'skipped').length
  const adherenceRate = totalDoses > 0 ? Math.round((completedDoses / totalDoses) * 100) : 0

  return `30-day adherence: ${adherenceRate}% (${completedDoses}/${totalDoses} completed, ${skippedDoses} skipped)`
}

function buildBrainSection(brain: BrainOutput): string {
  const lines: string[] = ['Health State (HealthBrain analysis):']

  // Domain assessments
  const domains = brain.domains
  if (domains && Object.keys(domains).length > 0) {
    for (const [name, domain] of Object.entries(domains)) {
      const score = domain.score != null ? `${Math.round(domain.score)}/100` : 'insufficient data'
      const trend = domain.trend || 'unknown'
      const confidence = domain.confidence || 'unknown'
      let line = `  ${name}: ${score} (${trend}, ${confidence} confidence)`

      // Add top signals
      if (domain.topSignals && domain.topSignals.length > 0) {
        const signals = domain.topSignals.slice(0, 3).map((s: { metric: string; value: number; vsBaseline: string; percentDiff: number }) => {
          const dir = s.percentDiff > 0 ? `+${s.percentDiff.toFixed(0)}%` : `${s.percentDiff.toFixed(0)}%`
          return `${s.metric} (${dir} vs baseline)`
        }).join(', ')
        line += `\n    Drivers: ${signals}`
      }

      // Add narrative
      if (domain.narrative) {
        line += `\n    Summary: ${domain.narrative}`
      }

      lines.push(line)
    }
  }

  // Aging velocity
  if (brain.agingVelocity) {
    const velocity = brain.agingVelocity
    const velScore = velocity.overallVelocity != null ? velocity.overallVelocity.toFixed(2) : 'N/A'
    const daysGained = velocity.daysGainedAnnually != null ? `, ${velocity.daysGainedAnnually.toFixed(1)} days gained/yr` : ''
    lines.push(`  Aging velocity: ${velScore} (${velocity.trend || 'unknown'}, ${velocity.confidence || 'unknown'} confidence${daysGained})`)
  }

  // Allostasis (stress load)
  if (brain.allostasis) {
    const allo = brain.allostasis
    lines.push(`  Stress load: ${allo.load || 'unknown'} (trajectory: ${allo.trajectory || 'unknown'}, score: ${allo.score})`)
  }

  // System confidence + data completeness
  lines.push(`  Data completeness: ${Math.round(brain.dataCompleteness)}%`)
  if (brain.systemConfidence) {
    lines.push(`  System confidence: ${brain.systemConfidence.level || 'unknown'}`)
  }

  return lines.join('\n')
}

function buildDailyStatusSection(status: DailyStatus): string {
  const lines: string[] = [`Today's status: ${status.title}`]

  if (status.subtitle) {
    lines.push(`  ${status.subtitle}`)
  }

  if (status.recommendation) {
    lines.push(`  Recommendation: ${status.recommendation}`)
  }

  // Key signals
  if (status.signals && status.signals.length > 0) {
    const signalLines = status.signals.slice(0, 5).map(s => {
      const diff = s.percent_diff > 0 ? `+${s.percent_diff.toFixed(0)}%` : `${s.percent_diff.toFixed(0)}%`
      return `  ${s.metric}: ${s.value} ${s.unit} (${diff} vs baseline)`
    })
    lines.push(...signalLines)
  }

  // Yesterday evaluation
  if (status.evaluation) {
    const ev = status.evaluation
    lines.push(`  Yesterday: ${ev.yesterdayStatus} → ${ev.improved ? 'improved' : 'not improved'} today`)
  }

  return lines.join('\n')
}

function buildTrendsSection(trends: HealthTrend[]): string {
  // Show top 7 most significant trends
  const sorted = [...trends]
    .filter(t => t.confidence !== 'low')
    .sort((a, b) => Math.abs(b.changePercent) - Math.abs(a.changePercent))
    .slice(0, 7)

  if (sorted.length === 0) return ''

  const lines: string[] = ['Key health trends (30-day):']
  for (const t of sorted) {
    const arrow = t.trend === 'improving' ? '↑' : t.trend === 'declining' ? '↓' : '→'
    const pct = t.changePercent > 0 ? `+${t.changePercent.toFixed(1)}%` : `${t.changePercent.toFixed(1)}%`
    lines.push(`  ${arrow} ${t.displayName}: ${t.currentValue.toFixed(1)} (${pct}, ${t.momentum}, ${t.confidence} confidence)`)
  }

  return lines.join('\n')
}

function buildScoreSection(score: HealthScore): string {
  const parts: string[] = []
  if (score.overall != null) parts.push(`Overall: ${Math.round(score.overall)}/100`)
  if (score.sleep != null) parts.push(`Sleep: ${Math.round(score.sleep)}`)
  if (score.recovery != null) parts.push(`Recovery: ${Math.round(score.recovery)}`)
  if (score.activity != null) parts.push(`Activity: ${Math.round(score.activity)}`)
  if (score.bodyComp != null) parts.push(`Body Comp: ${Math.round(score.bodyComp)}`)

  if (parts.length === 0) return ''
  return `Health scores: ${parts.join(' | ')}`
}

function buildLabContext(
  labUpload: { testDate: Date; labName: string | null; biomarkers: LabBiomarkerRow[] } | null,
  labResult: { testDate: Date; labName: string | null; markers: string } | null
): string {
  let biomarkers: LabBiomarkerRow[] = []
  let testDate: Date | null = null
  let labName: string | null = null

  if (labUpload && labUpload.biomarkers.length > 0) {
    biomarkers = labUpload.biomarkers
    testDate = labUpload.testDate
    labName = labUpload.labName
  } else if (labResult) {
    testDate = labResult.testDate
    labName = labResult.labName
    try {
      const raw = JSON.parse(labResult.markers) as Array<{
        name?: string; displayName?: string; value?: number; unit?: string;
        rangeLow?: number; rangeHigh?: number; flag?: string
      }>
      biomarkers = raw
        .filter(m => m.value != null && m.unit)
        .map(m => {
          const key = m.name || m.displayName || ''
          const def = BIOMARKER_REGISTRY[key]
          return {
            biomarkerKey: key,
            value: Number(m.value),
            unit: m.unit!,
            flag: def ? computeFlag(key, Number(m.value)) : (m.flag || 'normal'),
            rangeLow: m.rangeLow ?? null,
            rangeHigh: m.rangeHigh ?? null,
          }
        })
    } catch {
      biomarkers = []
    }
  }

  if (biomarkers.length === 0) {
    return 'Lab results: none available.'
  }

  const daysSince = Math.round((Date.now() - testDate!.getTime()) / (1000 * 60 * 60 * 24))

  const critical = biomarkers.filter(b => b.flag === 'critical_low' || b.flag === 'critical_high')
  const outOfRange = biomarkers.filter(b => b.flag === 'low' || b.flag === 'high')
  const optimal = biomarkers.filter(b => b.flag === 'optimal')
  const normal = biomarkers.filter(b => b.flag === 'normal')

  const formatMarker = (b: LabBiomarkerRow) => {
    const def = BIOMARKER_REGISTRY[b.biomarkerKey]
    const name = def?.displayName ?? b.biomarkerKey
    const refRange = def
      ? `[ref: ${def.referenceRange.min}–${def.referenceRange.max} ${b.unit}]`
      : (b.rangeLow != null && b.rangeHigh != null ? `[ref: ${b.rangeLow}–${b.rangeHigh} ${b.unit}]` : '')
    return `  - ${name}: ${def ? def.format(b.value) : `${b.value} ${b.unit}`} (${b.flag}) ${refRange}`
  }

  const sections: string[] = []
  sections.push(`Lab: ${labName || 'Unknown'} | ${testDate!.toLocaleDateString()} (${daysSince}d ago)`)
  sections.push(`${biomarkers.length} markers: ${optimal.length} optimal, ${normal.length} normal, ${outOfRange.length} flagged, ${critical.length} critical`)

  if (critical.length > 0) {
    sections.push(`Critical:\n${critical.map(formatMarker).join('\n')}`)
  }
  if (outOfRange.length > 0) {
    sections.push(`Flagged:\n${outOfRange.map(formatMarker).join('\n')}`)
  }
  if (optimal.length > 0) {
    sections.push(`Optimal:\n${optimal.map(formatMarker).join('\n')}`)
  }

  return sections.join('\n')
}

function buildInventorySection(
  inventory: Array<{
    peptide: { name: string }
    totalAmount: number
    totalUnit: string
    isExhausted: boolean
    expirationDate: Date | null
  }>,
  today: Date
): string {
  if (inventory.length === 0) return 'Inventory: None'

  const items = inventory.map(v => {
    const isExpired = v.expirationDate && new Date(v.expirationDate) < today
    const status = v.isExhausted ? ' (empty)' : isExpired ? ' (expired)' : ''
    return `${v.peptide.name} ${v.totalAmount}${v.totalUnit}${status}`
  })

  return `Inventory: ${items.join('; ')}`
}

async function buildNutritionSection(userId: string, today: Date): Promise<string | null> {
  try {
    const todayStart = startOfDay(today)
    const todayEnd = endOfDay(today)

    const metrics = await prisma.healthMetric.findMany({
      where: {
        userId,
        metricType: { in: ['active_calories', 'basal_calories'] },
        recordedAt: { gte: todayStart, lte: todayEnd },
      },
      orderBy: { recordedAt: 'desc' },
    })

    if (metrics.length === 0) return null

    const activeCal = metrics.find(m => m.metricType === 'active_calories')
    const basalCal = metrics.find(m => m.metricType === 'basal_calories')

    const parts: string[] = ["Today's nutrition/energy:"]

    if (activeCal) {
      parts.push(`  Active calories burned: ${Math.round(activeCal.value)} kcal`)
    }
    if (basalCal) {
      parts.push(`  Basal metabolic rate: ${Math.round(basalCal.value)} kcal`)
    }
    if (activeCal && basalCal) {
      const total = Math.round(activeCal.value + basalCal.value)
      parts.push(`  Total energy expenditure: ${total} kcal`)
    }

    // Note: detailed macros (protein, carbs, fats) are sent from the iOS client
    // via the system message when available. This section covers wearable energy data.

    return parts.length > 1 ? parts.join('\n') : null
  } catch (e) {
    console.warn('[Chat] Nutrition data unavailable:', (e as Error).message)
    return null
  }
}

function buildActionItemsSection(
  actionItems: Array<{
    text: string
    priority: string
    source: string
    domain: string
    timeframe?: string
  }>
): string {
  const top = actionItems.slice(0, 5)
  if (top.length === 0) return ''

  const lines: string[] = ['Recommended actions:']
  for (const item of top) {
    let line = `  - ${item.text}`
    if (item.domain) line += ` (${item.domain})`
    if (item.priority) line += ` [${item.priority}]`
    lines.push(line)
  }

  return lines.join('\n')
}
