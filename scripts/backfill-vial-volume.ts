// Backfill InventoryVial.remainingVolumeMl for existing vials.
//
// Background (2026-04-23 refocus Phase 1.C):
//   The refocus adds `remainingVolumeMl` to InventoryVial so the server can
//   decrement per-dose volume at log time and surface "2 doses left" warnings
//   in Today. Existing vials have this column NULL after the migration.
//
// Backfill logic:
//   - No diluentVolume (supplements, capsules, etc.) → leave NULL
//   - Exhausted or expired → set to 0
//   - Reconstituted + active → remainingVolumeMl = diluentVolume * (remainingAmount / totalAmount)
//     which is just `diluentVolume` for full vials.
//
// Safe to re-run: only touches rows where remainingVolumeMl IS NULL.
//
// Usage:
//   LOCAL:  npx tsx scripts/backfill-vial-volume.ts
//   TURSO:  DATABASE_URL=<turso-libsql-url> npx tsx scripts/backfill-vial-volume.ts
//           (requires TURSO_AUTH_TOKEN env var via libsql adapter; see prisma/schema.prisma)
import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { PrismaLibSQL } from '@prisma/adapter-libsql'
import { createClient } from '@libsql/client'

// Auto-detect Turso (prod) vs local SQLite, mirroring src/lib/prisma.ts.
const prisma = (() => {
  if (process.env.TURSO_DATABASE_URL && process.env.TURSO_AUTH_TOKEN) {
    const libsql = createClient({
      url: process.env.TURSO_DATABASE_URL,
      authToken: process.env.TURSO_AUTH_TOKEN,
    })
    return new PrismaClient({ adapter: new PrismaLibSQL(libsql) })
  }
  return new PrismaClient()
})()

type VialSnapshot = {
  id: string
  identifier: string | null
  totalAmount: number
  totalUnit: string
  diluentVolume: number | null
  remainingAmount: number | null
  remainingVolumeMl: number | null
  isExpired: boolean
  isExhausted: boolean
}

function computeRemainingVolumeMl(v: VialSnapshot): number | null {
  if (v.diluentVolume == null || v.diluentVolume === 0) return null // supplement or never reconstituted
  if (v.isExhausted) return 0
  if (v.isExpired) return 0
  if (v.remainingAmount == null || v.totalAmount === 0) return v.diluentVolume
  const ratio = v.remainingAmount / v.totalAmount
  const clamped = Math.max(0, Math.min(1, ratio))
  // Round to 3 decimals (mL granularity — 1 μL resolution)
  return Math.round(v.diluentVolume * clamped * 1000) / 1000
}

async function main() {
  const candidates = (await prisma.inventoryVial.findMany({
    where: { remainingVolumeMl: null },
    select: {
      id: true,
      identifier: true,
      totalAmount: true,
      totalUnit: true,
      diluentVolume: true,
      remainingAmount: true,
      remainingVolumeMl: true,
      isExpired: true,
      isExhausted: true,
    },
  })) as VialSnapshot[]

  console.log(`[backfill-vial-volume] ${candidates.length} vial(s) with remainingVolumeMl=NULL\n`)

  let updated = 0
  let skipped = 0
  for (const v of candidates) {
    const computed = computeRemainingVolumeMl(v)
    const label = v.identifier ?? v.id.slice(0, 8)

    if (computed == null) {
      console.log(`  - ${label}: skip (no diluentVolume)`)
      skipped++
      continue
    }

    await prisma.inventoryVial.update({
      where: { id: v.id },
      data: { remainingVolumeMl: computed },
    })
    console.log(
      `  ✓ ${label}: remainingVolumeMl=${computed} mL  (diluent=${v.diluentVolume}, ` +
        `remaining=${v.remainingAmount}/${v.totalAmount} ${v.totalUnit}, ` +
        `expired=${v.isExpired}, exhausted=${v.isExhausted})`,
    )
    updated++
  }

  console.log(`\n[backfill-vial-volume] done  updated=${updated}  skipped=${skipped}`)
}

main()
  .catch((err) => {
    console.error('[backfill-vial-volume] FAILED:', err)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
