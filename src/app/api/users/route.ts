import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

// GET /api/users - List all users
export async function GET() {
  try {
    const users = await prisma.userProfile.findMany({
      orderBy: { name: 'asc' },
    })
    return NextResponse.json(users, {
      headers: {
        'Cache-Control': 'private, max-age=300', // 5 min cache
      },
    })
  } catch (error) {
    console.error('Error fetching users:', error)
    return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 })
  }
}

// POST /api/users - Create a new user
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { name, notes } = body

    if (!name || typeof name !== 'string') {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 })
    }

    // If this is the first user, make them active
    const existingUsers = await prisma.userProfile.count()
    const isActive = existingUsers === 0

    const user = await prisma.userProfile.create({
      data: {
        name,
        notes,
        isActive,
      },
    })

    return NextResponse.json(user, { status: 201 })
  } catch (error) {
    console.error('Error creating user:', error)
    return NextResponse.json({ error: 'Failed to create user' }, { status: 500 })
  }
}
