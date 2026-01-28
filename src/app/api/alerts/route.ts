import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { differenceInDays } from 'date-fns'

export interface Alert {
  id: string
  type: 'expiring' | 'expired' | 'low_inventory' | 'protocol_ending'
  severity: 'warning' | 'danger' | 'info'
  title: string
  message: string
  link?: string
}

// GET /api/alerts - Get alerts for a user
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const userId = searchParams.get('userId')

    if (!userId) {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 })
    }

    const alerts: Alert[] = []
    const now = new Date()

    // Check for expiring vials (within 7 days)
    const expiringVials = await prisma.inventoryVial.findMany({
      where: {
        userId,
        isExpired: false,
        isExhausted: false,
        expirationDate: {
          not: null,
          lte: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
          gt: now,
        },
      },
      include: {
        peptide: true,
      },
    })

    for (const vial of expiringVials) {
      const daysLeft = differenceInDays(new Date(vial.expirationDate!), now)
      alerts.push({
        id: `expiring-${vial.id}`,
        type: 'expiring',
        severity: daysLeft <= 3 ? 'danger' : 'warning',
        title: `${vial.peptide.name} expiring soon`,
        message: `${vial.identifier || 'Vial'} expires in ${daysLeft} day${daysLeft === 1 ? '' : 's'}`,
        link: `/inventory/${vial.id}`,
      })
    }

    // Check for expired vials that haven't been marked
    const expiredVials = await prisma.inventoryVial.findMany({
      where: {
        userId,
        isExpired: false,
        isExhausted: false,
        expirationDate: {
          not: null,
          lt: now,
        },
      },
      include: {
        peptide: true,
      },
    })

    for (const vial of expiredVials) {
      alerts.push({
        id: `expired-${vial.id}`,
        type: 'expired',
        severity: 'danger',
        title: `${vial.peptide.name} has expired`,
        message: `${vial.identifier || 'Vial'} should be discarded`,
        link: `/inventory/${vial.id}`,
      })

      // Auto-mark as expired
      await prisma.inventoryVial.update({
        where: { id: vial.id },
        data: { isExpired: true },
      })
    }

    // Check for low inventory (remaining amount < 20% of total)
    const lowInventoryVials = await prisma.inventoryVial.findMany({
      where: {
        userId,
        isExpired: false,
        isExhausted: false,
        remainingAmount: { not: null },
      },
      include: {
        peptide: true,
      },
    })

    for (const vial of lowInventoryVials) {
      if (vial.remainingAmount && vial.totalAmount) {
        const percentRemaining = (vial.remainingAmount / vial.totalAmount) * 100
        if (percentRemaining <= 20) {
          alerts.push({
            id: `low-${vial.id}`,
            type: 'low_inventory',
            severity: 'warning',
            title: `${vial.peptide.name} running low`,
            message: `${Math.round(percentRemaining)}% remaining`,
            link: `/inventory/${vial.id}`,
          })
        }
      }
    }

    // Check for protocols ending soon (within 7 days)
    const endingProtocols = await prisma.protocol.findMany({
      where: {
        userId,
        status: 'active',
        endDate: {
          not: null,
          lte: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
          gt: now,
        },
      },
      include: {
        peptide: true,
      },
    })

    for (const protocol of endingProtocols) {
      const daysLeft = differenceInDays(new Date(protocol.endDate!), now)
      alerts.push({
        id: `protocol-ending-${protocol.id}`,
        type: 'protocol_ending',
        severity: 'info',
        title: `${protocol.peptide.name} cycle ending`,
        message: `${daysLeft} day${daysLeft === 1 ? '' : 's'} remaining`,
        link: `/protocols/${protocol.id}`,
      })
    }

    // Sort by severity (danger first, then warning, then info)
    const severityOrder = { danger: 0, warning: 1, info: 2 }
    alerts.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity])

    return NextResponse.json(alerts)
  } catch (error) {
    console.error('Error fetching alerts:', error)
    return NextResponse.json({ error: 'Failed to fetch alerts' }, { status: 500 })
  }
}
