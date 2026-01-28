import type { ReconstitutionInput, ReconstitutionResult, ReconstitutionStep, DoseUnit } from '@/types'

// Unit conversion factors to mcg (base unit)
const UNIT_TO_MCG: Record<DoseUnit, number> = {
  mcg: 1,
  mg: 1000,
  IU: 1, // IU is kept as-is, not converted
}

/**
 * Calculate reconstitution results with step-by-step math
 */
export function calculateReconstitution(input: ReconstitutionInput): ReconstitutionResult {
  const { vialAmount, vialUnit, diluentVolume, targetDose, targetUnit } = input
  const steps: ReconstitutionStep[] = []

  // Step 1: Calculate concentration
  const concentration = vialAmount / diluentVolume
  const concentrationUnit = `${vialUnit}/ml`

  steps.push({
    description: 'Calculate concentration (amount per ml)',
    formula: `${vialAmount} ${vialUnit} ÷ ${diluentVolume} ml`,
    result: `${concentration.toFixed(4)} ${concentrationUnit}`,
  })

  const result: ReconstitutionResult = {
    concentration,
    concentrationUnit,
    steps,
  }

  // Step 2: Calculate volume per dose (if target dose provided)
  if (targetDose && targetUnit) {
    // Convert target dose to same unit as vial if needed
    let convertedTargetDose = targetDose
    let conversionNote = ''

    if (targetUnit !== vialUnit && vialUnit !== 'IU' && targetUnit !== 'IU') {
      // Convert both to mcg for comparison
      const targetInMcg = targetDose * UNIT_TO_MCG[targetUnit]
      const vialAmountInMcg = vialAmount * UNIT_TO_MCG[vialUnit]

      // Convert target to vial units
      convertedTargetDose = targetInMcg / UNIT_TO_MCG[vialUnit]
      conversionNote = ` (${targetDose} ${targetUnit} = ${convertedTargetDose} ${vialUnit})`

      steps.push({
        description: 'Convert target dose to vial units',
        formula: `${targetDose} ${targetUnit} × ${UNIT_TO_MCG[targetUnit]} mcg/${targetUnit} ÷ ${UNIT_TO_MCG[vialUnit]} mcg/${vialUnit}`,
        result: `${convertedTargetDose.toFixed(4)} ${vialUnit}`,
      })
    }

    const volumePerDose = convertedTargetDose / concentration

    steps.push({
      description: `Calculate volume to draw for ${targetDose} ${targetUnit} dose${conversionNote}`,
      formula: `${convertedTargetDose} ${vialUnit} ÷ ${concentration.toFixed(4)} ${concentrationUnit}`,
      result: `${volumePerDose.toFixed(4)} ml (${(volumePerDose * 100).toFixed(2)} units on insulin syringe)`,
    })

    result.volumePerDose = volumePerDose
    result.volumePerDoseUnit = 'ml'

    // Calculate total doses from vial
    const totalDoses = Math.floor(diluentVolume / volumePerDose)

    steps.push({
      description: 'Calculate total doses per vial',
      formula: `${diluentVolume} ml ÷ ${volumePerDose.toFixed(4)} ml`,
      result: `${totalDoses} doses (approximately)`,
    })

    result.totalDoses = totalDoses
  }

  return result
}

/**
 * Convert ml to insulin syringe units (100 units = 1 ml)
 */
export function mlToUnits(ml: number): number {
  return ml * 100
}

/**
 * Convert insulin syringe units to ml
 */
export function unitsToMl(units: number): number {
  return units / 100
}

/**
 * Format volume for display with appropriate precision
 */
export function formatVolume(ml: number): string {
  if (ml < 0.01) {
    return `${(ml * 1000).toFixed(2)} µl`
  }
  return `${ml.toFixed(3)} ml`
}

/**
 * Format concentration for display
 */
export function formatConcentration(amount: number, unit: string): string {
  if (amount >= 1) {
    return `${amount.toFixed(2)} ${unit}`
  }
  return `${amount.toFixed(4)} ${unit}`
}
