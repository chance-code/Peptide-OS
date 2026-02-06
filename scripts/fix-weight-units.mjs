// One-time migration: fix historical weight data where kg values were stored as lbs.
// Detects likely kg values by comparing against each user's recent (correct) readings.
// Also fixes lean_body_mass from the same source.
//
// Usage: TURSO_DATABASE_URL=... TURSO_AUTH_TOKEN=... node scripts/fix-weight-units.mjs [--dry-run]

import { createClient } from '@libsql/client'

const client = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
})

const DRY_RUN = process.argv.includes('--dry-run')
const KG_TO_LBS = 2.20462

async function fixWeightUnits() {
  console.log(`\n=== Fix Weight Units Migration ${DRY_RUN ? '(DRY RUN)' : ''} ===\n`)

  // Get all users who have weight data
  const usersResult = await client.execute(
    'SELECT DISTINCT "userId" FROM "HealthMetric" WHERE "metricType" = \'weight\''
  )
  const userIds = usersResult.rows.map(r => r.userId)
  console.log(`Found ${userIds.length} user(s) with weight data\n`)

  let totalFixed = 0

  for (const userId of userIds) {
    // Get all weight readings for this user, ordered by date
    const weightsResult = await client.execute({
      sql: 'SELECT "id", "value", "unit", "recordedAt" FROM "HealthMetric" WHERE "userId" = ? AND "metricType" = \'weight\' ORDER BY "recordedAt" ASC',
      args: [userId]
    })
    const weights = weightsResult.rows

    if (weights.length < 2) {
      console.log(`User ${userId}: Only ${weights.length} reading(s), skipping`)
      continue
    }

    // Find the reference weight: use the median of the last 7 readings
    // (median is more robust than mean against outliers)
    const recentValues = weights.slice(-7).map(w => Number(w.value)).sort((a, b) => a - b)
    const referenceWeight = recentValues[Math.floor(recentValues.length / 2)]

    if (referenceWeight < 100) {
      console.log(`User ${userId}: Reference weight ${referenceWeight} lbs is very low — may actually be a lightweight person. Skipping automatic fix.`)
      continue
    }

    console.log(`User ${userId}: ${weights.length} readings, reference weight: ${referenceWeight.toFixed(1)} lbs`)

    let userFixed = 0
    for (const w of weights) {
      const value = Number(w.value)
      const ratio = value / referenceWeight

      // If value is ~40-60% of reference, it's almost certainly in kg
      if (ratio > 0.35 && ratio < 0.65) {
        const corrected = value * KG_TO_LBS
        console.log(`  ${w.recordedAt}: ${value} → ${corrected.toFixed(1)} lbs (ratio: ${ratio.toFixed(2)})`)

        if (!DRY_RUN) {
          await client.execute({
            sql: 'UPDATE "HealthMetric" SET "value" = ?, "unit" = \'lbs\' WHERE "id" = ?',
            args: [corrected, w.id]
          })
        }
        userFixed++
      }
    }

    // Also fix lean_body_mass for the same user
    const lbmResult = await client.execute({
      sql: 'SELECT "id", "value", "recordedAt" FROM "HealthMetric" WHERE "userId" = ? AND "metricType" = \'lean_body_mass\' ORDER BY "recordedAt" ASC',
      args: [userId]
    })

    if (lbmResult.rows.length > 1) {
      const recentLbm = lbmResult.rows.slice(-7).map(r => Number(r.value)).sort((a, b) => a - b)
      const refLbm = recentLbm[Math.floor(recentLbm.length / 2)]

      if (refLbm >= 80) {
        for (const r of lbmResult.rows) {
          const value = Number(r.value)
          const ratio = value / refLbm
          if (ratio > 0.35 && ratio < 0.65) {
            const corrected = value * KG_TO_LBS
            console.log(`  [LBM] ${r.recordedAt}: ${value} → ${corrected.toFixed(1)} lbs`)
            if (!DRY_RUN) {
              await client.execute({
                sql: 'UPDATE "HealthMetric" SET "value" = ?, "unit" = \'lbs\' WHERE "id" = ?',
                args: [corrected, r.id]
              })
            }
            userFixed++
          }
        }
      }
    }

    if (userFixed > 0) {
      console.log(`  → Fixed ${userFixed} reading(s) for user ${userId}`)
      totalFixed += userFixed
    } else {
      console.log(`  → No corrections needed`)
    }
  }

  console.log(`\n=== Done. ${totalFixed} total reading(s) ${DRY_RUN ? 'would be' : ''} corrected. ===\n`)
}

fixWeightUnits().catch(err => {
  console.error('Migration failed:', err)
  process.exit(1)
})
