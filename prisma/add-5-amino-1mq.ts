import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('Adding 5-Amino-1MQ peptide and completed protocol...')

  // Get active user
  const activeUser = await prisma.userProfile.findFirst({
    where: { isActive: true },
  })

  if (!activeUser) {
    throw new Error('No active user found')
  }

  console.log('Active user:', activeUser.name)

  // Check if 5-Amino-1MQ already exists
  const existingPeptide = await prisma.peptide.findUnique({
    where: { name: '5-Amino-1MQ' },
  })

  let peptide
  if (existingPeptide) {
    console.log('5-Amino-1MQ peptide already exists')
    peptide = existingPeptide
  } else {
    // Create 5-Amino-1MQ peptide
    peptide = await prisma.peptide.create({
      data: {
        name: '5-Amino-1MQ',
        category: 'Metabolic',
        description: 'Metabolic acceleration compound',
        storageNotes: 'Store in cool, dry place. Capsule form.',
      },
    })
    console.log('Created peptide: 5-Amino-1MQ')
  }

  // Check if protocol already exists for this peptide
  const existingProtocol = await prisma.protocol.findFirst({
    where: {
      userId: activeUser.id,
      peptideId: peptide.id,
    },
  })

  if (existingProtocol) {
    console.log('Protocol for 5-Amino-1MQ already exists')
    console.log('Protocol details:', {
      id: existingProtocol.id,
      status: existingProtocol.status,
      startDate: existingProtocol.startDate,
      endDate: existingProtocol.endDate,
    })
  } else {
    // Create completed protocol
    // ~8 weeks = 56 days, starting Dec 3, 2025, ending Jan 28, 2026 (today)
    const startDate = new Date('2025-12-03')
    const endDate = new Date('2026-01-28')

    const protocol = await prisma.protocol.create({
      data: {
        userId: activeUser.id,
        peptideId: peptide.id,
        startDate,
        endDate,
        frequency: 'daily',
        doseAmount: 50,
        doseUnit: 'mg',
        timing: 'morning and night', // Twice daily
        status: 'completed',
        notes: '8-week cycle complete. Recommended OFF period: 4-6+ weeks.',
      },
    })

    // Create protocol history entry for completion
    await prisma.protocolHistory.create({
      data: {
        protocolId: protocol.id,
        changeType: 'completed',
        changeData: JSON.stringify({
          peptideId: peptide.id,
          doseAmount: 50,
          doseUnit: 'mg',
          frequency: 'daily',
          timing: 'morning and night',
          duration: '8 weeks',
          completedAt: endDate.toISOString(),
        }),
      },
    })

    console.log('Created completed protocol for 5-Amino-1MQ')
    console.log('Protocol details:', {
      id: protocol.id,
      startDate: protocol.startDate.toISOString().split('T')[0],
      endDate: protocol.endDate?.toISOString().split('T')[0],
      dose: `${protocol.doseAmount} ${protocol.doseUnit}`,
      timing: protocol.timing,
      status: protocol.status,
    })
  }

  console.log('\n✅ 5-Amino-1MQ setup complete!')
}

main()
  .catch((e) => {
    console.error('Error:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
