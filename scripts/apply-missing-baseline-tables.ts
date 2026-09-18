// Creates any table from the 00000000000000_baseline migration that is missing on the
// target database, plus the indexes for those tables. Existing tables are never touched
// (no ALTER, no DROP, no data changes), so it is safe to re-run.
//
// Why: production was set up in the `db push` era and drifted — e.g. DiscoveryInsight is in
// the baseline but absent in prod, so every call touching it fails with "no such table".
//
// Usage: railway run npx tsx scripts/apply-missing-baseline-tables.ts   (prod, via Railway env)
//        TURSO_DATABASE_URL=file:/tmp/x.db TURSO_AUTH_TOKEN=x npx tsx scripts/apply-missing-baseline-tables.ts
import 'dotenv/config'
import { createClient } from '@libsql/client'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const BASELINE_SQL = path.resolve(__dirname, '../prisma/migrations/00000000000000_baseline/migration.sql')

function splitStatements(sql: string): string[] {
  return sql
    .split(/;\s*\n/)
    .map((s) => s.replace(/^\s*--.*$/gm, '').trim())
    .filter((s) => s.length > 0)
}

async function main() {
  const url = process.env.TURSO_DATABASE_URL
  const authToken = process.env.TURSO_AUTH_TOKEN
  if (!url) throw new Error('TURSO_DATABASE_URL must be set')
  const client = createClient({ url, authToken })
  console.log(`[baseline] connecting to ${url.slice(0, 40)}...`)

  const existingRows = await client.execute(`SELECT name, type FROM sqlite_master WHERE type IN ('table','index')`)
  const existingTables = new Set(existingRows.rows.filter((r) => r.type === 'table').map((r) => String(r.name)))
  const existingIndexes = new Set(existingRows.rows.filter((r) => r.type === 'index').map((r) => String(r.name)))

  const statements = splitStatements(readFileSync(BASELINE_SQL, 'utf8'))
  const created: string[] = []
  const createdIndexes: string[] = []
  let skippedTables = 0

  for (const stmt of statements) {
    const table = stmt.match(/^CREATE TABLE (?:IF NOT EXISTS )?"([^"]+)"/)
    if (table) {
      const name = table[1]
      if (existingTables.has(name)) { skippedTables++; continue }
      await client.execute(stmt.replace(/^CREATE TABLE (?:IF NOT EXISTS )?/, 'CREATE TABLE IF NOT EXISTS '))
      existingTables.add(name)
      created.push(name)
      console.log(`   + table ${name}`)
      continue
    }
    const index = stmt.match(/^CREATE (?:UNIQUE )?INDEX (?:IF NOT EXISTS )?"([^"]+)" ON "([^"]+)"/)
    if (index) {
      const [, name, onTable] = index
      // Only add indexes for tables this run created — never reshape an existing table's indexes.
      if (!created.includes(onTable) || existingIndexes.has(name)) continue
      await client.execute(stmt.replace(/^CREATE (UNIQUE )?INDEX (?:IF NOT EXISTS )?/, 'CREATE $1INDEX IF NOT EXISTS '))
      createdIndexes.push(name)
      console.log(`   + index ${name} on ${onTable}`)
      continue
    }
    // Anything else in the baseline (there should be nothing) is deliberately not executed.
    console.log(`   ! skipped non-CREATE statement: ${stmt.slice(0, 60)}...`)
  }

  console.log(`\n[baseline] done — ${created.length} table(s) created, ${createdIndexes.length} index(es) created, ${skippedTables} table(s) already present`)
  if (created.length) console.log(`   created: ${created.join(', ')}`)
}

main().catch((e) => {
  console.error('[baseline] FAILED:', e)
  process.exit(1)
})
