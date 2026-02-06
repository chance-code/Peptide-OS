// Discovery Feed Engine
// Generates 1-3 daily curated insights from existing data sources
// 8 insight types with frequency balancing and domain alternation

import prisma from '@/lib/prisma'
import { format, subDays, startOfDay, differenceInDays } from 'date-fns'
import { BIOMARKER_REGISTRY, computeZone } from '@/lib/lab-biomarker-contract'

export type InsightType =
  | 'pattern'
  | 'cross_domain'
  | 'milestone'
  | 'predictive'
  | 'surprise'
  | 'retest'
  | 'achievement'
  | 'educational'

interface GeneratedInsight {
  type: InsightType
  title: string
  body: string
  domain: string | null
  relatedMarkers: string[]
  priority: number
}

// ─── Main Entry Point ────────────────────────────────────────────────────────

export async function generateDailyFeed(userId: string): Promise<{
  insights: Array<{
    id: string
    type: string
    title: string
    body: string
    domain: string | null
    relatedMarkers: string | null
    priority: number
    seen: boolean
    dismissed: boolean
    generatedAt: string
    expiresAt: string | null
  }>
  generatedAt: string
}> {
  const today = startOfDay(new Date())
  const todayStr = format(today, 'yyyy-MM-dd')

  // Check if already generated today
  const existing = await prisma.discoveryInsight.findMany({
    where: {
      userId,
      generatedAt: { gte: today },
      dismissed: false,
    },
    orderBy: { priority: 'asc' },
  })

  if (existing.length > 0) {
    return {
      insights: existing.map(formatInsight),
      generatedAt: todayStr,
    }
  }

  // Generate new insights
  const candidates = await generateCandidates(userId)

  // Apply frequency rules
  const recentTypes = await getRecentTypeDistribution(userId)
  const lastDomain = await getLastInsightDomain(userId)
  const filtered = applyFrequencyRules(candidates, recentTypes, lastDomain)

  // Take top 1-3
  const selected = filtered.slice(0, 3)

  // Ensure at least 1 educational insight for cold start
  if (selected.length === 0) {
    selected.push(generateEducationalInsight())
  }

  // Ensure 1+ surprise per week
  const surpriseThisWeek = recentTypes.get('surprise') ?? 0
  if (surpriseThisWeek === 0 && !selected.some(s => s.type === 'surprise')) {
    const surprise = candidates.find(c => c.type === 'surprise')
    if (surprise && selected.length < 3) {
      selected.push(surprise)
    }
  }

  // Persist
  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)

  const created = await Promise.all(
    selected.map((insight, i) =>
      prisma.discoveryInsight.create({
        data: {
          userId,
          type: insight.type,
          title: insight.title,
          body: insight.body,
          domain: insight.domain,
          relatedMarkers: insight.relatedMarkers.length > 0
            ? JSON.stringify(insight.relatedMarkers)
            : null,
          priority: i + 1,
          generatedAt: today,
          expiresAt: tomorrow,
        },
      }),
    ),
  )

  return {
    insights: created.map(formatInsight),
    generatedAt: todayStr,
  }
}

// ─── Candidate Generation ────────────────────────────────────────────────────

async function generateCandidates(userId: string): Promise<GeneratedInsight[]> {
  const candidates: GeneratedInsight[] = []

  // Fetch latest lab data
  const latestUpload = await prisma.labUpload.findFirst({
    where: { userId },
    orderBy: { testDate: 'desc' },
    include: { biomarkers: true, review: true },
  })

  // Fetch active protocols
  const protocols = await prisma.protocol.findMany({
    where: { userId, status: 'active' },
    include: { peptide: true },
  })

  // 1. Retesting Prompt
  if (latestUpload) {
    const daysSince = differenceInDays(new Date(), latestUpload.testDate)
    if (daysSince > 90) {
      const relevantProtocols = protocols.map(p => p.peptide.name).join(', ')
      candidates.push({
        type: 'retest',
        title: 'Time for a lab check-in',
        body: daysSince > 180
          ? `It's been ${daysSince} days since your last bloodwork. Retesting helps track progress${relevantProtocols ? ` and assess how ${relevantProtocols} is working` : ''}.`
          : `${daysSince} days since your last draw. A retest would help confirm your current trajectory.`,
        domain: null,
        relatedMarkers: [],
        priority: daysSince > 180 ? 2 : 4,
      })
    }

    // Check for markers needing retest based on zone scoring
    for (const bm of latestUpload.biomarkers) {
      const zone = computeZone(bm.biomarkerKey, bm.value)
      if (zone.retestRecommendation && daysSince > 60) {
        const def = BIOMARKER_REGISTRY[bm.biomarkerKey]
        if (def) {
          candidates.push({
            type: 'retest',
            title: `${def.displayName} retest suggested`,
            body: `Your ${def.displayName} was near a zone boundary last time. A retest would clarify whether the value is stable or trending.`,
            domain: def.healthDomains[0] ?? null,
            relatedMarkers: [bm.biomarkerKey],
            priority: 5,
          })
          break // Only one marker-level retest prompt per day
        }
      }
    }
  }

  // 2. Protocol Milestone
  for (const protocol of protocols) {
    const daysOn = differenceInDays(new Date(), protocol.startDate)
    const milestones = [7, 14, 30, 60, 90, 180]
    const hitMilestone = milestones.find(m => daysOn >= m && daysOn < m + 1)

    if (hitMilestone) {
      candidates.push({
        type: 'milestone',
        title: `${protocol.peptide.name}: ${hitMilestone} day mark`,
        body: hitMilestone <= 14
          ? `You've been on ${protocol.peptide.name} for ${hitMilestone} days. Initial effects may be building.`
          : hitMilestone <= 30
            ? `${hitMilestone} days on ${protocol.peptide.name}. Many users report noticeable effects around this time.`
            : `${hitMilestone} days on ${protocol.peptide.name}. Bloodwork can help verify if it's supporting your goals.`,
        domain: null,
        relatedMarkers: [],
        priority: 3,
      })
    }
  }

  // 3. Predictive Alert (from lab review predictions)
  if (latestUpload?.review) {
    try {
      const predictions = JSON.parse(latestUpload.review.predictions) as Array<{
        biomarkerKey: string
        predictedValue: number
        currentValue: number
        direction: string
      }>
      for (const pred of predictions.slice(0, 2)) {
        const def = BIOMARKER_REGISTRY[pred.biomarkerKey]
        if (!def) continue
        const zone = computeZone(pred.biomarkerKey, pred.predictedValue)
        if (zone.zone === 'below_optimal' || zone.zone === 'above_optimal' || zone.zone === 'low' || zone.zone === 'high') {
          candidates.push({
            type: 'predictive',
            title: `${def.displayName} trajectory`,
            body: `At the current rate, ${def.displayName} is projected to move ${pred.direction === 'up' ? 'higher' : 'lower'} next quarter. ${zone.zone.includes('optimal') ? 'Still within a reasonable range.' : 'Worth monitoring with your provider.'}`,
            domain: def.healthDomains[0] ?? null,
            relatedMarkers: [pred.biomarkerKey],
            priority: zone.zone === 'low' || zone.zone === 'high' ? 2 : 4,
          })
        }
      }
    } catch { /* invalid JSON, skip */ }
  }

  // 4. Achievement / Progress
  if (latestUpload?.review) {
    try {
      const deltas = JSON.parse(latestUpload.review.markerDeltas) as Array<{
        biomarkerKey: string
        displayName: string
        percentDelta: number
        isSignificant: boolean
      }>
      const improvements = deltas.filter(d => d.isSignificant && d.percentDelta > 0)
      if (improvements.length >= 3) {
        candidates.push({
          type: 'achievement',
          title: `${improvements.length} biomarkers improved`,
          body: `Since your last test, ${improvements.length} markers showed meaningful improvement. Your protocols and lifestyle choices are showing results.`,
          domain: null,
          relatedMarkers: improvements.map(d => d.biomarkerKey),
          priority: 2,
        })
      }
    } catch { /* skip */ }
  }

  // 5. Cross-Domain Connection
  if (latestUpload?.review) {
    try {
      const domains = JSON.parse(latestUpload.review.domainSummaries) as Array<{
        domain: string
        displayName: string
        status: string
        narrative: string
      }>
      const improving = domains.filter(d => d.status === 'improving')
      const declining = domains.filter(d => d.status === 'needs_attention')

      if (improving.length > 0 && declining.length > 0) {
        candidates.push({
          type: 'cross_domain',
          title: `${improving[0].displayName} ↑ while ${declining[0].displayName} needs attention`,
          body: `Your ${improving[0].displayName.toLowerCase()} markers are improving, but ${declining[0].displayName.toLowerCase()} could use focus. These domains can be biologically connected.`,
          domain: declining[0].domain,
          relatedMarkers: [],
          priority: 3,
        })
      }
    } catch { /* skip */ }
  }

  // 6. Biological Surprise
  if (latestUpload) {
    for (const bm of latestUpload.biomarkers) {
      const zone = computeZone(bm.biomarkerKey, bm.value)
      if (zone.score >= 90) {
        const def = BIOMARKER_REGISTRY[bm.biomarkerKey]
        if (def) {
          candidates.push({
            type: 'surprise',
            title: `${def.displayName} is in peak range`,
            body: `Your ${def.displayName} of ${def.format(bm.value)} is in the optimal peak zone — score ${zone.score}/100. This is an excellent result.`,
            domain: def.healthDomains[0] ?? null,
            relatedMarkers: [bm.biomarkerKey],
            priority: 4,
          })
          break // One surprise per day
        }
      }
    }
  }

  // 7. Educational Deepdive (always available, no data needed)
  candidates.push(generateEducationalInsight())

  // Sort by priority (lower = higher priority)
  candidates.sort((a, b) => a.priority - b.priority)

  return candidates
}

// ─── Frequency Rules ─────────────────────────────────────────────────────────

async function getRecentTypeDistribution(userId: string): Promise<Map<string, number>> {
  const weekAgo = subDays(new Date(), 7)
  const recent = await prisma.discoveryInsight.findMany({
    where: { userId, generatedAt: { gte: weekAgo } },
    select: { type: true },
  })

  const counts = new Map<string, number>()
  for (const r of recent) {
    counts.set(r.type, (counts.get(r.type) ?? 0) + 1)
  }
  return counts
}

async function getLastInsightDomain(userId: string): Promise<string | null> {
  const last = await prisma.discoveryInsight.findFirst({
    where: { userId, domain: { not: null } },
    orderBy: { generatedAt: 'desc' },
    select: { domain: true },
  })
  return last?.domain ?? null
}

function applyFrequencyRules(
  candidates: GeneratedInsight[],
  recentTypes: Map<string, number>,
  lastDomain: string | null,
): GeneratedInsight[] {
  const result: GeneratedInsight[] = []
  const usedTypes = new Set<string>()

  for (const candidate of candidates) {
    // No type repeats > 2x per week
    const typeCount = recentTypes.get(candidate.type) ?? 0
    if (typeCount >= 2) continue

    // Alternate domains (prefer different from last)
    if (result.length > 0 && candidate.domain && candidate.domain === lastDomain && result.length < 2) {
      // Defer same-domain to later position
      continue
    }

    // No duplicate types in same day
    if (usedTypes.has(candidate.type)) continue

    result.push(candidate)
    usedTypes.add(candidate.type)

    if (result.length >= 3) break
  }

  return result
}

// ─── Educational Content ─────────────────────────────────────────────────────

const EDUCATIONAL_TOPICS = [
  {
    title: 'Why ApoB matters more than LDL-C',
    body: 'LDL cholesterol measures the amount of cholesterol carried in LDL particles, but ApoB counts the actual number of atherogenic particles. Two people with the same LDL-C can have very different particle counts — and it\'s the particle count that drives plaque formation.',
    domain: 'cardiovascular',
    markers: ['apolipoprotein_b', 'ldl_cholesterol'],
  },
  {
    title: 'Understanding HbA1c beyond diabetes',
    body: 'HbA1c reflects your average blood sugar over 2-3 months. Even without diabetes, values above 5.4% may indicate metabolic stress. Longevity-focused practitioners often target under 5.2% as an optimization goal.',
    domain: 'metabolic',
    markers: ['hba1c', 'fasting_glucose'],
  },
  {
    title: 'The hs-CRP variability factor',
    body: 'hs-CRP has one of the highest biological variations of any common biomarker — over 40% within-subject variation. A single elevated reading doesn\'t necessarily mean chronic inflammation. Retesting 2-4 weeks later gives a more reliable picture.',
    domain: 'inflammation',
    markers: ['hs_crp'],
  },
  {
    title: 'Ferritin: storage vs inflammation',
    body: 'Ferritin stores iron but also rises during inflammation (it\'s an acute phase reactant). When ferritin is high alongside elevated CRP, inflammation is the more likely explanation. When ferritin is high but CRP is normal, true iron loading should be investigated.',
    domain: 'nutrients',
    markers: ['ferritin', 'hs_crp'],
  },
  {
    title: 'The thyroid-cholesterol connection',
    body: 'Thyroid hormone (T3) regulates LDL receptors in the liver. When thyroid function is suboptimal, LDL clearance slows and cholesterol rises. If your cholesterol is elevated, checking thyroid function may reveal the root cause.',
    domain: 'thyroid',
    markers: ['tsh', 'ldl_cholesterol', 'total_cholesterol'],
  },
  {
    title: 'Omega-3 index and cardiovascular protection',
    body: 'The omega-3 index measures EPA + DHA as a percentage of red blood cell membranes. An index above 8% is associated with significant cardiovascular protection. Most Americans measure between 3-5%.',
    domain: 'cardiovascular',
    markers: ['omega_3_index'],
  },
  {
    title: 'Why vitamin D levels matter for more than bones',
    body: 'Vitamin D receptors exist in nearly every cell type. Beyond bone health, adequate vitamin D levels support immune function, mood regulation, and muscle strength. Levels above 50 ng/mL are associated with optimal health outcomes in longevity research.',
    domain: 'nutrients',
    markers: ['vitamin_d'],
  },
  {
    title: 'Homocysteine: the overlooked cardiovascular marker',
    body: 'Homocysteine is an amino acid that, when elevated, damages blood vessel walls. Levels above 9 µmol/L are associated with increased cardiovascular risk. The fix is often simple: adequate B12, folate, and B6.',
    domain: 'cardiovascular',
    markers: ['homocysteine'],
  },
]

function generateEducationalInsight(): GeneratedInsight {
  const topic = EDUCATIONAL_TOPICS[Math.floor(Math.random() * EDUCATIONAL_TOPICS.length)]
  return {
    type: 'educational',
    title: topic.title,
    body: topic.body,
    domain: topic.domain,
    relatedMarkers: topic.markers,
    priority: 6,
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatInsight(row: {
  id: string
  type: string
  title: string
  body: string
  domain: string | null
  relatedMarkers: string | null
  priority: number
  seen: boolean
  dismissed: boolean
  generatedAt: Date
  expiresAt: Date | null
}) {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    body: row.body,
    domain: row.domain,
    relatedMarkers: row.relatedMarkers,
    priority: row.priority,
    seen: row.seen,
    dismissed: row.dismissed,
    generatedAt: row.generatedAt.toISOString(),
    expiresAt: row.expiresAt?.toISOString() ?? null,
  }
}
