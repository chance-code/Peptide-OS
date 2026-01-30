import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

// GET /api/debug - Debug database connection
export async function GET() {
  try {
    const tursoUrl = process.env.TURSO_DATABASE_URL
    const hasToken = !!process.env.TURSO_AUTH_TOKEN

    // Test database connection
    const users = await prisma.userProfile.findMany()
    const activeUser = users.find(u => u.isActive)

    const protocols = await prisma.protocol.findMany({
      where: activeUser ? { userId: activeUser.id } : undefined,
      include: { peptide: true }
    })

    const doseLogs = await prisma.doseLog.count()

    return NextResponse.json({
      env: {
        tursoUrl: tursoUrl ? tursoUrl.substring(0, 30) + '...' : 'NOT SET',
        hasToken,
        nodeEnv: process.env.NODE_ENV,
      },
      data: {
        userCount: users.length,
        users: users.map(u => ({ id: u.id, name: u.name, isActive: u.isActive })),
        protocolCount: protocols.length,
        protocols: protocols.map(p => ({
          id: p.id,
          peptide: p.peptide.name,
          status: p.status,
          userId: p.userId,
          startDate: p.startDate,
          endDate: p.endDate,
        })),
        doseLogCount: doseLogs,
      }
    })
  } catch (error) {
    console.error('Debug error:', error)
    return NextResponse.json({
      error: String(error),
      stack: error instanceof Error ? error.stack : undefined
    }, { status: 500 })
  }
}
