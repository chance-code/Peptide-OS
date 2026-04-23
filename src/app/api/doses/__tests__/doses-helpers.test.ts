import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { PrismaClient } from '@prisma/client'
import { execSync } from 'node:child_process'
import { unlinkSync, existsSync } from 'node:fs'
import path from 'node:path'

import { shouldDecrementVial } from '../route'

// ────────────────────────────────────────────────────────────────────────────
// shouldDecrementVial — pure decision logic
// ────────────────────────────────────────────────────────────────────────────

describe('shouldDecrementVial', () => {
  it('new completed log with vial + volume → decrement', () => {
    expect(shouldDecrementVial(null, 'completed', 'vial_1', 0.05)).toBe(true)
  })

  it('pending → completed transition → decrement', () => {
    expect(shouldDecrementVial('pending', 'completed', 'vial_1', 0.05)).toBe(true)
  })

  it('idempotent completed → completed → no decrement (prevent double-charge)', () => {
    expect(shouldDecrementVial('completed', 'completed', 'vial_1', 0.05)).toBe(false)
  })

  it('status != completed → no decrement', () => {
    expect(shouldDecrementVial(null, 'skipped', 'vial_1', 0.05)).toBe(false)
    expect(shouldDecrementVial(null, 'missed', 'vial_1', 0.05)).toBe(false)
    expect(shouldDecrementVial(null, 'pending', 'vial_1', 0.05)).toBe(false)
  })

  it('missing vialId or volumeDrawnMl → no decrement', () => {
    expect(shouldDecrementVial(null, 'completed', null, 0.05)).toBe(false)
    expect(shouldDecrementVial(null, 'completed', 'vial_1', null)).toBe(false)
    expect(shouldDecrementVial(null, 'completed', 'vial_1', 0)).toBe(false)
    expect(shouldDecrementVial(null, 'completed', 'vial_1', -1)).toBe(false)
  })
})

// ────────────────────────────────────────────────────────────────────────────
// Concurrency: two racing dose-logs against the same vial must not
// double-decrement past remainingVolumeMl (this is the atomicity test the
// refocus plan calls out).
// ────────────────────────────────────────────────────────────────────────────

const TEST_DB_PATH = '/tmp/arc_doses_concurrency_test.db'
const TEST_DB_URL = `file:${TEST_DB_PATH}`

let prisma: PrismaClient

beforeAll(async () => {
  if (existsSync(TEST_DB_PATH)) unlinkSync(TEST_DB_PATH)

  // Apply the baseline + refocus migrations to the temp DB so schema is current.
  const repoRoot = path.resolve(__dirname, '../../../../..')
  execSync(`npx prisma migrate deploy --schema=prisma/schema.prisma`, {
    cwd: repoRoot,
    env: { ...process.env, DATABASE_URL: TEST_DB_URL },
    stdio: 'pipe',
  })

  prisma = new PrismaClient({
    datasources: { db: { url: TEST_DB_URL } },
  })
})

afterAll(async () => {
  await prisma.$disconnect()
  if (existsSync(TEST_DB_PATH)) unlinkSync(TEST_DB_PATH)
})

beforeEach(async () => {
  // Clean slate every test
  await prisma.doseLog.deleteMany({})
  await prisma.inventoryVial.deleteMany({})
  await prisma.protocol.deleteMany({})
  await prisma.peptide.deleteMany({})
  await prisma.userProfile.deleteMany({})
})

async function seedVialWithVolume(remainingMl: number) {
  const user = await prisma.userProfile.create({ data: { name: 'Test User' } })
  const peptide = await prisma.peptide.create({
    data: { name: `Test-${Date.now()}-${Math.random()}`, type: 'peptide' },
  })
  const protocol = await prisma.protocol.create({
    data: {
      userId: user.id,
      peptideId: peptide.id,
      startDate: new Date(),
      frequency: 'daily',
      doseAmount: 1,
      doseUnit: 'mg',
    },
  })
  const vial = await prisma.inventoryVial.create({
    data: {
      userId: user.id,
      peptideId: peptide.id,
      totalAmount: 10,
      totalUnit: 'mg',
      diluentVolume: 2,
      concentration: 5,
      remainingVolumeMl: remainingMl,
    },
  })
  return { userId: user.id, protocolId: protocol.id, vialId: vial.id }
}

async function attemptDecrement(vialId: string, userId: string, volumeDrawnMl: number) {
  return prisma.inventoryVial.updateMany({
    where: {
      id: vialId,
      userId,
      remainingVolumeMl: { gte: volumeDrawnMl },
      isExhausted: false,
    },
    data: {
      remainingVolumeMl: { decrement: volumeDrawnMl },
    },
  })
}

describe('InventoryVial atomic decrement (race condition safety)', () => {
  it('two concurrent 0.06 mL decrements against a 0.10 mL vial: exactly one succeeds', async () => {
    const { vialId, userId } = await seedVialWithVolume(0.1)

    // Fire two in parallel. The conditional WHERE (remainingVolumeMl >= 0.06)
    // guarantees only one succeeds — SQLite serializes writes and the second
    // sees the already-decremented value.
    const [r1, r2] = await Promise.all([
      attemptDecrement(vialId, userId, 0.06),
      attemptDecrement(vialId, userId, 0.06),
    ])

    // Exactly one update matched (count=1); the other didn't (count=0)
    const successes = [r1.count, r2.count].filter((c) => c === 1).length
    const failures = [r1.count, r2.count].filter((c) => c === 0).length
    expect(successes).toBe(1)
    expect(failures).toBe(1)

    // Final vial state: 0.10 - 0.06 = 0.04 remaining
    const after = await prisma.inventoryVial.findUnique({ where: { id: vialId } })
    expect(after?.remainingVolumeMl).toBeCloseTo(0.04, 5)
  })

  it('three sequential 0.04 mL decrements against 0.10 mL: only two succeed, last fails', async () => {
    const { vialId, userId } = await seedVialWithVolume(0.1)

    const r1 = await attemptDecrement(vialId, userId, 0.04) // 0.10 → 0.06
    const r2 = await attemptDecrement(vialId, userId, 0.04) // 0.06 → 0.02
    const r3 = await attemptDecrement(vialId, userId, 0.04) // 0.02 < 0.04 → no-op

    expect(r1.count).toBe(1)
    expect(r2.count).toBe(1)
    expect(r3.count).toBe(0)

    const after = await prisma.inventoryVial.findUnique({ where: { id: vialId } })
    expect(after?.remainingVolumeMl).toBeCloseTo(0.02, 5)
  })

  it('exact-equality draw: remainingVolumeMl = 0.05, draw = 0.05 succeeds (gte check)', async () => {
    const { vialId, userId } = await seedVialWithVolume(0.05)

    const r = await attemptDecrement(vialId, userId, 0.05)
    expect(r.count).toBe(1)

    const after = await prisma.inventoryVial.findUnique({ where: { id: vialId } })
    expect(after?.remainingVolumeMl).toBeCloseTo(0, 5)
  })

  it('draws against an isExhausted vial are rejected even if volume >= draw', async () => {
    const { vialId, userId } = await seedVialWithVolume(1.0)
    await prisma.inventoryVial.update({ where: { id: vialId }, data: { isExhausted: true } })

    const r = await attemptDecrement(vialId, userId, 0.05)
    expect(r.count).toBe(0)

    const after = await prisma.inventoryVial.findUnique({ where: { id: vialId } })
    expect(after?.remainingVolumeMl).toBe(1.0) // unchanged
  })
})
