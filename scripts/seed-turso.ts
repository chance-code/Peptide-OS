import 'dotenv/config'
import { createClient } from '@libsql/client'

const client = createClient({
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN!,
})

function generateId() {
  return 'c' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15)
}

async function main() {
  console.log('Seeding Turso database...')

  // Create users
  const meId = generateId()
  const wifeId = generateId()

  await client.execute({
    sql: `INSERT INTO UserProfile (id, name, notes, isActive, createdAt, updatedAt) VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))`,
    args: [meId, 'Me', 'Primary user', 1]
  })
  console.log('✓ Created user: Me')

  await client.execute({
    sql: `INSERT INTO UserProfile (id, name, notes, isActive, createdAt, updatedAt) VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))`,
    args: [wifeId, 'Wife', 'Secondary user', 0]
  })
  console.log('✓ Created user: Wife')

  // Create peptides
  const peptides = [
    { name: 'BPC-157', category: 'Healing', description: 'Body Protection Compound - supports tissue repair and healing' },
    { name: '5-Amino-1MQ', category: 'Metabolic', description: 'Metabolic acceleration compound' },
    { name: 'Tirzepatide', category: 'Metabolic', description: 'GLP-1/GIP receptor agonist' },
    { name: 'Ipamorelin', category: 'Growth Hormone', description: 'Growth hormone secretagogue' },
    { name: 'GHK-Cu', category: 'Healing', description: 'Copper peptide for skin and tissue repair' },
    { name: 'TB-500', category: 'Healing', description: 'Thymosin Beta-4 - promotes cell migration and wound healing' },
    { name: 'Semaglutide', category: 'Metabolic', description: 'GLP-1 receptor agonist' },
    { name: 'CJC-1295', category: 'Growth Hormone', description: 'Growth hormone releasing hormone analog' },
  ]

  const peptideIds: Record<string, string> = {}

  for (const p of peptides) {
    const id = generateId()
    peptideIds[p.name] = id
    await client.execute({
      sql: `INSERT INTO Peptide (id, name, category, description, createdAt, updatedAt) VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))`,
      args: [id, p.name, p.category, p.description]
    })
    console.log('✓ Created peptide:', p.name)
  }

  // Create protocols for Me
  // BPC-157 - Active
  await client.execute({
    sql: `INSERT INTO Protocol (id, userId, peptideId, startDate, endDate, frequency, doseAmount, doseUnit, timing, status, notes, createdAt, updatedAt)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
    args: [
      generateId(),
      meId,
      peptideIds['BPC-157'],
      '2025-11-25',
      '2026-02-25',
      'daily',
      500,
      'mcg',
      'morning',
      'active',
      '8-10 week cycle. Reconstitution: 10mg in 2mL BAC water. Injection: 0.10mL (10 units). Then 2-4 weeks OFF.'
    ]
  })
  console.log('✓ Created protocol: BPC-157 (active)')

  // 5-Amino-1MQ - Completed
  await client.execute({
    sql: `INSERT INTO Protocol (id, userId, peptideId, startDate, endDate, frequency, doseAmount, doseUnit, timing, status, notes, createdAt, updatedAt)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
    args: [
      generateId(),
      meId,
      peptideIds['5-Amino-1MQ'],
      '2025-12-03',
      '2026-01-28',
      'daily',
      50,
      'mg',
      'morning and night',
      'completed',
      '8-week cycle complete. Recommended OFF period: 4-6+ weeks.'
    ]
  })
  console.log('✓ Created protocol: 5-Amino-1MQ (completed)')

  // Tirzepatide - Active
  await client.execute({
    sql: `INSERT INTO Protocol (id, userId, peptideId, startDate, endDate, frequency, doseAmount, doseUnit, timing, status, notes, createdAt, updatedAt)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
    args: [
      generateId(),
      meId,
      peptideIds['Tirzepatide'],
      '2026-01-01',
      null,
      'weekly',
      1.25,
      'mg',
      'evening',
      'active',
      'Weekly injection'
    ]
  })
  console.log('✓ Created protocol: Tirzepatide (active)')

  // Ipamorelin - Active
  await client.execute({
    sql: `INSERT INTO Protocol (id, userId, peptideId, startDate, endDate, frequency, doseAmount, doseUnit, timing, status, notes, createdAt, updatedAt)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
    args: [
      generateId(),
      meId,
      peptideIds['Ipamorelin'],
      '2026-01-01',
      null,
      'daily',
      300,
      'mcg',
      'night',
      'active',
      'Before bed'
    ]
  })
  console.log('✓ Created protocol: Ipamorelin (active)')

  // GHK-Cu - Active
  await client.execute({
    sql: `INSERT INTO Protocol (id, userId, peptideId, startDate, endDate, frequency, doseAmount, doseUnit, timing, status, notes, createdAt, updatedAt)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
    args: [
      generateId(),
      meId,
      peptideIds['GHK-Cu'],
      '2026-01-01',
      null,
      'daily',
      1,
      'mg',
      'morning',
      'active',
      'Skin and hair health'
    ]
  })
  console.log('✓ Created protocol: GHK-Cu (active)')

  console.log('\n✅ Seeding complete!')
}

main().catch(console.error)
