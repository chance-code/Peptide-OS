import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('Updating BPC-157 protocol...')

  // Find the BPC-157 protocol
  const protocol = await prisma.protocol.findFirst({
    where: {
      peptide: { name: 'BPC-157' },
    },
    include: { peptide: true },
  })

  if (!protocol) {
    throw new Error('BPC-157 protocol not found')
  }

  console.log('Current protocol:', {
    id: protocol.id,
    startDate: protocol.startDate,
    endDate: protocol.endDate,
    dose: `${protocol.doseAmount} ${protocol.doseUnit}`,
    timing: protocol.timing,
  })

  // Update with correct dates
  // Started: last week of November 2025
  // Ending: last Wednesday of February 2026 (Feb 25, 2026)
  const startDate = new Date('2025-11-25')
  const endDate = new Date('2026-02-25')

  const updated = await prisma.protocol.update({
    where: { id: protocol.id },
    data: {
      startDate,
      endDate,
      doseAmount: 500,
      doseUnit: 'mcg',
      timing: 'morning',
      notes: '8-10 week cycle. Reconstitution: 10mg in 2mL BAC water. Injection: 0.10mL (10 units). Then 2-4 weeks OFF.',
    },
  })

  console.log('\nUpdated protocol:', {
    id: updated.id,
    startDate: updated.startDate.toISOString().split('T')[0],
    endDate: updated.endDate?.toISOString().split('T')[0],
    dose: `${updated.doseAmount} ${updated.doseUnit}`,
    timing: updated.timing,
    notes: updated.notes,
  })

  console.log('\n✅ BPC-157 protocol updated!')
}

main()
  .catch((e) => {
    console.error('Error:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
