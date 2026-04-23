// One-shot deploy script — applies the refocus (Phase 1) schema to production Turso.
//
// What it does (idempotent — safe to re-run):
//   1. Reads current _prisma_migrations on Turso; skips migrations already applied.
//   2. Records the 00000000000000_baseline migration as applied WITHOUT running it
//      (production already has those tables from the `db push` era).
//   3. Runs the SQL from 20260423191806_refocus_cycle_titration and records it applied.
//   4. Prints a summary of rows-affected per statement.
//
// Usage (from peptide-os/):
//   npx tsx scripts/deploy-refocus-to-turso.ts
//
// Prereqs in .env:
//   TURSO_DATABASE_URL=libsql://...
//   TURSO_AUTH_TOKEN=...

import 'dotenv/config'
import { createClient } from '@libsql/client'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import path from 'node:path'

const MIGRATIONS_DIR = path.resolve(__dirname, '../prisma/migrations')
const BASELINE_NAME = '00000000000000_baseline'
const REFOCUS_NAME = '20260423191806_refocus_cycle_titration'

const client = createClient({
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN!,
})

async function main() {
  if (!process.env.TURSO_DATABASE_URL || !process.env.TURSO_AUTH_TOKEN) {
    throw new Error('TURSO_DATABASE_URL and TURSO_AUTH_TOKEN must be set')
  }
  console.log(`[deploy] connecting to ${process.env.TURSO_DATABASE_URL?.slice(0, 40)}...`)

  // ── Ensure _prisma_migrations exists ────────────────────────────────────
  await client.execute(`
    CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
      "id" TEXT PRIMARY KEY NOT NULL,
      "checksum" TEXT NOT NULL,
      "finished_at" DATETIME,
      "migration_name" TEXT NOT NULL,
      "logs" TEXT,
      "rolled_back_at" DATETIME,
      "started_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "applied_steps_count" INTEGER NOT NULL DEFAULT 0
    )
  `)

  // ── Read current applied migrations ─────────────────────────────────────
  const existing = await client.execute({
    sql: 'SELECT migration_name, finished_at FROM _prisma_migrations ORDER BY finished_at',
    args: [],
  })
  const appliedNames = new Set(existing.rows.map((r) => String(r.migration_name)))
  console.log(`[deploy] currently applied migrations on Turso: ${appliedNames.size}`)
  for (const n of appliedNames) console.log(`   ✓ ${n}`)

  // ── 1) Mark baseline as applied (if not already) ────────────────────────
  if (appliedNames.has(BASELINE_NAME)) {
    console.log(`[deploy] baseline already marked applied — skipping`)
  } else {
    const baselineSql = readFileSync(path.join(MIGRATIONS_DIR, BASELINE_NAME, 'migration.sql'), 'utf8')
    const checksum = createHash('sha256').update(baselineSql).digest('hex')
    await client.execute({
      sql: `INSERT INTO "_prisma_migrations" (id, checksum, finished_at, migration_name, applied_steps_count)
            VALUES (?, ?, CURRENT_TIMESTAMP, ?, 0)`,
      args: [crypto.randomUUID(), checksum, BASELINE_NAME],
    })
    console.log(`[deploy] ✓ baseline recorded as applied (no SQL executed — tables already exist)`)
  }

  // ── 2) Run refocus_cycle_titration (if not already applied) ─────────────
  if (appliedNames.has(REFOCUS_NAME)) {
    console.log(`[deploy] refocus migration already applied — skipping`)
  } else {
    const refocusSql = readFileSync(path.join(MIGRATIONS_DIR, REFOCUS_NAME, 'migration.sql'), 'utf8')
    const checksum = createHash('sha256').update(refocusSql).digest('hex')

    console.log(`[deploy] executing refocus_cycle_titration migration...`)
    // Split on ";\n\n" (Prisma's migration.sql uses blank-line separators + single-statement style).
    // We go statement-by-statement so errors are precise.
    const statements = splitSqlStatements(refocusSql)
    console.log(`[deploy] ${statements.length} statements to execute`)

    // libSQL/SQLite requires all statements in a single transaction for the table-rebuild
    // pattern (PRAGMA defer_foreign_keys=ON ... CREATE new_X ... DROP X ... RENAME new_X TO X)
    // to stay atomic. We use a transaction for the whole migration.
    const tx = await client.transaction('write')
    try {
      for (let i = 0; i < statements.length; i++) {
        const stmt = statements[i]
        const preview = stmt.split('\n')[0].slice(0, 80)
        try {
          await tx.execute(stmt)
          process.stdout.write(`   ✓ [${i + 1}/${statements.length}] ${preview}\n`)
        } catch (err) {
          throw new Error(`Statement ${i + 1}/${statements.length} failed: ${preview}\n${err instanceof Error ? err.message : err}`)
        }
      }
      await tx.commit()
      console.log(`[deploy] ✓ all ${statements.length} statements committed`)
    } catch (err) {
      await tx.rollback()
      throw err
    }

    // Record the migration as applied
    await client.execute({
      sql: `INSERT INTO "_prisma_migrations" (id, checksum, finished_at, migration_name, applied_steps_count)
            VALUES (?, ?, CURRENT_TIMESTAMP, ?, 1)`,
      args: [crypto.randomUUID(), checksum, REFOCUS_NAME],
    })
    console.log(`[deploy] ✓ refocus_cycle_titration recorded as applied`)
  }

  // ── Final state ─────────────────────────────────────────────────────────
  const after = await client.execute({
    sql: 'SELECT migration_name FROM _prisma_migrations ORDER BY finished_at',
    args: [],
  })
  console.log(`\n[deploy] done. Turso _prisma_migrations now has:`)
  for (const r of after.rows) console.log(`   ✓ ${r.migration_name}`)
}

function splitSqlStatements(sql: string): string[] {
  // Prisma emits statements separated by blank lines; PRAGMAs are single-line.
  // We need to preserve semicolons inside statements but split on statement-terminating ;
  // while handling the table-rebuild block atomically (it's multi-statement but each ends in ;).
  const lines = sql.split('\n')
  const out: string[] = []
  let buf: string[] = []
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('--')) continue
    buf.push(line)
    if (trimmed.endsWith(';')) {
      out.push(buf.join('\n').trim())
      buf = []
    }
  }
  if (buf.length) {
    const tail = buf.join('\n').trim()
    if (tail) out.push(tail)
  }
  return out
}

main()
  .catch((err) => {
    console.error('[deploy] FAILED:', err)
    process.exit(1)
  })
  .finally(() => {
    client.close()
  })
