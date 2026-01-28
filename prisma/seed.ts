import { PrismaClient } from '@prisma/client'
import { addDays, subDays } from 'date-fns'

const prisma = new PrismaClient()

async function main() {
  console.log('Seeding database...')

  // Clear existing data
  await prisma.doseLog.deleteMany()
  await prisma.doseSchedule.deleteMany()
  await prisma.protocolHistory.deleteMany()
  await prisma.protocol.deleteMany()
  await prisma.reconstitution.deleteMany()
  await prisma.inventoryVial.deleteMany()
  await prisma.peptide.deleteMany()
  await prisma.note.deleteMany()
  await prisma.userProfile.deleteMany()

  // Create users
  const user1 = await prisma.userProfile.create({
    data: {
      name: 'Me',
      notes: 'Primary user',
      isActive: true,
    },
  })

  const user2 = await prisma.userProfile.create({
    data: {
      name: 'Wife',
      notes: 'Secondary user',
      isActive: false,
    },
  })

  console.log('Created users:', user1.name, user2.name)

  // Create peptides
  const peptides = await Promise.all([
    prisma.peptide.create({
      data: {
        name: 'BPC-157',
        category: 'Healing',
        description: 'Body Protection Compound - supports tissue repair and healing',
        storageNotes: 'Store reconstituted vial in refrigerator. Stable for 28 days.',
      },
    }),
    prisma.peptide.create({
      data: {
        name: 'TB-500',
        category: 'Healing',
        description: 'Thymosin Beta-4 - promotes cell migration and wound healing',
        storageNotes: 'Refrigerate after reconstitution. Use within 28 days.',
      },
    }),
    prisma.peptide.create({
      data: {
        name: 'Semaglutide',
        category: 'Metabolic',
        description: 'GLP-1 receptor agonist - supports metabolic health',
        storageNotes: 'Refrigerate. Do not freeze. Protect from light.',
      },
    }),
    prisma.peptide.create({
      data: {
        name: 'CJC-1295',
        category: 'Growth Hormone',
        description: 'Growth hormone releasing hormone analog',
        storageNotes: 'Store in refrigerator after reconstitution.',
      },
    }),
    prisma.peptide.create({
      data: {
        name: 'Ipamorelin',
        category: 'Growth Hormone',
        description: 'Growth hormone secretagogue',
        storageNotes: 'Refrigerate. Stable for 4 weeks reconstituted.',
      },
    }),
  ])

  console.log('Created peptides:', peptides.map((p) => p.name).join(', '))

  const [bpc157, tb500, semaglutide, cjc1295, ipamorelin] = peptides

  // Create protocols for User 1
  const protocol1 = await prisma.protocol.create({
    data: {
      userId: user1.id,
      peptideId: bpc157.id,
      startDate: subDays(new Date(), 14),
      endDate: addDays(new Date(), 16),
      frequency: 'daily',
      doseAmount: 250,
      doseUnit: 'mcg',
      timing: 'morning',
      status: 'active',
      notes: '30-day healing protocol',
    },
  })

  const protocol2 = await prisma.protocol.create({
    data: {
      userId: user1.id,
      peptideId: semaglutide.id,
      startDate: subDays(new Date(), 21),
      frequency: 'weekly',
      doseAmount: 0.5,
      doseUnit: 'mg',
      timing: 'Sunday morning',
      status: 'active',
      notes: 'Maintenance dose - indefinite',
    },
  })

  const protocol3 = await prisma.protocol.create({
    data: {
      userId: user1.id,
      peptideId: cjc1295.id,
      startDate: subDays(new Date(), 7),
      endDate: addDays(new Date(), 83),
      frequency: 'custom',
      customDays: JSON.stringify(['mon', 'wed', 'fri']),
      doseAmount: 100,
      doseUnit: 'mcg',
      timing: 'before bed',
      status: 'active',
      notes: '90-day protocol with ipamorelin',
    },
  })

  const protocol4 = await prisma.protocol.create({
    data: {
      userId: user1.id,
      peptideId: ipamorelin.id,
      startDate: subDays(new Date(), 7),
      endDate: addDays(new Date(), 83),
      frequency: 'custom',
      customDays: JSON.stringify(['mon', 'wed', 'fri']),
      doseAmount: 100,
      doseUnit: 'mcg',
      timing: 'before bed',
      status: 'active',
      notes: '90-day protocol with CJC-1295',
    },
  })

  console.log('Created protocols for', user1.name)

  // Create protocols for User 2
  await prisma.protocol.create({
    data: {
      userId: user2.id,
      peptideId: bpc157.id,
      startDate: subDays(new Date(), 7),
      endDate: addDays(new Date(), 23),
      frequency: 'daily',
      doseAmount: 200,
      doseUnit: 'mcg',
      timing: 'evening',
      status: 'active',
      notes: 'Gut health support',
    },
  })

  console.log('Created protocols for', user2.name)

  // Create inventory for User 1
  const vial1 = await prisma.inventoryVial.create({
    data: {
      userId: user1.id,
      peptideId: bpc157.id,
      identifier: 'BPC #1',
      totalAmount: 5,
      totalUnit: 'mg',
      diluentVolume: 2,
      concentration: 2.5,
      concentrationUnit: 'mg/ml',
      dateReceived: subDays(new Date(), 20),
      dateReconstituted: subDays(new Date(), 14),
      expirationDate: addDays(new Date(), 14),
      remainingAmount: 3.5,
    },
  })

  const vial2 = await prisma.inventoryVial.create({
    data: {
      userId: user1.id,
      peptideId: semaglutide.id,
      identifier: 'Sema #1',
      totalAmount: 5,
      totalUnit: 'mg',
      diluentVolume: 2.5,
      concentration: 2,
      concentrationUnit: 'mg/ml',
      dateReceived: subDays(new Date(), 30),
      dateReconstituted: subDays(new Date(), 21),
      expirationDate: addDays(new Date(), 7),
      remainingAmount: 3.5,
    },
  })

  const vial3 = await prisma.inventoryVial.create({
    data: {
      userId: user1.id,
      peptideId: cjc1295.id,
      identifier: 'CJC #1',
      totalAmount: 2,
      totalUnit: 'mg',
      diluentVolume: 2,
      concentration: 1,
      concentrationUnit: 'mg/ml',
      dateReceived: subDays(new Date(), 10),
      dateReconstituted: subDays(new Date(), 7),
      expirationDate: addDays(new Date(), 21),
      remainingAmount: 1.8,
    },
  })

  // Expired vial
  await prisma.inventoryVial.create({
    data: {
      userId: user1.id,
      peptideId: tb500.id,
      identifier: 'TB500 (expired)',
      totalAmount: 5,
      totalUnit: 'mg',
      diluentVolume: 2,
      concentration: 2.5,
      concentrationUnit: 'mg/ml',
      dateReceived: subDays(new Date(), 60),
      dateReconstituted: subDays(new Date(), 45),
      expirationDate: subDays(new Date(), 17),
      remainingAmount: 2,
      isExpired: true,
    },
  })

  console.log('Created inventory vials')

  // Create some dose logs for User 1 (past 14 days for BPC-157)
  for (let i = 13; i >= 0; i--) {
    const logDate = subDays(new Date(), i)
    const status = i === 5 ? 'skipped' : 'completed' // One skipped day

    await prisma.doseLog.create({
      data: {
        userId: user1.id,
        protocolId: protocol1.id,
        scheduledDate: logDate,
        status,
        completedAt: status === 'completed' ? logDate : null,
        notes: i === 5 ? 'Traveling' : null,
      },
    })
  }

  // Dose logs for semaglutide (3 weeks)
  for (let i = 0; i < 3; i++) {
    const logDate = subDays(new Date(), i * 7)
    await prisma.doseLog.create({
      data: {
        userId: user1.id,
        protocolId: protocol2.id,
        scheduledDate: logDate,
        status: 'completed',
        completedAt: logDate,
      },
    })
  }

  console.log('Created dose logs')

  // Create saved reconstitution
  await prisma.reconstitution.create({
    data: {
      userId: user1.id,
      peptideId: bpc157.id,
      vialAmount: 5,
      vialUnit: 'mg',
      diluentVolume: 2,
      concentration: 2.5,
      concentrationUnit: 'mg/ml',
      targetDose: 250,
      targetUnit: 'mcg',
      volumePerDose: 0.1,
      notes: 'Standard BPC-157 reconstitution',
    },
  })

  console.log('Created saved reconstitution')

  // Create protocol history entries
  await prisma.protocolHistory.create({
    data: {
      protocolId: protocol1.id,
      changeType: 'created',
      changeData: JSON.stringify({
        peptideId: bpc157.id,
        doseAmount: 250,
        doseUnit: 'mcg',
        frequency: 'daily',
      }),
    },
  })

  console.log('Created protocol history')

  console.log('\n✅ Database seeded successfully!')
  console.log('\nSample Data:')
  console.log(`- Users: ${user1.name}, ${user2.name}`)
  console.log(`- Peptides: ${peptides.length}`)
  console.log(`- Protocols: 5`)
  console.log(`- Inventory vials: 4`)
  console.log(`- Dose logs: 17`)
}

main()
  .catch((e) => {
    console.error('Seed error:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
