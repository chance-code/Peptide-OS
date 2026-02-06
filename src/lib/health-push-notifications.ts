/**
 * Health Push Notifications
 *
 * Generates health-specific notification payloads:
 * - Morning health briefings with score and key metric changes
 * - Evidence milestone notifications when protocol verdicts change
 * - Weekly digest notifications with review summary
 *
 * Uses the existing health synthesis and evidence engines (read-only).
 * Stores evidence snapshots in the Note model (entityType: 'evidence_snapshot')
 * to detect verdict changes without requiring a schema migration.
 */

import { prisma } from './prisma'
import { calculateHealthScore, calculateHealthTrends } from './health-synthesis'
import { computePremiumEvidence, type EvidenceVerdict } from './health-evidence-engine'
import { getDailyStatus } from './health-daily-status'
import { generateWeeklyReview } from './health-weekly-review'

// ─── Types ───────────────────────────────────────────────────────────────────

interface MorningBriefingPayload {
  title: string
  body: string
  data: { type: 'health_briefing'; tab: 'today'; deepLink?: string }
}

interface EvidenceMilestonePayload {
  title: string
  body: string
  data: { type: 'evidence_milestone'; protocolId: string; tab: 'evidence' }
}

interface WeeklyDigestPayload {
  title: string
  body: string
  data: { type: 'weekly_digest'; deepLink: string }
}

interface StaleDataPayload {
  title: string
  body: string
  data: { type: 'stale_data'; tab: 'today'; deepLink: string }
}

interface StoredVerdicts {
  [protocolId: string]: EvidenceVerdict
}

// Evidence entity type used in the Note model as a lightweight KV store
const EVIDENCE_SNAPSHOT_ENTITY_TYPE = 'evidence_snapshot'

// Verdict transitions that are meaningful enough to notify the user about
const NOTABLE_TRANSITIONS: Array<{ from: EvidenceVerdict; to: EvidenceVerdict; label: string }> = [
  { from: 'too_early', to: 'accumulating', label: 'Data is accumulating' },
  { from: 'too_early', to: 'weak_positive', label: 'Early positive signs' },
  { from: 'accumulating', to: 'weak_positive', label: 'Positive signal emerging' },
  { from: 'accumulating', to: 'likely_positive', label: 'Likely positive effect detected' },
  { from: 'accumulating', to: 'strong_positive', label: 'Strong positive effect detected' },
  { from: 'weak_positive', to: 'likely_positive', label: 'Evidence strengthening' },
  { from: 'likely_positive', to: 'strong_positive', label: 'Strong evidence confirmed' },
  { from: 'accumulating', to: 'possible_negative', label: 'Possible negative effect' },
  { from: 'weak_positive', to: 'strong_positive', label: 'Strong evidence confirmed' },
  { from: 'no_detectable_effect', to: 'weak_positive', label: 'New positive signal' },
  { from: 'no_detectable_effect', to: 'likely_positive', label: 'Positive effect detected' },
]

// ─── Morning Briefing ────────────────────────────────────────────────────────

/**
 * Generate a concise morning health briefing notification.
 *
 * Fetches the user's health score, top trend, and daily status, then builds
 * a short message.
 * Returns null if there is no meaningful data to report.
 */
export async function generateMorningBriefing(
  userId: string
): Promise<MorningBriefingPayload | null> {
  try {
    const [score, trends, dailyStatus] = await Promise.all([
      calculateHealthScore(userId),
      calculateHealthTrends(userId, 7),
      getDailyStatus(userId),
    ])

    // If there is no overall score, we have nothing meaningful to send
    if (score.overall === null) {
      return null
    }

    // Build the body parts
    const parts: string[] = []

    // Overall score
    parts.push(`Score ${score.overall}`)

    // Find the most notable improving trend to highlight
    const improving = trends.find(t => t.trend === 'improving' && Math.abs(t.changePercent) >= 3)
    if (improving) {
      const arrow = improving.changePercent > 0 ? '+' : ''
      parts.push(`${improving.displayName} ${arrow}${Math.round(improving.changePercent)}%`)
    }

    // Find the top declining metric as a focus area
    const declining = trends.find(t => t.trend === 'declining' && Math.abs(t.changePercent) >= 3)
    if (declining) {
      parts.push(`Focus: ${declining.displayName.toLowerCase()}`)
    } else if (score.recovery !== null && score.recovery >= 80) {
      parts.push('Recovery strong')
    }

    // Use daily status title and subtitle for the notification
    const title = dailyStatus.title
    const body = `${dailyStatus.subtitle}. ${parts.join('. ')}.`

    return {
      title,
      body,
      data: { type: 'health_briefing', tab: 'today', deepLink: 'arcprotocol://health' },
    }
  } catch (error) {
    console.error(`[health-push] Error generating morning briefing for ${userId}:`, error)
    return null
  }
}

// ─── Weekly Digest ───────────────────────────────────────────────────────────

/**
 * Generate a weekly digest notification with review highlights.
 *
 * Calls the weekly review engine and builds a concise notification payload.
 * Returns null if the review generation fails or has no data.
 */
export async function generateWeeklyDigest(
  userId: string
): Promise<WeeklyDigestPayload | null> {
  try {
    const review = await generateWeeklyReview(userId)

    if (!review || (!review.topWins.length && !review.needsAttention.length)) {
      return null
    }

    return {
      title: 'Weekly Review',
      body: `${review.headline}. ${review.topWins.length} wins, ${review.needsAttention.length} to watch.`,
      data: { type: 'weekly_digest', deepLink: 'arcprotocol://health' },
    }
  } catch (error) {
    console.error(`[health-push] Error generating weekly digest for ${userId}:`, error)
    return null
  }
}

// ─── Evidence Milestones ─────────────────────────────────────────────────────

/**
 * Load previously stored evidence verdicts for a user.
 */
async function loadStoredVerdicts(userId: string): Promise<StoredVerdicts> {
  const note = await prisma.note.findFirst({
    where: {
      entityType: EVIDENCE_SNAPSHOT_ENTITY_TYPE,
      entityId: userId,
    },
  })

  if (!note) {
    return {}
  }

  try {
    return JSON.parse(note.content) as StoredVerdicts
  } catch {
    return {}
  }
}

/**
 * Save the current evidence verdicts for a user, overwriting any previous snapshot.
 */
async function saveStoredVerdicts(userId: string, verdicts: StoredVerdicts): Promise<void> {
  const existing = await prisma.note.findFirst({
    where: {
      entityType: EVIDENCE_SNAPSHOT_ENTITY_TYPE,
      entityId: userId,
    },
  })

  const content = JSON.stringify(verdicts)

  if (existing) {
    await prisma.note.update({
      where: { id: existing.id },
      data: { content },
    })
  } else {
    await prisma.note.create({
      data: {
        entityType: EVIDENCE_SNAPSHOT_ENTITY_TYPE,
        entityId: userId,
        content,
      },
    })
  }
}

/**
 * Check for evidence milestone transitions.
 *
 * Computes the current evidence verdicts for all active protocols,
 * compares against the previously stored verdicts, and returns
 * notifications for any meaningful transitions.
 *
 * Always updates the stored verdicts at the end.
 */
// ─── Stale Data Notification ────────────────────────────────────────────────

/**
 * Generate a stale data notification if any connected integration
 * hasn't synced in over 24 hours.
 *
 * Returns null if all integrations are fresh or if the user has no integrations.
 */
export async function generateStaleDataNotification(
  userId: string
): Promise<StaleDataPayload | null> {
  try {
    const integrations = await prisma.healthIntegration.findMany({
      where: { userId, isConnected: true },
      select: { provider: true, lastSyncAt: true },
    })

    if (integrations.length === 0) return null

    const staleThreshold = 24 * 60 * 60 * 1000 // 24 hours
    const now = Date.now()

    const staleProviders = integrations.filter(i => {
      if (!i.lastSyncAt) return true // never synced
      return now - new Date(i.lastSyncAt).getTime() > staleThreshold
    })

    if (staleProviders.length === 0) return null

    const providerNames = staleProviders.map(p => {
      switch (p.provider) {
        case 'apple_health': return 'Apple Health'
        case 'oura': return 'Oura Ring'
        case 'whoop': return 'WHOOP'
        default: return p.provider
      }
    }).join(', ')

    return {
      title: 'Health data is getting stale',
      body: `${providerNames} hasn't synced in over 24 hours. Open the app to refresh.`,
      data: { type: 'stale_data', tab: 'today', deepLink: 'arcprotocol://health' },
    }
  } catch (error) {
    console.error(`[health-push] Error generating stale data notification for ${userId}:`, error)
    return null
  }
}

// ─── Evidence Milestones ─────────────────────────────────────────────────────

export async function checkEvidenceMilestones(
  userId: string
): Promise<EvidenceMilestonePayload[]> {
  try {
    const [currentEvidence, previousVerdicts] = await Promise.all([
      computePremiumEvidence(userId),
      loadStoredVerdicts(userId),
    ])

    if (currentEvidence.length === 0) {
      return []
    }

    const notifications: EvidenceMilestonePayload[] = []

    // Build the new verdict map
    const newVerdicts: StoredVerdicts = {}

    for (const evidence of currentEvidence) {
      newVerdicts[evidence.protocolId] = evidence.verdict

      const previousVerdict = previousVerdicts[evidence.protocolId]

      // Skip if no previous verdict (first run for this protocol)
      if (!previousVerdict) {
        continue
      }

      // Skip if verdict hasn't changed
      if (previousVerdict === evidence.verdict) {
        continue
      }

      // Check if this transition is notable
      const transition = NOTABLE_TRANSITIONS.find(
        t => t.from === previousVerdict && t.to === evidence.verdict
      )

      if (transition) {
        notifications.push({
          title: `${evidence.protocolName}: ${transition.label}`,
          body: evidence.verdictExplanation,
          data: {
            type: 'evidence_milestone',
            protocolId: evidence.protocolId,
            tab: 'evidence',
          },
        })
      }
    }

    // Persist the updated verdicts
    await saveStoredVerdicts(userId, newVerdicts)

    return notifications
  } catch (error) {
    console.error(`[health-push] Error checking evidence milestones for ${userId}:`, error)
    return []
  }
}
