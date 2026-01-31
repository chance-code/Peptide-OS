// Peptide Reference Database
// Common peptides with typical reconstitution settings and dose ranges
// Used for auto-suggestions when creating protocols

export interface PeptideReference {
  name: string
  aliases?: string[] // Alternative names to match
  category: 'healing' | 'growth-hormone' | 'weight-loss' | 'cosmetic' | 'other'

  // Typical vial sizes available
  typicalVialSizes: {
    amount: number
    unit: 'mg' | 'mcg' | 'IU'
  }[]

  // Recommended reconstitution
  recommendedDiluentMl: number // Typical BAC water amount

  // Dose range
  typicalDose: {
    min: number
    max: number
    unit: 'mcg' | 'mg' | 'IU'
  }

  // Display info
  description?: string
}

export const PEPTIDE_REFERENCE: PeptideReference[] = [
  // Healing Peptides
  {
    name: 'BPC-157',
    aliases: ['BPC157', 'Body Protection Compound'],
    category: 'healing',
    typicalVialSizes: [
      { amount: 5, unit: 'mg' },
      { amount: 10, unit: 'mg' },
    ],
    recommendedDiluentMl: 2,
    typicalDose: { min: 500, max: 500, unit: 'mcg' }, // Standard dose: 500mcg 1-2x daily
    description: 'Healing peptide for gut, tendons, and tissue repair',
  },
  {
    name: 'TB-500',
    aliases: ['TB500', 'Thymosin Beta-4'],
    category: 'healing',
    typicalVialSizes: [
      { amount: 5, unit: 'mg' },
      { amount: 10, unit: 'mg' },
    ],
    recommendedDiluentMl: 2,
    typicalDose: { min: 2.5, max: 2.5, unit: 'mg' }, // Standard dose: 2.5mg 2x/week
    description: 'Promotes healing, flexibility, and tissue repair',
  },

  // Growth Hormone Peptides
  {
    name: 'Ipamorelin',
    aliases: [],
    category: 'growth-hormone',
    typicalVialSizes: [
      { amount: 5, unit: 'mg' },
      { amount: 10, unit: 'mg' },
    ],
    recommendedDiluentMl: 2,
    typicalDose: { min: 300, max: 300, unit: 'mcg' }, // Standard dose: 300mcg before bed
    description: 'Growth hormone secretagogue for recovery and anti-aging',
  },
  {
    name: 'CJC-1295',
    aliases: ['CJC1295', 'CJC-1295 DAC', 'CJC-1295 no DAC', 'Modified GRF 1-29'],
    category: 'growth-hormone',
    typicalVialSizes: [
      { amount: 2, unit: 'mg' },
      { amount: 5, unit: 'mg' },
    ],
    recommendedDiluentMl: 2,
    typicalDose: { min: 100, max: 100, unit: 'mcg' }, // Standard dose: 100mcg with GHRP
    description: 'Growth hormone releasing hormone for sustained GH release',
  },
  {
    name: 'Sermorelin',
    aliases: [],
    category: 'growth-hormone',
    typicalVialSizes: [
      { amount: 5, unit: 'mg' },
      { amount: 15, unit: 'mg' },
    ],
    recommendedDiluentMl: 3,
    typicalDose: { min: 300, max: 300, unit: 'mcg' }, // Standard dose: 300mcg before bed
    description: 'Growth hormone releasing peptide',
  },
  {
    name: 'Tesamorelin',
    aliases: ['Egrifta'],
    category: 'growth-hormone',
    typicalVialSizes: [
      { amount: 2, unit: 'mg' },
    ],
    recommendedDiluentMl: 2,
    typicalDose: { min: 2, max: 2, unit: 'mg' }, // FDA dose: 2mg daily
    description: 'FDA-approved GHRH for visceral fat reduction',
  },
  {
    name: 'GHRP-6',
    aliases: ['GHRP6'],
    category: 'growth-hormone',
    typicalVialSizes: [
      { amount: 5, unit: 'mg' },
      { amount: 10, unit: 'mg' },
    ],
    recommendedDiluentMl: 2,
    typicalDose: { min: 100, max: 100, unit: 'mcg' }, // Standard dose: 100mcg 2-3x daily
    description: 'Growth hormone releasing peptide (increases appetite)',
  },
  {
    name: 'GHRP-2',
    aliases: ['GHRP2'],
    category: 'growth-hormone',
    typicalVialSizes: [
      { amount: 5, unit: 'mg' },
      { amount: 10, unit: 'mg' },
    ],
    recommendedDiluentMl: 2,
    typicalDose: { min: 100, max: 100, unit: 'mcg' }, // Standard dose: 100mcg 2-3x daily
    description: 'Growth hormone releasing peptide',
  },
  {
    name: 'MK-677',
    aliases: ['MK677', 'Ibutamoren'],
    category: 'growth-hormone',
    typicalVialSizes: [
      { amount: 25, unit: 'mg' }, // Often oral
    ],
    recommendedDiluentMl: 1,
    typicalDose: { min: 25, max: 25, unit: 'mg' }, // Standard dose: 25mg daily
    description: 'Oral growth hormone secretagogue',
  },

  // Weight Loss Peptides
  {
    name: 'Tirzepatide',
    aliases: ['Mounjaro', 'Zepbound'],
    category: 'weight-loss',
    typicalVialSizes: [
      { amount: 5, unit: 'mg' },
      { amount: 10, unit: 'mg' },
      { amount: 15, unit: 'mg' },
      { amount: 30, unit: 'mg' },
    ],
    recommendedDiluentMl: 1,
    typicalDose: { min: 2.5, max: 2.5, unit: 'mg' }, // Start dose: 2.5mg weekly (titrate up)
    description: 'GLP-1/GIP dual agonist for weight loss and blood sugar',
  },
  {
    name: 'Semaglutide',
    aliases: ['Ozempic', 'Wegovy', 'Rybelsus'],
    category: 'weight-loss',
    typicalVialSizes: [
      { amount: 3, unit: 'mg' },
      { amount: 5, unit: 'mg' },
      { amount: 10, unit: 'mg' },
    ],
    recommendedDiluentMl: 2,
    typicalDose: { min: 0.25, max: 0.25, unit: 'mg' }, // Start dose: 0.25mg weekly (titrate up)
    description: 'GLP-1 agonist for weight loss and blood sugar control',
  },
  {
    name: 'Retatrutide',
    aliases: ['LY3437943'],
    category: 'weight-loss',
    typicalVialSizes: [
      { amount: 10, unit: 'mg' },
      { amount: 12, unit: 'mg' },
    ],
    recommendedDiluentMl: 2,
    typicalDose: { min: 1, max: 1, unit: 'mg' }, // Start dose: 1mg weekly (titrate up)
    description: 'Triple agonist (GLP-1/GIP/Glucagon) for weight loss',
  },
  {
    name: 'AOD-9604',
    aliases: ['AOD9604'],
    category: 'weight-loss',
    typicalVialSizes: [
      { amount: 5, unit: 'mg' },
    ],
    recommendedDiluentMl: 2,
    typicalDose: { min: 300, max: 300, unit: 'mcg' }, // Standard dose: 300mcg daily
    description: 'Fat-burning fragment of HGH',
  },

  // Cosmetic / Skin Peptides
  {
    name: 'GHK-Cu',
    aliases: ['GHK-Copper', 'Copper Peptide'],
    category: 'cosmetic',
    typicalVialSizes: [
      { amount: 50, unit: 'mg' },
      { amount: 100, unit: 'mg' },
    ],
    recommendedDiluentMl: 2,
    typicalDose: { min: 1, max: 1, unit: 'mg' }, // Standard dose: 1mg daily
    description: 'Copper peptide for skin, hair, and tissue remodeling',
  },
  {
    name: 'Melanotan II',
    aliases: ['Melanotan 2', 'MT2', 'MT-II'],
    category: 'cosmetic',
    typicalVialSizes: [
      { amount: 10, unit: 'mg' },
    ],
    recommendedDiluentMl: 2,
    typicalDose: { min: 250, max: 250, unit: 'mcg' }, // Loading dose: 250mcg daily
    description: 'Tanning peptide',
  },
  {
    name: 'PT-141',
    aliases: ['PT141', 'Bremelanotide'],
    category: 'other',
    typicalVialSizes: [
      { amount: 10, unit: 'mg' },
    ],
    recommendedDiluentMl: 2,
    typicalDose: { min: 1000, max: 1000, unit: 'mcg' }, // Standard dose: 1mg as needed
    description: 'Sexual function peptide',
  },

  // Other
  {
    name: 'Epithalon',
    aliases: ['Epitalon'],
    category: 'other',
    typicalVialSizes: [
      { amount: 10, unit: 'mg' },
      { amount: 50, unit: 'mg' },
    ],
    recommendedDiluentMl: 2,
    typicalDose: { min: 5, max: 5, unit: 'mg' }, // Standard dose: 5mg daily for 10-20 days
    description: 'Telomerase activator for anti-aging',
  },
  {
    name: 'Thymosin Alpha-1',
    aliases: ['TA1', 'Zadaxin'],
    category: 'other',
    typicalVialSizes: [
      { amount: 5, unit: 'mg' },
    ],
    recommendedDiluentMl: 1,
    typicalDose: { min: 1.6, max: 1.6, unit: 'mg' }, // Standard dose: 1.6mg 2x/week
    description: 'Immune modulating peptide',
  },
  {
    name: 'LL-37',
    aliases: ['Cathelicidin'],
    category: 'other',
    typicalVialSizes: [
      { amount: 5, unit: 'mg' },
    ],
    recommendedDiluentMl: 2,
    typicalDose: { min: 100, max: 100, unit: 'mcg' }, // Standard dose: 100mcg daily
    description: 'Antimicrobial and immune peptide',
  },
  {
    name: 'Selank',
    aliases: [],
    category: 'other',
    typicalVialSizes: [
      { amount: 5, unit: 'mg' },
    ],
    recommendedDiluentMl: 2,
    typicalDose: { min: 300, max: 300, unit: 'mcg' }, // Standard dose: 300mcg 1-2x daily
    description: 'Anxiolytic and cognitive peptide',
  },
  {
    name: 'Semax',
    aliases: [],
    category: 'other',
    typicalVialSizes: [
      { amount: 5, unit: 'mg' },
    ],
    recommendedDiluentMl: 2,
    typicalDose: { min: 500, max: 500, unit: 'mcg' }, // Standard dose: 500mcg 1-2x daily
    description: 'Cognitive enhancement peptide',
  },
  {
    name: 'BPC-157 + TB-500',
    aliases: ['BPC/TB', 'Wolverine Stack'],
    category: 'healing',
    typicalVialSizes: [
      { amount: 10, unit: 'mg' }, // Often combined
    ],
    recommendedDiluentMl: 2,
    typicalDose: { min: 750, max: 750, unit: 'mcg' }, // Standard dose: 750mcg daily
    description: 'Combined healing stack',
  },
  {
    name: 'NAD+',
    aliases: ['NAD Plus', 'Nicotinamide Adenine Dinucleotide'],
    category: 'other',
    typicalVialSizes: [
      { amount: 100, unit: 'mg' },
      { amount: 500, unit: 'mg' },
    ],
    recommendedDiluentMl: 2,
    typicalDose: { min: 100, max: 100, unit: 'mg' }, // Standard dose: 100mg 2-3x/week
    description: 'Cellular energy and longevity molecule',
  },
  {
    name: 'Glutathione',
    aliases: ['GSH'],
    category: 'other',
    typicalVialSizes: [
      { amount: 200, unit: 'mg' },
      { amount: 600, unit: 'mg' },
    ],
    recommendedDiluentMl: 2,
    typicalDose: { min: 200, max: 200, unit: 'mg' }, // Standard dose: 200mg 2-3x/week
    description: 'Master antioxidant',
  },
]

/**
 * Find a peptide reference by name (case-insensitive, matches aliases)
 */
export function findPeptideReference(name: string): PeptideReference | undefined {
  const normalizedName = name.toLowerCase().trim()

  return PEPTIDE_REFERENCE.find(peptide => {
    // Check main name
    if (peptide.name.toLowerCase() === normalizedName) return true

    // Check aliases
    if (peptide.aliases?.some(alias => alias.toLowerCase() === normalizedName)) return true

    // Fuzzy match - contains
    if (peptide.name.toLowerCase().includes(normalizedName) ||
        normalizedName.includes(peptide.name.toLowerCase())) return true

    if (peptide.aliases?.some(alias =>
        alias.toLowerCase().includes(normalizedName) ||
        normalizedName.includes(alias.toLowerCase())
    )) return true

    return false
  })
}

/**
 * Get default reconstitution values for a peptide
 * Note: vialAmount is NOT included - user should enter their own vial size
 */
export function getReconstitutionDefaults(peptideName: string): {
  vialUnit: string
  doseAmount: number
  doseUnit: string
  doseMin: number
  doseMax: number
  typicalVialSizes: { amount: number; unit: string }[]
} | null {
  const ref = findPeptideReference(peptideName)
  if (!ref) return null

  return {
    vialUnit: ref.typicalVialSizes[0].unit,
    // Use middle of dose range as default
    doseAmount: Math.round((ref.typicalDose.min + ref.typicalDose.max) / 2),
    doseUnit: ref.typicalDose.unit,
    doseMin: ref.typicalDose.min,
    doseMax: ref.typicalDose.max,
    typicalVialSizes: ref.typicalVialSizes,
  }
}

/**
 * Get recommended BAC water amount based on vial size
 * Aims for a concentration that results in reasonable injection volumes
 */
export function getRecommendedDiluent(peptideName: string, vialAmount: number, vialUnit: string): number | null {
  const ref = findPeptideReference(peptideName)
  if (!ref) return null

  // Calculate diluent to achieve a good concentration
  // Goal: typical dose should be ~5-20 units (0.05-0.2mL) for easy measurement
  const typicalDose = (ref.typicalDose.min + ref.typicalDose.max) / 2

  // Convert dose to vial units if needed
  let doseInVialUnits = typicalDose
  if (ref.typicalDose.unit === 'mcg' && vialUnit === 'mg') {
    doseInVialUnits = typicalDose / 1000
  } else if (ref.typicalDose.unit === 'mg' && vialUnit === 'mcg') {
    doseInVialUnits = typicalDose * 1000
  }

  // Target: ~10 units per dose (0.1mL)
  // concentration = vialAmount / diluent
  // volumePerDose = doseInVialUnits / concentration
  // 0.1 = doseInVialUnits / (vialAmount / diluent)
  // diluent = vialAmount * 0.1 / doseInVialUnits
  const targetVolumeMl = 0.1
  let recommendedDiluent = (vialAmount * targetVolumeMl) / doseInVialUnits

  // Round to reasonable values (0.5, 1, 1.5, 2, 2.5, 3, etc.)
  recommendedDiluent = Math.round(recommendedDiluent * 2) / 2

  // Clamp to reasonable range
  return Math.max(0.5, Math.min(5, recommendedDiluent))
}

/**
 * Get all peptide names for autocomplete
 */
export function getAllPeptideNames(): string[] {
  return PEPTIDE_REFERENCE.map(p => p.name)
}
