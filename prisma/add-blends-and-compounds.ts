import { PrismaClient } from '@prisma/client'

// Idempotent: adds MOTS-c, KLOW, and the compounded magnesium taurate
// injectable to the Peptide table so they show up in the app's pickers
// and the vial scanner can match them. Run with: npx tsx prisma/add-blends-and-compounds.ts

const prisma = new PrismaClient()

const PEPTIDES = [
  {
    name: 'MOTS-c',
    type: 'peptide',
    category: 'Metabolic',
    description: 'Mitochondrial-derived peptide for metabolism, exercise capacity, and longevity. Labels may print it as MOTC or MOTS-C.',
    storageNotes: 'Lyophilized: store refrigerated, away from light. Reconstituted: refrigerate and use within 30 days.',
  },
  {
    name: 'KLOW',
    type: 'peptide',
    category: 'Healing',
    description: 'Healing blend of KPV, GHK-Cu, BPC-157, and TB-500. Component ratios vary by compounder.',
    storageNotes: 'Lyophilized: store refrigerated, away from light. Reconstituted: refrigerate and use within 30 days.',
  },
  {
    name: 'Magnesium Taurate + B6 + Glycine (Compounded)',
    type: 'peptide',
    category: 'Compounded',
    description: 'Compounded injectable: magnesium taurate 25 mg/mL, vitamin B6 (pyridoxine) 25 mg/mL, glycine 5 mg/mL, pre-mixed in a 2 mL vial. No reconstitution needed.',
    storageNotes: 'Pre-mixed solution: keep refrigerated; discard per pharmacy beyond-use date.',
  },
]

async function main() {
  for (const data of PEPTIDES) {
    const existing = await prisma.peptide.findUnique({ where: { name: data.name } })
    if (existing) {
      console.log(`exists: ${data.name}`)
      continue
    }
    const created = await prisma.peptide.create({ data })
    console.log(`created: ${created.name} (${created.id})`)
  }
  console.log('\n✅ Blends and compounds ready')
}

main()
  .catch((e) => {
    console.error('Error:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
