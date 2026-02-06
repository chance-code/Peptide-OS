import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { getAuthenticatedUserId } from '@/lib/api-auth'
import { BIOMARKER_REGISTRY, computeFlag, type BiomarkerFlag } from '@/lib/lab-biomarker-contract'
import { analyzeLabPatterns, type LabPattern } from '@/lib/labs/lab-analyzer'
import { generateBridgeInsights, type BridgeInsight } from '@/lib/labs/lab-wearable-bridge'
import { getLatestSnapshot, isRecentSnapshot } from '@/lib/health-brain'

// GET /api/health/labs/insights — Three-tier lab insights
export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthenticatedUserId()
    if (!auth.success) return auth.response
    const { userId } = auth

    const { searchParams } = new URL(request.url)
    const uploadId = searchParams.get('uploadId')

    // Get the target upload (specific or latest)
    let upload
    if (uploadId) {
      upload = await prisma.labUpload.findFirst({
        where: { id: uploadId, userId },
        include: { biomarkers: true },
      })
    } else {
      upload = await prisma.labUpload.findFirst({
        where: { userId },
        orderBy: { testDate: 'desc' },
        include: { biomarkers: true },
      })
    }

    if (!upload) {
      return NextResponse.json({
        error: 'No lab uploads found. Upload a lab PDF to get insights.',
      }, { status: 404 })
    }

    const sourceId = upload.id
    const sourceTestDate = upload.testDate
    const sourceLabName = upload.labName

    // Use enriched biomarkers directly
    const biomarkersForTier1 = upload.biomarkers

    // Build biomarker array for analyzer/bridge functions
    const biomarkerArray = upload.biomarkers.map(bm => ({
      biomarkerKey: bm.biomarkerKey,
      value: bm.value,
      unit: bm.unit,
      flag: computeFlag(bm.biomarkerKey, bm.value),
    }))

    // Tier 1: Individual biomarker status
    const tier1 = generateTier1Insights(biomarkersForTier1)

    // Tier 2: Cross-biomarker patterns
    const patterns = analyzeLabPatterns(biomarkerArray)

    // Tier 3: Lab-wearable bridge insights
    const bridgeInsights = await generateBridgeInsights(userId, biomarkerArray, patterns)

    // Generate overall narrative
    const narrative = generateOverallNarrative(tier1, patterns, bridgeInsights)

    // Prioritized actions
    const actions = generateActions(tier1, patterns, bridgeInsights)

    // Enrich with Brain snapshot data if available
    let brainDomains: any = null
    let brainScore: number | null = null
    let brainConfidence: string | null = null
    const snapshot = await getLatestSnapshot(userId)
    if (snapshot && isRecentSnapshot(snapshot.evaluatedAt, 5 * 60 * 1000)) {
      brainDomains = snapshot.domains ?? null
      brainScore = snapshot.unifiedScore ?? null
      brainConfidence = snapshot.systemConfidence?.level ?? null
    }

    return NextResponse.json({
      uploadId: sourceId,
      testDate: sourceTestDate,
      labName: sourceLabName,
      tier1: {
        title: 'Biomarker Status',
        insights: tier1,
      },
      tier2: {
        title: 'Clinical Patterns',
        patterns: patterns.map(p => ({
          key: p.patternKey,
          name: p.patternName,
          severity: p.severity,
          confidence: p.confidence,
          description: p.description,
          insight: p.insight,
          mechanism: p.mechanismExplanation,
          recommendations: p.recommendations,
          involvedMarkers: p.involvedBiomarkers.map(m => ({
            key: m.key,
            displayName: m.displayName,
            value: m.value,
            unit: m.unit,
            flag: m.flag,
            role: m.role,
            contribution: m.contribution,
          })),
        })),
      },
      tier3: {
        title: 'Bloodwork + Wearable Connections',
        bridges: bridgeInsights.map(b => ({
          title: b.title,
          labFindings: b.labFindings,
          wearableFindings: b.wearableFindings,
          connection: b.connection,
          actionability: b.actionability,
          confidence: b.confidence,
          priority: b.priority,
        })),
      },
      narrative,
      actions,
      brainDomains,
      brainScore,
      brainConfidence,
      disclaimer: 'This analysis is for informational purposes only and does not constitute medical advice. Always consult a qualified healthcare provider before making changes to your health regimen.',
    }, {
      headers: { 'Cache-Control': 'private, max-age=300' },
    })
  } catch (error) {
    console.error('Error generating lab insights:', error)
    return NextResponse.json({ error: 'Failed to generate lab insights' }, { status: 500 })
  }
}

// ─── Tier 1: Individual Biomarker Insights ──────────────────────────────────

interface Tier1Insight {
  key: string
  displayName: string
  value: number
  unit: string
  flag: BiomarkerFlag
  status: string
  message: string
  priority: 'info' | 'attention' | 'action'
}

function generateTier1Insights(biomarkers: Array<{
  biomarkerKey: string
  value: number
  unit: string
  flag: string
}>): Tier1Insight[] {
  const insights: Tier1Insight[] = []

  for (const bm of biomarkers) {
    const def = BIOMARKER_REGISTRY[bm.biomarkerKey]
    if (!def) continue

    const flag = bm.flag as BiomarkerFlag
    let status: string
    let message: string
    let priority: 'info' | 'attention' | 'action'

    switch (flag) {
      case 'optimal':
        status = 'Optimal'
        message = `${def.displayName} at ${def.format(bm.value)} is in the optimal range.`
        priority = 'info'
        break
      case 'normal':
        status = 'Within Range'
        message = `${def.displayName} at ${def.format(bm.value)} is within the reference range.`
        priority = 'info'
        break
      case 'low':
        status = 'Below Range'
        message = `${def.displayName} at ${def.format(bm.value)} is below the reference range.`
        priority = 'attention'
        break
      case 'high':
        status = 'Above Range'
        message = `${def.displayName} at ${def.format(bm.value)} is above the reference range.`
        priority = 'attention'
        break
      case 'critical_low':
        status = 'Critically Low'
        message = `${def.displayName} at ${def.format(bm.value)} is at a critically low level. Discuss with your provider.`
        priority = 'action'
        break
      case 'critical_high':
        status = 'Critically High'
        message = `${def.displayName} at ${def.format(bm.value)} is at a critically high level. Discuss with your provider.`
        priority = 'action'
        break
    }

    insights.push({
      key: bm.biomarkerKey,
      displayName: def.displayName,
      value: bm.value,
      unit: bm.unit,
      flag,
      status,
      message,
      priority,
    })
  }

  // Sort: action first, then attention, then info
  const priorityOrder = { action: 0, attention: 1, info: 2 }
  return insights.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority])
}

// ─── Narrative Generation ───────────────────────────────────────────────────

function generateOverallNarrative(
  tier1: Tier1Insight[],
  patterns: LabPattern[],
  bridges: BridgeInsight[]
): string {
  const parts: string[] = []

  const optimal = tier1.filter(i => i.flag === 'optimal').length
  const normal = tier1.filter(i => i.flag === 'normal').length
  const inRange = optimal + normal
  const action = tier1.filter(i => i.priority === 'action').length
  const attention = tier1.filter(i => i.priority === 'attention').length
  const total = tier1.length

  // Lead with the positive
  if (inRange === total) {
    parts.push(`All ${total} markers are within their reference ranges — ${optimal} in the optimal range.`)
  } else if (inRange >= total * 0.8) {
    parts.push(`${inRange} of ${total} markers are within reference ranges (${optimal} optimal). Overall, a solid picture.`)
  } else if (inRange >= total * 0.5) {
    parts.push(`${inRange} of ${total} markers are within reference ranges.`)
  } else {
    parts.push(`${inRange} of ${total} markers are within reference ranges.`)
  }

  // Then note any concerns
  if (action > 0) {
    parts.push(`${action} marker${action > 1 ? 's' : ''} outside the reference range may warrant discussion with your provider.`)
  } else if (attention > 0) {
    parts.push(`${attention} marker${attention > 1 ? 's are' : ' is'} outside the reference range.`)
  }

  if (patterns.length > 0) {
    parts.push(`${patterns.length} cross-biomarker pattern${patterns.length > 1 ? 's' : ''} identified for context.`)
  }

  if (bridges.length > 0) {
    parts.push(`${bridges.length} connection${bridges.length > 1 ? 's' : ''} found between your bloodwork and wearable data.`)
  }

  return parts.join(' ')
}

// ─── Action Generation ──────────────────────────────────────────────────────

function generateActions(
  tier1: Tier1Insight[],
  patterns: LabPattern[],
  bridges: BridgeInsight[]
): Array<{ priority: number; text: string; source: string }> {
  const actions: Array<{ priority: number; text: string; source: string }> = []

  // Critical biomarkers → top priority
  for (const insight of tier1.filter(i => i.priority === 'action')) {
    actions.push({
      priority: 1,
      text: `Discuss ${insight.displayName} levels with your healthcare provider.`,
      source: 'biomarker',
    })
  }

  // Pattern recommendations
  for (const pattern of patterns) {
    for (const rec of pattern.recommendations) {
      actions.push({
        priority: pattern.severity === 'urgent' ? 1 : pattern.severity === 'action' ? 2 : 3,
        text: rec,
        source: pattern.patternName,
      })
    }
  }

  // Bridge actionability
  for (const bridge of bridges) {
    if (bridge.actionability) {
      actions.push({
        priority: bridge.priority === 'high' ? 2 : 3,
        text: bridge.actionability,
        source: bridge.title,
      })
    }
  }

  // Deduplicate similar actions and sort by priority
  const seen = new Set<string>()
  return actions
    .filter(a => {
      const key = a.text.toLowerCase().slice(0, 50)
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .sort((a, b) => a.priority - b.priority)
    .slice(0, 10) // Top 10 actions
}
