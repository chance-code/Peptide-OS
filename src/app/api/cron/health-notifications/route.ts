import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { sendAPNsNotification, isAPNsConfigured } from '@/lib/native-push'
import { generateMorningBriefing, checkEvidenceMilestones } from '@/lib/health-push-notifications'

// Vercel Cron: runs daily
// Sends health briefings and evidence milestone notifications to users
// with active health integrations and registered device tokens.

export async function GET(request: NextRequest) {
  // Verify cron secret to prevent unauthorized access
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // Find all users with active health integrations
    const integrations = await prisma.healthIntegration.findMany({
      where: { isConnected: true },
      select: { userId: true },
    })

    // De-duplicate user IDs
    const userIds = [...new Set(integrations.map(i => i.userId))]

    if (userIds.length === 0) {
      return NextResponse.json({ sent: 0, message: 'No users with active health integrations' })
    }

    const sentResults: Array<{ userId: string; type: string; platform: string; success: boolean }> = []

    for (const userId of userIds) {
      // Fetch device tokens for this user
      const deviceTokens = await prisma.deviceToken.findMany({
        where: { userId, enabled: true },
      })

      // Fetch web push subscriptions for this user
      const webSubscriptions = await prisma.pushSubscription.findMany({
        where: { userId, enabled: true },
      })

      // Skip if no notification channels are available
      if (deviceTokens.length === 0 && webSubscriptions.length === 0) {
        continue
      }

      // 1. Generate morning briefing
      const briefing = await generateMorningBriefing(userId)

      if (briefing) {
        // Send to iOS devices
        for (const dt of deviceTokens) {
          if (dt.platform === 'ios' && isAPNsConfigured()) {
            const result = await sendAPNsNotification(
              dt.token,
              briefing.title,
              briefing.body,
              briefing.data
            )
            sentResults.push({
              userId,
              type: 'health_briefing',
              platform: 'ios',
              success: result.success,
            })
          }
        }

        // Send to web push subscriptions
        for (const sub of webSubscriptions) {
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
                title: briefing.title,
                body: briefing.body,
                url: '/today',
                data: briefing.data,
              })
            )
            sentResults.push({
              userId,
              type: 'health_briefing',
              platform: 'web',
              success: true,
            })
          } catch {
            sentResults.push({
              userId,
              type: 'health_briefing',
              platform: 'web',
              success: false,
            })
          }
        }
      }

      // 2. Check evidence milestones
      const milestones = await checkEvidenceMilestones(userId)

      for (const milestone of milestones) {
        // Send to iOS devices
        for (const dt of deviceTokens) {
          if (dt.platform === 'ios' && isAPNsConfigured()) {
            const result = await sendAPNsNotification(
              dt.token,
              milestone.title,
              milestone.body,
              milestone.data
            )
            sentResults.push({
              userId,
              type: 'evidence_milestone',
              platform: 'ios',
              success: result.success,
            })
          }
        }

        // Send to web push subscriptions
        for (const sub of webSubscriptions) {
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
                title: milestone.title,
                body: milestone.body,
                url: '/health',
                data: milestone.data,
              })
            )
            sentResults.push({
              userId,
              type: 'evidence_milestone',
              platform: 'web',
              success: true,
            })
          } catch {
            sentResults.push({
              userId,
              type: 'evidence_milestone',
              platform: 'web',
              success: false,
            })
          }
        }
      }
    }

    return NextResponse.json({
      sent: sentResults.filter(r => r.success).length,
      failed: sentResults.filter(r => !r.success).length,
      total: sentResults.length,
      usersProcessed: userIds.length,
      breakdown: {
        briefings: sentResults.filter(r => r.type === 'health_briefing' && r.success).length,
        milestones: sentResults.filter(r => r.type === 'evidence_milestone' && r.success).length,
      },
    })
  } catch (error) {
    console.error('Health notifications cron error:', error)
    return NextResponse.json({ error: 'Failed to process health notifications' }, { status: 500 })
  }
}
