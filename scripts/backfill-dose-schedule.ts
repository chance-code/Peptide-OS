// One-time backfill: materialize the 90-day DoseSchedule window for every
// active protocol that currently has zero scheduled rows.
//
// Safe to re-run — materializeScheduleForProtocol deletes future rows before
// regenerating, so it's effectively a "refresh" operation for already-materialized
// protocols.
//
// Usage:
//   LOCAL:  npx tsx scripts/backfill-dose-schedule.ts
//   TURSO:  DATABASE_URL=<turso-libsql> npx tsx scripts/backfill-dose-schedule.ts
//
// Refocus Phase 1.J — docs/migrations/refocus_cycle_titration_backfill.md.

import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { materializeScheduleForAllActive } from '../src/lib/schedule-materializer'

const prisma = new PrismaClient()

async function main() {
  const beforeCount = await prisma.doseSchedule.count()
  console.log(`[backfill-dose-schedule] DoseSchedule rows before: ${beforeCount}`)

  const result = await prisma.$transaction(
    (tx) => materializeScheduleForAllActive(tx),
    { timeout: 60_000 },
  )

  const afterCount = await prisma.doseSchedule.count()
  console.log(
    `[backfill-dose-schedule] done.  protocols=${result.protocolsTouched}  ` +
      `created=${result.rowsCreated}  deletedFuture=${result.rowsDeleted}  ` +
      `totalNow=${afterCount}`,
  )
}

main()
  .catch((err) => {
    console.error('[backfill-dose-schedule] FAILED:', err)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
