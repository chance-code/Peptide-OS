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
    typicalDose: { min: 250, max: 500, unit: 'mcg' },
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
    typicalDose: { min: 2, max: 5, unit: 'mg' },
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
    typicalDose: { min: 200, max: 400, unit: 'mcg' },
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
    typicalDose: { min: 100, max: 300, unit: 'mcg' },
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
    typicalDose: { min: 200, max: 500, unit: 'mcg' },
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
    typicalDose: { min: 1, max: 2, unit: 'mg' },
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
    typicalDose: { min: 100, max: 300, unit: 'mcg' },
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
    typicalDose: { min: 100, max: 300, unit: 'mcg' },
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
    typicalDose: { min: 10, max: 25, unit: 'mg' },
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
    typicalDose: { min: 2.5, max: 15, unit: 'mg' },
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
    typicalDose: { min: 0.25, max: 2.4, unit: 'mg' },
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
    typicalDose: { min: 1, max: 12, unit: 'mg' },
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
    typicalDose: { min: 250, max: 500, unit: 'mcg' },
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
    typicalDose: { min: 1, max: 2, unit: 'mg' },
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
    typicalDose: { min: 250, max: 500, unit: 'mcg' },
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
    typicalDose: { min: 500, max: 2000, unit: 'mcg' },
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
    typicalDose: { min: 5, max: 10, unit: 'mg' },
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
    typicalDose: { min: 1, max: 3, unit: 'mg' },
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
    typicalDose: { min: 50, max: 100, unit: 'mcg' },
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
    typicalDose: { min: 250, max: 500, unit: 'mcg' },
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
    typicalDose: { min: 200, max: 600, unit: 'mcg' },
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
    typicalDose: { min: 500, max: 1000, unit: 'mcg' },
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
    typicalDose: { min: 50, max: 250, unit: 'mg' },
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
    typicalDose: { min: 100, max: 600, unit: 'mg' },
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
 */
export function getReconstitutionDefaults(peptideName: string): {
  vialAmount: number
  vialUnit: string
  diluentVolume: number
  doseAmount: number
  doseUnit: string
} | null {
  const ref = findPeptideReference(peptideName)
  if (!ref) return null

  // Use the most common vial size (usually the first one listed)
  const vialSize = ref.typicalVialSizes[0]

  return {
    vialAmount: vialSize.amount,
    vialUnit: vialSize.unit,
    diluentVolume: ref.recommendedDiluentMl,
    // Use middle of dose range
    doseAmount: Math.round((ref.typicalDose.min + ref.typicalDose.max) / 2),
    doseUnit: ref.typicalDose.unit,
  }
}

/**
 * Get all peptide names for autocomplete
 */
export function getAllPeptideNames(): string[] {
  return PEPTIDE_REFERENCE.map(p => p.name)
}
