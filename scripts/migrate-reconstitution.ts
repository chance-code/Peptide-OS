// One-time script to add reconstitution data to existing protocols in Turso
import 'dotenv/config'
import { createClient } from '@libsql/client'

console.log('Connecting to:', process.env.TURSO_DATABASE_URL)

const client = createClient({
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN!,
})

async function migrate() {
  // First, add the new columns if they don't exist
  console.log('Adding new columns to Protocol table...')
  try {
    await client.execute(`ALTER TABLE Protocol ADD COLUMN vialAmount REAL`)
    console.log('  ✓ Added vialAmount')
  } catch (e: any) {
    if (e.message?.includes('duplicate column')) {
      console.log('  - vialAmount already exists')
    } else {
      console.log('  - vialAmount:', e.message)
    }
  }

  try {
    await client.execute(`ALTER TABLE Protocol ADD COLUMN vialUnit TEXT`)
    console.log('  ✓ Added vialUnit')
  } catch (e: any) {
    if (e.message?.includes('duplicate column')) {
      console.log('  - vialUnit already exists')
    } else {
      console.log('  - vialUnit:', e.message)
    }
  }

  try {
    await client.execute(`ALTER TABLE Protocol ADD COLUMN diluentVolume REAL`)
    console.log('  ✓ Added diluentVolume')
  } catch (e: any) {
    if (e.message?.includes('duplicate column')) {
      console.log('  - diluentVolume already exists')
    } else {
      console.log('  - diluentVolume:', e.message)
    }
  }

  console.log('\nFetching protocols...')

  // Get all protocols with peptide names
  const result = await client.execute(`
    SELECT p.id, pep.name, p.doseAmount, p.doseUnit
    FROM Protocol p
    JOIN Peptide pep ON p.peptideId = pep.id
  `)

  console.log('Found protocols:', result.rows)

  // Reconstitution data based on peptide name
  const reconstitutionData: Record<string, { vialAmount: number; vialUnit: string; diluentVolume: number }> = {
    'BPC-157': { vialAmount: 10, vialUnit: 'mg', diluentVolume: 2 },
    'Tirzepatide': { vialAmount: 10, vialUnit: 'mg', diluentVolume: 1 },
    'Ipamorelin': { vialAmount: 10, vialUnit: 'mg', diluentVolume: 2 },
    'GHK-Cu': { vialAmount: 50, vialUnit: 'mg', diluentVolume: 3.4 },
  }

  for (const row of result.rows) {
    const peptideName = row.name as string
    const protocolId = row.id as string

    const data = reconstitutionData[peptideName]
    if (data) {
      console.log(`Updating ${peptideName} (${protocolId})...`)
      await client.execute({
        sql: `UPDATE Protocol SET vialAmount = ?, vialUnit = ?, diluentVolume = ? WHERE id = ?`,
        args: [data.vialAmount, data.vialUnit, data.diluentVolume, protocolId]
      })
      console.log(`  ✓ Set ${data.vialAmount}${data.vialUnit} + ${data.diluentVolume}mL`)
    } else {
      console.log(`  Skipping ${peptideName} (no reconstitution data)`)
    }
  }

  console.log('Done!')
}

migrate().catch(console.error)
