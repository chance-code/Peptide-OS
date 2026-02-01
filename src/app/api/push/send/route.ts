import { NextRequest, NextResponse } from 'next/server'
import webpush from 'web-push'
import prisma from '@/lib/prisma'

// Configure web-push with VAPID keys
const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY
const vapidSubject = process.env.VAPID_SUBJECT || 'mailto:admin@localhost'

if (vapidPublicKey && vapidPrivateKey) {
  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey)
}

interface PushPayload {
  title: string
  body: string
  url?: string
}

// POST /api/push/send - Send push notification (for testing or scheduled sends)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { userId, title, message, url } = body

    if (!vapidPublicKey || !vapidPrivateKey) {
      return NextResponse.json(
        { error: 'VAPID keys not configured' },
        { status: 500 }
      )
    }

    // Get subscriptions to send to
    const whereClause = userId ? { userId, enabled: true } : { enabled: true }
    const subscriptions = await prisma.pushSubscription.findMany({
      where: whereClause,
    })

    if (subscriptions.length === 0) {
      return NextResponse.json({
        success: true,
        sent: 0,
        message: 'No subscriptions found',
      })
    }

    const payload: PushPayload = {
      title: title || 'Peptide Reminder',
      body: message || 'Time for your dose!',
      url: url || '/today',
    }

    const results = await Promise.allSettled(
      subscriptions.map(async (sub) => {
        const pushSubscription = {
          endpoint: sub.endpoint,
          keys: {
            p256dh: sub.p256dh,
            auth: sub.auth,
          },
        }

        try {
          await webpush.sendNotification(
            pushSubscription,
            JSON.stringify(payload)
          )
          return { success: true, endpoint: sub.endpoint }
        } catch (error: unknown) {
          // Handle expired subscriptions
          const webPushError = error as { statusCode?: number }
          if (webPushError.statusCode === 410 || webPushError.statusCode === 404) {
            // Subscription is no longer valid, remove it
            await prisma.pushSubscription.delete({
              where: { id: sub.id },
            })
          }
          throw error
        }
      })
    )

    const sent = results.filter((r) => r.status === 'fulfilled').length
    const failed = results.filter((r) => r.status === 'rejected').length

    return NextResponse.json({
      success: true,
      sent,
      failed,
      total: subscriptions.length,
    })
  } catch (error) {
    console.error('Error sending push notification:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json(
      { error: 'Failed to send notification', details: errorMessage },
      { status: 500 }
    )
  }
}
