import { NextRequest, NextResponse } from 'next/server'
import { verifyUserAccess } from '@/lib/api-auth'
import prisma from '@/lib/prisma'
import { startOfDay, differenceInDays } from 'date-fns'

// ============================================
// Achievement type definitions
// ============================================

interface Achievement {
  id: string
  type: 'streak' | 'protocol' | 'adherence' | 'health'
  title: string
  description: string
  earnedAt: string // ISO date string
  icon: string // SF Symbol name
}

// Streak milestone thresholds and their display info
const STREAK_MILESTONES = [
  { days: 3,   title: 'First Streak',        description: '3 consecutive days of completed doses',       icon: 'flame' },
  { days: 7,   title: 'Week Warrior',         description: '7 consecutive days of completed doses',       icon: 'flame.fill' },
  { days: 14,  title: 'Two Week Titan',       description: '14 consecutive days of completed doses',      icon: 'bolt.fill' },
  { days: 30,  title: 'Monthly Master',       description: '30 consecutive days of completed doses',      icon: 'star.fill' },
  { days: 60,  title: 'Double Down',          description: '60 consecutive days of completed doses',      icon: 'star.circle.fill' },
  { days: 90,  title: 'Quarter Champion',     description: '90 consecutive days of completed doses',      icon: 'trophy.fill' },
  { days: 100, title: 'Century Club',         description: '100 consecutive days of completed doses',     icon: 'crown.fill' },
] as const

// ============================================
// Streak computation from DoseLog
// ============================================

interface StreakResult {
  longestStreak: number
  longestStreakEndDate: Date | null
}

function computeLongestStreak(doseLogs: { scheduledDate: Date; status: string }[]): StreakResult {
  if (doseLogs.length === 0) {
    return { longestStreak: 0, longestStreakEndDate: null }
  }

  // Group by date, considering a day "completed" if all doses that day are completed
  const dayStatusMap = new Map<string, { completed: number; total: number; date: Date }>()

  for (const log of doseLogs) {
    const dateKey = startOfDay(log.scheduledDate).toISOString().split('T')[0]
    const entry = dayStatusMap.get(dateKey) || { completed: 0, total: 0, date: startOfDay(log.scheduledDate) }
    entry.total += 1
    if (log.status === 'completed') {
      entry.completed += 1
    }
    dayStatusMap.set(dateKey, entry)
  }

  // Sort dates chronologically
  const sortedDays = Array.from(dayStatusMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))

  let longestStreak = 0
  let longestStreakEndDate: Date | null = null
  let currentStreak = 0
  let prevDate: Date | null = null

  for (const [, { completed, total, date }] of sortedDays) {
    const dayCompleted = completed === total && total > 0

    if (!dayCompleted) {
      // Streak broken
      if (currentStreak > longestStreak) {
        longestStreak = currentStreak
        longestStreakEndDate = prevDate
      }
      currentStreak = 0
      prevDate = null
      continue
    }

    if (prevDate === null) {
      // Start new streak
      currentStreak = 1
      prevDate = date
    } else {
      const gap = differenceInDays(date, prevDate)
      if (gap === 1) {
        // Consecutive day
        currentStreak += 1
        prevDate = date
      } else {
        // Gap > 1 day — streak broken
        if (currentStreak > longestStreak) {
          longestStreak = currentStreak
          longestStreakEndDate = prevDate
        }
        currentStreak = 1
        prevDate = date
      }
    }
  }

  // Check final streak
  if (currentStreak > longestStreak) {
    longestStreak = currentStreak
    longestStreakEndDate = prevDate
  }

  return { longestStreak, longestStreakEndDate }
}

// ============================================
// Weekly adherence computation
// ============================================

interface WeekAdherence {
  weekStart: Date
  completed: number
  total: number
  rate: number
}

function computeWeeklyAdherence(doseLogs: { scheduledDate: Date; status: string }[]): WeekAdherence[] {
  if (doseLogs.length === 0) return []

  // Group doses by ISO week (Monday-based)
  const weekMap = new Map<string, { weekStart: Date; completed: number; total: number }>()

  for (const log of doseLogs) {
    const date = startOfDay(log.scheduledDate)
    // Get Monday of that week
    const dayOfWeek = date.getDay()
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek
    const monday = new Date(date)
    monday.setDate(monday.getDate() + mondayOffset)
    const weekKey = monday.toISOString().split('T')[0]

    const entry = weekMap.get(weekKey) || { weekStart: monday, completed: 0, total: 0 }
    entry.total += 1
    if (log.status === 'completed') {
      entry.completed += 1
    }
    weekMap.set(weekKey, entry)
  }

  return Array.from(weekMap.values())
    .map(w => ({ ...w, rate: w.total > 0 ? w.completed / w.total : 0 }))
    .sort((a, b) => a.weekStart.getTime() - b.weekStart.getTime())
}

// ============================================
// GET /api/achievements?userId=X
// ============================================

export async function GET(request: NextRequest) {
  const start = Date.now()
  try {
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('userId')

    const authResult = await verifyUserAccess(userId)
    if (!authResult.success) return authResult.response

    const achievements: Achievement[] = []

    // ── 1. Streak Achievements (from DoseLog) ──

    const doseLogs = await prisma.doseLog.findMany({
      where: { userId: authResult.userId },
      select: {
        scheduledDate: true,
        status: true,
      },
      orderBy: { scheduledDate: 'asc' },
    })

    const { longestStreak, longestStreakEndDate } = computeLongestStreak(doseLogs)

    for (const milestone of STREAK_MILESTONES) {
      if (longestStreak >= milestone.days) {
        // Estimate the date the milestone was earned:
        // It was earned (milestone.days) days before the streak ended
        const daysBeforeEnd = longestStreak - milestone.days
        let earnedAt: Date
        if (longestStreakEndDate) {
          earnedAt = new Date(longestStreakEndDate)
          earnedAt.setDate(earnedAt.getDate() - daysBeforeEnd)
        } else {
          earnedAt = new Date()
        }

        achievements.push({
          id: `streak-${milestone.days}`,
          type: 'streak',
          title: milestone.title,
          description: milestone.description,
          earnedAt: earnedAt.toISOString(),
          icon: milestone.icon,
        })
      }
    }

    // ── 2. Protocol Milestones (protocols with >28 days active) ──

    const protocols = await prisma.protocol.findMany({
      where: {
        userId: authResult.userId,
        status: { in: ['active', 'completed'] },
      },
      select: {
        id: true,
        startDate: true,
        endDate: true,
        status: true,
        peptide: {
          select: { name: true },
        },
      },
    })

    for (const protocol of protocols) {
      const endDate = protocol.endDate || new Date()
      const activeDays = differenceInDays(endDate, protocol.startDate)

      if (activeDays > 28) {
        achievements.push({
          id: `protocol-28-${protocol.id}`,
          type: 'protocol',
          title: `${protocol.peptide.name} Veteran`,
          description: `${protocol.peptide.name} protocol active for ${activeDays} days`,
          earnedAt: new Date(
            protocol.startDate.getTime() + 28 * 24 * 60 * 60 * 1000
          ).toISOString(),
          icon: 'checkmark.seal.fill',
        })
      }
    }

    // ── 3. Adherence Achievements (weeks with >90% or 100% adherence) ──

    const weeklyAdherence = computeWeeklyAdherence(doseLogs)

    // Count perfect weeks (100%) and high-adherence weeks (>90%)
    const perfectWeeks = weeklyAdherence.filter(w => w.rate === 1 && w.total >= 3)
    const highAdherenceWeeks = weeklyAdherence.filter(w => w.rate >= 0.9 && w.total >= 3)

    // First perfect week
    if (perfectWeeks.length > 0) {
      achievements.push({
        id: 'adherence-perfect-first',
        type: 'adherence',
        title: 'Perfect Week',
        description: '100% adherence for an entire week',
        earnedAt: perfectWeeks[0].weekStart.toISOString(),
        icon: 'checkmark.circle.fill',
      })
    }

    // 4 perfect weeks
    if (perfectWeeks.length >= 4) {
      achievements.push({
        id: 'adherence-perfect-4',
        type: 'adherence',
        title: 'Month of Perfection',
        description: '4 weeks with 100% adherence',
        earnedAt: perfectWeeks[3].weekStart.toISOString(),
        icon: 'sparkles',
      })
    }

    // First high-adherence week (>90%)
    if (highAdherenceWeeks.length > 0) {
      achievements.push({
        id: 'adherence-90-first',
        type: 'adherence',
        title: 'High Performer',
        description: 'Over 90% adherence in a week',
        earnedAt: highAdherenceWeeks[0].weekStart.toISOString(),
        icon: 'chart.bar.fill',
      })
    }

    // 8 high-adherence weeks
    if (highAdherenceWeeks.length >= 8) {
      achievements.push({
        id: 'adherence-90-8',
        type: 'adherence',
        title: 'Consistency King',
        description: '8 weeks with over 90% adherence',
        earnedAt: highAdherenceWeeks[7].weekStart.toISOString(),
        icon: 'chart.line.uptrend.xyaxis',
      })
    }

    // ── 4. Health Milestones (pillar scores that reached 80+) ──

    const snapshots = await prisma.healthBrainSnapshot.findMany({
      where: { userId: authResult.userId },
      select: {
        domainsJson: true,
        evaluatedAt: true,
      },
      orderBy: { evaluatedAt: 'asc' },
    })

    // Track which domains already earned an achievement (take earliest occurrence)
    const domainAchievedAt = new Map<string, Date>()

    for (const snapshot of snapshots) {
      try {
        const domains = JSON.parse(snapshot.domainsJson) as Record<string, { score?: number }>
        for (const [domainKey, domainData] of Object.entries(domains)) {
          if (
            domainData?.score !== undefined &&
            domainData.score >= 80 &&
            !domainAchievedAt.has(domainKey)
          ) {
            domainAchievedAt.set(domainKey, snapshot.evaluatedAt)
          }
        }
      } catch {
        // Skip unparseable snapshots
      }
    }

    // Map domain keys to display names
    const DOMAIN_LABELS: Record<string, string> = {
      sleep: 'Sleep',
      recovery: 'Recovery',
      activity: 'Activity',
      cardiovascular: 'Cardiovascular',
      metabolic: 'Metabolic',
      hormonal: 'Hormonal',
      inflammation: 'Inflammation',
      bodyComp: 'Body Composition',
    }

    const DOMAIN_ICONS: Record<string, string> = {
      sleep: 'moon.fill',
      recovery: 'heart.fill',
      activity: 'figure.run',
      cardiovascular: 'waveform.path.ecg',
      metabolic: 'bolt.heart.fill',
      hormonal: 'drop.fill',
      inflammation: 'shield.checkered',
      bodyComp: 'figure.stand',
    }

    for (const [domainKey, earnedAt] of domainAchievedAt) {
      const label = DOMAIN_LABELS[domainKey] || domainKey
      const icon = DOMAIN_ICONS[domainKey] || 'star.fill'

      achievements.push({
        id: `health-80-${domainKey}`,
        type: 'health',
        title: `${label} Elite`,
        description: `${label} score reached 80+`,
        earnedAt: earnedAt.toISOString(),
        icon,
      })
    }

    // Sort all achievements by earnedAt (most recent first)
    achievements.sort((a, b) => new Date(b.earnedAt).getTime() - new Date(a.earnedAt).getTime())

    console.log(`[achievements] userId=${authResult.userId} ${Date.now() - start}ms 200 count=${achievements.length}`)

    return NextResponse.json({
      achievements,
      summary: {
        total: achievements.length,
        byType: {
          streak: achievements.filter(a => a.type === 'streak').length,
          protocol: achievements.filter(a => a.type === 'protocol').length,
          adherence: achievements.filter(a => a.type === 'adherence').length,
          health: achievements.filter(a => a.type === 'health').length,
        },
        longestStreak,
      },
    }, {
      headers: { 'Cache-Control': 'private, max-age=300' },
    })
  } catch (error) {
    console.error(`[achievements] ${Date.now() - start}ms 500`, error instanceof Error ? error.message : error)
    return NextResponse.json(
      { error: 'Failed to compute achievements' },
      { status: 500 },
    )
  }
}
