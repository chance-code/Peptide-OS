// Wipes one user's protocol-side data for a fresh start: protocols (and everything that
// cascades from them: dose logs, schedules, cycles, titration, history, insight caches),
// inventory vials, reconstitutions, and every AI-derived artifact (discovery insights,
// hypotheses, briefs, brain snapshots, baselines, predictions, correlations, engagement).
//
// Kept by default: the profile itself, auth/device/push records, wearable integrations,
// synced health metrics, and lab uploads/results. Add --include-health and/or --include-labs
// to wipe those too.
//
// Usage:
//   railway run npx tsx scripts/reset-user-data.ts                      # lists profiles, changes nothing
//   railway run npx tsx scripts/reset-user-data.ts --user Me --yes      # wipe (by name or id)
//   railway run npx tsx scripts/reset-user-data.ts --user Me --yes --include-health --include-labs
import prisma from '../src/lib/prisma'

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name)
  return i >= 0 ? process.argv[i + 1] : undefined
}

async function main() {
  const profiles = await prisma.userProfile.findMany({ select: { id: true, name: true, isActive: true } })
  console.log('[reset] profiles:')
  for (const p of profiles) console.log(`   ${p.id}  ${p.name}${p.isActive ? '  (active)' : ''}`)

  const target = arg('--user')
  if (!target) {
    console.log('\n[reset] nothing changed — pass --user <name|id> --yes to wipe')
    return
  }
  const user = profiles.find((p) => p.id === target || p.name.toLowerCase() === target.toLowerCase())
  if (!user) throw new Error(`no profile matching "${target}"`)
  if (!process.argv.includes('--yes')) {
    console.log(`\n[reset] would wipe ${user.name} (${user.id}) — re-run with --yes`)
    return
  }

  const includeHealth = process.argv.includes('--include-health')
  const includeLabs = process.argv.includes('--include-labs')
  const where = { userId: user.id }
  const counts: Record<string, number> = {}

  await prisma.$transaction(async (tx) => {
    // Protocol side. Protocol cascades to DoseSchedule, ProtocolCycle, TitrationStep,
    // ProtocolHistory, ProtocolInsightCache, ProtocolLabExpectation, and the analyses.
    counts.doseLog = (await tx.doseLog.deleteMany({ where })).count
    counts.protocol = (await tx.protocol.deleteMany({ where })).count
    counts.reconstitution = (await tx.reconstitution.deleteMany({ where })).count
    counts.inventoryVial = (await tx.inventoryVial.deleteMany({ where })).count

    // AI-derived artifacts
    counts.discoveryInsight = (await tx.discoveryInsight.deleteMany({ where })).count
    counts.insightEngagement = (await tx.insightEngagement.deleteMany({ where })).count
    counts.userHypothesis = (await tx.userHypothesis.deleteMany({ where })).count
    counts.cohortInsight = (await tx.cohortInsight.deleteMany({ where })).count
    counts.weeklyHealthBrief = (await tx.weeklyHealthBrief.deleteMany({ where })).count
    counts.healthBrainSnapshot = (await tx.healthBrainSnapshot.deleteMany({ where })).count
    counts.healthPrediction = (await tx.healthPrediction.deleteMany({ where })).count
    counts.personalBaseline = (await tx.personalBaseline.deleteMany({ where })).count
    counts.wearableLabCorrelation = (await tx.wearableLabCorrelation.deleteMany({ where })).count
    counts.bayesianChangepoint = (await tx.bayesianChangepoint.deleteMany({ where })).count
    counts.causalAnalysis = (await tx.causalAnalysis.deleteMany({ where })).count
    counts.userBiologicalLiteracy = (await tx.userBiologicalLiteracy.deleteMany({ where })).count

    if (includeLabs) {
      counts.labEventReview = (await tx.labEventReview.deleteMany({ where })).count
      counts.labPriorResetEvent = (await tx.labPriorResetEvent.deleteMany({ where })).count
      counts.labResult = (await tx.labResult.deleteMany({ where })).count
      counts.labUpload = (await tx.labUpload.deleteMany({ where })).count
    }
    if (includeHealth) {
      counts.healthMetric = (await tx.healthMetric.deleteMany({ where })).count
      counts.healthSyncLog = (await tx.healthSyncLog.deleteMany({ where })).count
    }
  })

  console.log(`\n[reset] wiped for ${user.name} (${user.id}):`)
  for (const [k, v] of Object.entries(counts)) if (v) console.log(`   ${k}: ${v}`)
  console.log(
    `   (kept: profile, auth/device/push, integrations${includeHealth ? '' : ', health metrics'}${includeLabs ? '' : ', labs'})`
  )
}

main()
  .catch((e) => {
    console.error('[reset] FAILED:', e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
