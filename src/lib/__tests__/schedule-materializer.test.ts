import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { PrismaClient } from '@prisma/client'
import { execSync } from 'node:child_process'
import { unlinkSync, existsSync } from 'node:fs'
import path from 'node:path'

import { materializeScheduleForProtocol } from '../schedule-materializer'

const TEST_DB_PATH = '/tmp/arc_materializer_test.db'
const TEST_DB_URL = `file:${TEST_DB_PATH}`

let prisma: PrismaClient

beforeAll(async () => {
  if (existsSync(TEST_DB_PATH)) unlinkSync(TEST_DB_PATH)
  const repoRoot = path.resolve(__dirname, '../../..')
  execSync(`npx prisma migrate deploy --schema=prisma/schema.prisma`, {
    cwd: repoRoot,
    env: { ...process.env, DATABASE_URL: TEST_DB_URL },
    stdio: 'pipe',
  })
  prisma = new PrismaClient({ datasources: { db: { url: TEST_DB_URL } } })
})

afterAll(async () => {
  await prisma.$disconnect()
  if (existsSync(TEST_DB_PATH)) unlinkSync(TEST_DB_PATH)
})

beforeEach(async () => {
  await prisma.doseSchedule.deleteMany({})
  await prisma.titrationStep.deleteMany({})
  await prisma.protocolCycle.deleteMany({})
  await prisma.protocol.deleteMany({})
  await prisma.peptide.deleteMany({})
  await prisma.userProfile.deleteMany({})
})

async function seedProtocol(overrides: {
  frequency?: string
  customDays?: string | null
  cycleMode?: string
  startDate?: Date
  endDate?: Date | null
  doseAmount?: number
  doseUnit?: string
  status?: string
} = {}) {
  const user = await prisma.userProfile.create({ data: { name: 'Test User' } })
  const peptide = await prisma.peptide.create({
    data: { name: `Test-${Date.now()}-${Math.random()}`, type: 'peptide' },
  })
  const protocol = await prisma.protocol.create({
    data: {
      userId: user.id,
      peptideId: peptide.id,
      startDate: overrides.startDate ?? new Date('2026-01-01T00:00:00Z'),
      endDate: overrides.endDate ?? null,
      frequency: overrides.frequency ?? 'daily',
      customDays: overrides.customDays ?? null,
      doseAmount: overrides.doseAmount ?? 250,
      doseUnit: overrides.doseUnit ?? 'mcg',
      status: overrides.status ?? 'active',
      cycleMode: overrides.cycleMode ?? 'continuous',
    },
  })
  return { userId: user.id, peptideId: peptide.id, protocolId: protocol.id }
}

describe('materializeScheduleForProtocol', () => {
  it('daily continuous protocol: 90-day horizon → ~90 rows', async () => {
    const { protocolId } = await seedProtocol({ frequency: 'daily' })
    const result = await prisma.$transaction((tx) => materializeScheduleForProtocol(tx, protocolId, 90))
    expect(result.created).toBeGreaterThanOrEqual(89) // 90 days, possibly 91 depending on today
    expect(result.created).toBeLessThanOrEqual(91)
  })

  it('custom frequency on mon/wed/fri: produces roughly 3/7 of horizon rows', async () => {
    const { protocolId } = await seedProtocol({
      frequency: 'custom',
      customDays: JSON.stringify(['mon', 'wed', 'fri']),
    })
    const result = await prisma.$transaction((tx) => materializeScheduleForProtocol(tx, protocolId, 70))
    // 70 days ≈ 10 weeks × 3 days/week = ~30 rows (allow ±2 for today's weekday)
    expect(result.created).toBeGreaterThanOrEqual(28)
    expect(result.created).toBeLessThanOrEqual(32)
  })

  it('cycled protocol: off-phase days are excluded', async () => {
    const today = new Date()
    const { protocolId } = await seedProtocol({
      frequency: 'daily',
      cycleMode: 'cycled',
      startDate: today,
    })
    await prisma.protocolCycle.create({
      data: {
        protocolId,
        onDays: 28,
        offDays: 14,
        cycleStartDate: today,
        repeatCount: -1,
      },
    })
    const result = await prisma.$transaction((tx) => materializeScheduleForProtocol(tx, protocolId, 42))
    // Horizon 42 days walks days 0..42 inclusive (43 iterations):
    //   - days 0..27 are on-phase (28 on-days)
    //   - days 28..41 are off-phase (14 off-days)
    //   - day 42 starts the next cycle (+1 on-day)
    // → 29 schedule rows
    expect(result.created).toBe(29)
  })

  it('titrated protocol: uses step dose, not base dose', async () => {
    const today = new Date()
    const { protocolId } = await seedProtocol({
      frequency: 'weekly',
      doseAmount: 2, // base dose
      doseUnit: 'mg',
      cycleMode: 'titrated',
      startDate: today,
    })
    await prisma.titrationStep.createMany({
      data: [
        { protocolId, stepIndex: 0, weekOffset: 0, doseAmount: 2, doseUnit: 'mg' },
        { protocolId, stepIndex: 1, weekOffset: 4, doseAmount: 4, doseUnit: 'mg' },
        { protocolId, stepIndex: 2, weekOffset: 8, doseAmount: 6, doseUnit: 'mg' },
      ],
    })
    await prisma.$transaction((tx) => materializeScheduleForProtocol(tx, protocolId, 84))
    const rows = await prisma.doseSchedule.findMany({
      where: { protocolId },
      orderBy: { scheduledDate: 'asc' },
    })
    // Weekly for 84 days = 12-13 doses; doses should match titration schedule
    expect(rows.length).toBeGreaterThanOrEqual(12)
    expect(rows[0].doseAmount).toBe(2) // step 0
    // At ~week 5 (row index 4, 5th weekly dose) → step 1 (4mg)
    const week5Dose = rows.find(
      (r) =>
        r.scheduledDate.getTime() >=
        today.getTime() + 28 * 24 * 60 * 60 * 1000,
    )
    expect(week5Dose?.doseAmount).toBe(4)
  })

  it('inactive protocol: clears future rows, creates none', async () => {
    const { protocolId } = await seedProtocol({ frequency: 'daily', status: 'active' })
    // Materialize once to get rows
    await prisma.$transaction((tx) => materializeScheduleForProtocol(tx, protocolId, 10))
    expect(await prisma.doseSchedule.count({ where: { protocolId } })).toBeGreaterThan(0)

    // Pause it
    await prisma.protocol.update({ where: { id: protocolId }, data: { status: 'paused' } })
    const result = await prisma.$transaction((tx) => materializeScheduleForProtocol(tx, protocolId, 10))

    expect(result.created).toBe(0)
    expect(result.deletedFuture).toBeGreaterThan(0)
    expect(await prisma.doseSchedule.count({ where: { protocolId } })).toBe(0)
  })

  it('ended protocol: produces 0 rows (effectiveEnd < today)', async () => {
    const { protocolId } = await seedProtocol({
      frequency: 'daily',
      startDate: new Date('2025-11-01'),
      endDate: new Date('2026-02-25'), // past
    })
    const result = await prisma.$transaction((tx) => materializeScheduleForProtocol(tx, protocolId, 90))
    expect(result.created).toBe(0)
  })

  it('re-materialization: deletes old future rows and recreates — idempotent', async () => {
    const { protocolId } = await seedProtocol({ frequency: 'daily' })
    const first = await prisma.$transaction((tx) => materializeScheduleForProtocol(tx, protocolId, 30))
    const second = await prisma.$transaction((tx) => materializeScheduleForProtocol(tx, protocolId, 30))
    expect(first.created).toBe(second.created)
    expect(second.deletedFuture).toBe(first.created) // second deletes what first created
    expect(await prisma.doseSchedule.count({ where: { protocolId } })).toBe(first.created)
  })

  it('protocol with future startDate: begins materialization at startDate, not today', async () => {
    const future = new Date()
    future.setDate(future.getDate() + 10) // 10 days from now
    const { protocolId } = await seedProtocol({ frequency: 'daily', startDate: future })
    const result = await prisma.$transaction((tx) => materializeScheduleForProtocol(tx, protocolId, 20))
    // Horizon is 20 days from today; startDate is 10 days from today → 10 usable days
    expect(result.created).toBeGreaterThanOrEqual(10)
    expect(result.created).toBeLessThanOrEqual(11)
  })
})
