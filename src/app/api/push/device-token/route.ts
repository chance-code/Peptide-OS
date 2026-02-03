import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

// POST /api/push/device-token - Register device token for native push
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { token, platform, userId, morningTime, eveningTime } = body

    if (!token || !platform) {
      return NextResponse.json(
        { error: 'Token and platform are required' },
        { status: 400 }
      )
    }

    if (!['ios', 'android'].includes(platform)) {
      return NextResponse.json(
        { error: 'Platform must be ios or android' },
        { status: 400 }
      )
    }

    // Upsert device token
    const deviceToken = await prisma.deviceToken.upsert({
      where: { token },
      update: {
        platform,
        userId: userId || null,
        morningTime: morningTime || null,
        eveningTime: eveningTime || null,
        enabled: true,
      },
      create: {
        token,
        platform,
        userId: userId || null,
        morningTime: morningTime || null,
        eveningTime: eveningTime || null,
        enabled: true,
      },
    })

    return NextResponse.json({
      success: true,
      id: deviceToken.id,
    })
  } catch (error) {
    console.error('Error registering device token:', error)
    return NextResponse.json(
      { error: 'Failed to register device token' },
      { status: 500 }
    )
  }
}

// DELETE /api/push/device-token - Unregister device token
export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json()
    const { token } = body

    if (!token) {
      return NextResponse.json(
        { error: 'Token is required' },
        { status: 400 }
      )
    }

    await prisma.deviceToken.delete({
      where: { token },
    }).catch(() => {
      // Token may not exist, that's okay
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error unregistering device token:', error)
    return NextResponse.json(
      { error: 'Failed to unregister device token' },
      { status: 500 }
    )
  }
}
