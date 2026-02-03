import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { sendAPNsNotification, isAPNsConfigured } from '@/lib/native-push'

// Vercel Cron: runs every 15 minutes
// Checks for users with pending doses and sends reminders based on their configured times

// Check if a configured time (e.g., "08:07") falls within the current 15-minute window
function timeMatchesWindow(configuredTime: string, windowStartMinute: number): boolean {
  const minute = parseInt(configuredTime.split(':')[1] || '0', 10)
  const roundedConfigMinute = Math.floor(minute / 15) * 15
  return roundedConfigMinute === windowStartMinute
}

export async function GET(request: NextRequest) {
  // Verify cron secret to prevent unauthorized access
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const now = new Date()
  const currentHour = now.getUTCHours()
  const currentMinute = now.getUTCMinutes()

  // Round to nearest 15-minute window (e.g., "08:00", "08:15", "08:30", "08:45")
  const roundedMinute = Math.floor(currentMinute / 15) * 15
  const windowStart = `${String(currentHour).padStart(2, '0')}:${String(roundedMinute).padStart(2, '0')}`
  // Also match times within this 15-minute window (e.g., 08:00-08:14 all match "08:00")
  const hourPrefix = windowStart.slice(0, 3) // e.g., "08:"

  try {
    // Find device tokens with matching reminder times
    // We fetch all tokens for this hour, then filter more precisely in code
    const deviceTokens = await prisma.deviceToken.findMany({
      where: {
        enabled: true,
        OR: [
          { morningTime: { startsWith: hourPrefix } },
          { eveningTime: { startsWith: hourPrefix } },
        ],
      },
    })

    if (deviceTokens.length === 0) {
      return NextResponse.json({ sent: 0, message: 'No matching reminder times' })
    }

    // For each user with a matching device token, check if they have pending doses
    const sentResults = []

    for (const dt of deviceTokens) {
      if (!dt.userId) continue

      // Check if the user's configured time falls in this 15-minute window
      const morningMatch = dt.morningTime && timeMatchesWindow(dt.morningTime, roundedMinute)
      const eveningMatch = dt.eveningTime && timeMatchesWindow(dt.eveningTime, roundedMinute)
      if (!morningMatch && !eveningMatch) continue

      // Check for pending doses today
      const today = new Date()
      today.setUTCHours(0, 0, 0, 0)
      const tomorrow = new Date(today)
      tomorrow.setDate(tomorrow.getDate() + 1)

      const pendingDoses = await prisma.doseLog.count({
        where: {
          userId: dt.userId,
          scheduledDate: { gte: today, lt: tomorrow },
          status: 'pending',
        },
      })

      if (pendingDoses === 0) continue

      const timeLabel = morningMatch ? 'morning' : 'evening'

      // Send notification
      if (dt.platform === 'ios' && isAPNsConfigured()) {
        const result = await sendAPNsNotification(
          dt.token,
          'Dose Reminder',
          `You have ${pendingDoses} pending ${timeLabel} dose${pendingDoses > 1 ? 's' : ''}`,
          { url: '/today' }
        )
        sentResults.push({ userId: dt.userId, platform: 'ios', success: result.success })
      }
    }

    // Also check web push subscriptions
    const webSubscriptions = await prisma.pushSubscription.findMany({
      where: {
        enabled: true,
        OR: [
          { morningTime: { startsWith: hourPrefix } },
          { eveningTime: { startsWith: hourPrefix } },
        ],
      },
    })

    // Send web push notifications
    for (const sub of webSubscriptions) {
      if (!sub.userId) continue

      // Check if the user's configured time falls in this 15-minute window
      const morningMatch = sub.morningTime && timeMatchesWindow(sub.morningTime, roundedMinute)
      const eveningMatch = sub.eveningTime && timeMatchesWindow(sub.eveningTime, roundedMinute)
      if (!morningMatch && !eveningMatch) continue

      // Check for pending doses today
      const today = new Date()
      today.setUTCHours(0, 0, 0, 0)
      const tomorrow = new Date(today)
      tomorrow.setDate(tomorrow.getDate() + 1)

      const pendingDoses = await prisma.doseLog.count({
        where: {
          userId: sub.userId,
          scheduledDate: { gte: today, lt: tomorrow },
          status: 'pending',
        },
      })

      if (pendingDoses === 0) continue

      const timeLabel = morningMatch ? 'morning' : 'evening'

      try {
        const webPush = await import('web-push')
        webPush.setVapidDetails(
          process.env.VAPID_SUBJECT || 'mailto:admin@localhost',
          process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || '',
          process.env.VAPID_PRIVATE_KEY || ''
        )

        await webPush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          JSON.stringify({
            title: 'Dose Reminder',
            body: `You have ${pendingDoses} pending ${timeLabel} dose${pendingDoses > 1 ? 's' : ''}`,
            url: '/today',
          })
        )
        sentResults.push({ userId: sub.userId, platform: 'web', success: true })
      } catch (error) {
        sentResults.push({ userId: sub.userId, platform: 'web', success: false })
      }
    }

    return NextResponse.json({
      sent: sentResults.filter(r => r.success).length,
      failed: sentResults.filter(r => !r.success).length,
      total: sentResults.length,
    })
  } catch (error) {
    console.error('Cron reminder error:', error)
    return NextResponse.json({ error: 'Failed to process reminders' }, { status: 500 })
  }
}
