import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

// POST /api/push/subscribe - Subscribe to push notifications
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { subscription, userId, morningTime, eveningTime } = body

    if (!subscription || !subscription.endpoint) {
      return NextResponse.json(
        { error: 'Invalid subscription' },
        { status: 400 }
      )
    }

    const keys = subscription.keys || {}

    // Upsert subscription (update if endpoint exists, create if not)
    const pushSubscription = await prisma.pushSubscription.upsert({
      where: { endpoint: subscription.endpoint },
      update: {
        p256dh: keys.p256dh || '',
        auth: keys.auth || '',
        userId: userId || null,
        morningTime: morningTime || null,
        eveningTime: eveningTime || null,
        enabled: true,
      },
      create: {
        endpoint: subscription.endpoint,
        p256dh: keys.p256dh || '',
        auth: keys.auth || '',
        userId: userId || null,
        morningTime: morningTime || null,
        eveningTime: eveningTime || null,
        enabled: true,
      },
    })

    return NextResponse.json({
      success: true,
      id: pushSubscription.id,
    })
  } catch (error) {
    console.error('Error subscribing to push:', error)
    return NextResponse.json(
      { error: 'Failed to subscribe' },
      { status: 500 }
    )
  }
}

// DELETE /api/push/subscribe - Unsubscribe from push notifications
export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json()
    const { endpoint } = body

    if (!endpoint) {
      return NextResponse.json(
        { error: 'Endpoint is required' },
        { status: 400 }
      )
    }

    await prisma.pushSubscription.delete({
      where: { endpoint },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error unsubscribing from push:', error)
    return NextResponse.json(
      { error: 'Failed to unsubscribe' },
      { status: 500 }
    )
  }
}
