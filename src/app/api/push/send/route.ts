import { NextRequest, NextResponse } from 'next/server'
import webpush from 'web-push'
import prisma from '@/lib/prisma'
import { sendAPNsNotification, isAPNsConfigured } from '@/lib/native-push'

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

    const notificationTitle = title || 'Peptide Reminder'
    const notificationBody = message || 'Time for your dose!'
    const notificationUrl = url || '/today'

    // Get Web Push subscriptions
    const whereClause = userId ? { userId, enabled: true } : { enabled: true }
    const webSubscriptions = await prisma.pushSubscription.findMany({
      where: whereClause,
    })

    // Get native device tokens
    const deviceTokens = await prisma.deviceToken.findMany({
      where: whereClause,
    })

    let webSent = 0
    let webFailed = 0
    let nativeSent = 0
    let nativeFailed = 0

    // Send Web Push notifications
    if (vapidPublicKey && vapidPrivateKey && webSubscriptions.length > 0) {
      const payload: PushPayload = {
        title: notificationTitle,
        body: notificationBody,
        url: notificationUrl,
      }

      const webResults = await Promise.allSettled(
        webSubscriptions.map(async (sub) => {
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

      webSent = webResults.filter((r) => r.status === 'fulfilled').length
      webFailed = webResults.filter((r) => r.status === 'rejected').length
    }

    // Send native push notifications (iOS via APNs)
    if (isAPNsConfigured() && deviceTokens.length > 0) {
      const iosTokens = deviceTokens.filter(t => t.platform === 'ios')

      const nativeResults = await Promise.allSettled(
        iosTokens.map(async (device) => {
          const result = await sendAPNsNotification(
            device.token,
            notificationTitle,
            notificationBody,
            { url: notificationUrl }
          )

          if (!result.success) {
            // Handle invalid tokens
            if (result.error?.includes('BadDeviceToken') ||
                result.error?.includes('Unregistered')) {
              await prisma.deviceToken.delete({
                where: { id: device.id },
              }).catch(() => {})
            }
            throw new Error(result.error)
          }

          return result
        })
      )

      nativeSent = nativeResults.filter((r) => r.status === 'fulfilled').length
      nativeFailed = nativeResults.filter((r) => r.status === 'rejected').length
    }

    const totalSent = webSent + nativeSent
    const totalFailed = webFailed + nativeFailed
    const total = webSubscriptions.length + deviceTokens.length

    if (total === 0) {
      return NextResponse.json({
        success: true,
        sent: 0,
        message: 'No subscriptions or device tokens found',
      })
    }

    return NextResponse.json({
      success: true,
      sent: totalSent,
      failed: totalFailed,
      total,
      details: {
        web: { sent: webSent, failed: webFailed, total: webSubscriptions.length },
        native: { sent: nativeSent, failed: nativeFailed, total: deviceTokens.length },
      },
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
