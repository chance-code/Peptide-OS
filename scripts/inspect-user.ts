// Read-only: prints one user's protocols, today's dose schedule, and today's dose logs
// so cross-screen inconsistencies (Protocols vs Today) can be diagnosed from real rows.
//
// Usage: railway run npx tsx scripts/inspect-user.ts --user <name|id>
import prisma from '../src/lib/prisma'

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name)
  return i >= 0 ? process.argv[i + 1] : undefined
}

function day(d: Date | null | undefined): string {
  return d ? d.toISOString().slice(0, 10) : '-'
}

async function main() {
  const target = arg('--user')
  if (!target) throw new Error('pass --user <name|id>')
  const profiles = await prisma.userProfile.findMany({ select: { id: true, name: true } })
  const user = profiles.find((p) => p.id === target || p.name.toLowerCase() === target.toLowerCase())
  if (!user) throw new Error(`no profile matching "${target}"`)
  console.log(`[inspect] ${user.name} (${user.id})\n`)

  const protocols = await prisma.protocol.findMany({
    where: { userId: user.id },
    include: { peptide: true },
    orderBy: { createdAt: 'desc' },
  })
  console.log(`PROTOCOLS (${protocols.length})`)
  for (const p of protocols) {
    console.log(
      `  ${p.id}  ${p.peptide.name} [type=${p.peptide.type}]  status=${p.status}  ${p.doseAmount}${p.doseUnit}  freq=${p.frequency}` +
        `  customDays=${p.customDays ?? '-'}  timing=${p.timing ?? '-'}  timings=${p.timings ?? '-'}` +
        `  start=${day(p.startDate)}  end=${day(p.endDate)}  created=${p.createdAt.toISOString()}`
    )
  }

  const start = new Date()
  start.setUTCHours(0, 0, 0, 0)
  const end = new Date(start)
  end.setUTCDate(end.getUTCDate() + 2)

  const schedules = await prisma.doseSchedule.findMany({
    where: { protocol: { userId: user.id }, scheduledDate: { gte: start, lt: end } },
    include: { protocol: { include: { peptide: true } } },
    orderBy: { scheduledDate: 'asc' },
  })
  console.log(`\nDOSE SCHEDULE (today/tomorrow UTC, ${schedules.length})`)
  for (const s of schedules) {
    console.log(`  ${day(s.scheduledDate)}  ${s.protocol.peptide.name}  timing=${(s as { timing?: string }).timing ?? '-'}  protocol=${s.protocolId}`)
  }

  const logs = await prisma.doseLog.findMany({
    where: { userId: user.id, scheduledDate: { gte: start, lt: end } },
    include: { protocol: { include: { peptide: true } } },
  })
  console.log(`\nDOSE LOGS (today/tomorrow UTC, ${logs.length})`)
  for (const l of logs) {
    console.log(`  ${day(l.scheduledDate)}  ${l.protocol.peptide.name}  status=${l.status}  timing=${l.timing ?? '-'}`)
  }

  const peptides = await prisma.peptide.findMany({
    where: { name: { contains: 'ounjaro' } },
    select: { id: true, name: true, type: true },
  })
  console.log(`\nPEPTIDE ROWS matching "ounjaro" (${peptides.length})`)
  for (const p of peptides) console.log(`  ${p.id}  ${p.name}  type=${p.type}`)
}

main()
  .catch((e) => {
    console.error('[inspect] FAILED:', e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
