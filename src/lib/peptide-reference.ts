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

  // Typical protocol duration in weeks (null = indefinite/ongoing)
  typicalDurationWeeks?: number | null

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
    typicalDurationWeeks: 8, // Typical 4-8 week cycles
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
    typicalDurationWeeks: 8, // Typical 4-8 week cycles
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
    typicalDurationWeeks: null, // Ongoing treatment
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
    typicalDurationWeeks: null, // Ongoing treatment
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
    typicalDurationWeeks: 3, // 10-20 day protocol
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

  // Additional Cosmetic Peptides
  {
    name: 'Melanotan I',
    aliases: ['Melanotan 1', 'MT1', 'MT-I', 'Afamelanotide'],
    category: 'cosmetic',
    typicalVialSizes: [
      { amount: 10, unit: 'mg' },
    ],
    recommendedDiluentMl: 2,
    typicalDose: { min: 1, max: 1, unit: 'mg' }, // Standard dose: 1mg daily
    description: 'Tanning peptide with longer-lasting effects than MT-II',
  },

  // Additional Growth Hormone Peptides
  {
    name: 'HGH',
    aliases: ['Human Growth Hormone', 'Somatropin', 'Growth Hormone', 'GH'],
    category: 'growth-hormone',
    typicalVialSizes: [
      { amount: 10, unit: 'IU' },
      { amount: 36, unit: 'IU' },
      { amount: 100, unit: 'IU' },
    ],
    recommendedDiluentMl: 1,
    typicalDose: { min: 2, max: 2, unit: 'IU' }, // Standard dose: 2-4 IU daily
    description: 'Recombinant human growth hormone',
  },
  {
    name: 'IGF-1 LR3',
    aliases: ['IGF1 LR3', 'Long R3 IGF-1'],
    category: 'growth-hormone',
    typicalVialSizes: [
      { amount: 1, unit: 'mg' },
    ],
    recommendedDiluentMl: 1,
    typicalDose: { min: 50, max: 50, unit: 'mcg' }, // Standard dose: 20-50mcg daily
    description: 'Long-acting insulin-like growth factor for muscle growth',
  },
  {
    name: 'IGF-1 DES',
    aliases: ['IGF1 DES', 'DES IGF-1'],
    category: 'growth-hormone',
    typicalVialSizes: [
      { amount: 1, unit: 'mg' },
    ],
    recommendedDiluentMl: 1,
    typicalDose: { min: 50, max: 50, unit: 'mcg' }, // Standard dose: 50-100mcg pre-workout
    description: 'Fast-acting IGF-1 variant for localized muscle growth',
  },
  {
    name: 'Hexarelin',
    aliases: ['Examorelin'],
    category: 'growth-hormone',
    typicalVialSizes: [
      { amount: 5, unit: 'mg' },
    ],
    recommendedDiluentMl: 2,
    typicalDose: { min: 200, max: 200, unit: 'mcg' }, // Standard dose: 200mcg 2-3x daily
    description: 'Potent GHRP with cardiac benefits',
  },
  {
    name: 'PEG-MGF',
    aliases: ['PEGylated MGF', 'Pegylated Mechano Growth Factor'],
    category: 'growth-hormone',
    typicalVialSizes: [
      { amount: 2, unit: 'mg' },
    ],
    recommendedDiluentMl: 2,
    typicalDose: { min: 200, max: 200, unit: 'mcg' }, // Standard dose: 200mcg 2-3x/week
    description: 'Long-acting mechano growth factor for muscle repair',
  },
  {
    name: 'MGF',
    aliases: ['Mechano Growth Factor'],
    category: 'growth-hormone',
    typicalVialSizes: [
      { amount: 2, unit: 'mg' },
    ],
    recommendedDiluentMl: 2,
    typicalDose: { min: 200, max: 200, unit: 'mcg' }, // Standard dose: 200mcg post-workout
    description: 'Mechano growth factor for localized muscle growth',
  },
  {
    name: 'Fragment 176-191',
    aliases: ['HGH Frag', 'HGH Fragment', 'Frag 176-191'],
    category: 'weight-loss',
    typicalVialSizes: [
      { amount: 5, unit: 'mg' },
    ],
    recommendedDiluentMl: 2,
    typicalDose: { min: 250, max: 250, unit: 'mcg' }, // Standard dose: 250mcg 2x daily
    description: 'Fat-burning fragment of growth hormone',
  },

  // Additional Weight Loss Peptides
  {
    name: 'Liraglutide',
    aliases: ['Saxenda', 'Victoza'],
    category: 'weight-loss',
    typicalVialSizes: [
      { amount: 3, unit: 'mg' },
      { amount: 6, unit: 'mg' },
    ],
    recommendedDiluentMl: 1,
    typicalDose: { min: 0.6, max: 0.6, unit: 'mg' }, // Start dose: 0.6mg daily (titrate to 3mg)
    description: 'GLP-1 agonist for weight loss (daily injection)',
  },
  {
    name: 'Exenatide',
    aliases: ['Byetta', 'Bydureon'],
    category: 'weight-loss',
    typicalVialSizes: [
      { amount: 2, unit: 'mg' },
    ],
    recommendedDiluentMl: 1,
    typicalDose: { min: 5, max: 5, unit: 'mcg' }, // Start dose: 5mcg 2x daily
    description: 'GLP-1 agonist for blood sugar and weight',
  },
  {
    name: '5-Amino-1MQ',
    aliases: ['5-Amino 1MQ'],
    category: 'weight-loss',
    typicalVialSizes: [
      { amount: 50, unit: 'mg' },
    ],
    recommendedDiluentMl: 1,
    typicalDose: { min: 50, max: 50, unit: 'mg' }, // Standard dose: 50mg daily (often oral)
    description: 'NNMT inhibitor for fat metabolism',
  },
  {
    name: 'MOTS-c',
    aliases: ['MOTS-C', 'Mitochondrial ORF of the 12S rRNA type-c'],
    category: 'weight-loss',
    typicalVialSizes: [
      { amount: 5, unit: 'mg' },
    ],
    recommendedDiluentMl: 2,
    typicalDose: { min: 5, max: 5, unit: 'mg' }, // Standard dose: 5mg 2-3x/week
    description: 'Mitochondrial peptide for metabolism and longevity',
  },

  // Additional Healing Peptides
  {
    name: 'Pentosan Polysulfate',
    aliases: ['PPS', 'Cartrophen'],
    category: 'healing',
    typicalVialSizes: [
      { amount: 100, unit: 'mg' },
    ],
    recommendedDiluentMl: 1,
    typicalDose: { min: 3, max: 3, unit: 'mg' }, // Dose varies by weight
    description: 'Joint and cartilage support',
  },
  {
    name: 'KPV',
    aliases: ['Lys-Pro-Val'],
    category: 'healing',
    typicalVialSizes: [
      { amount: 5, unit: 'mg' },
    ],
    recommendedDiluentMl: 2,
    typicalDose: { min: 500, max: 500, unit: 'mcg' }, // Standard dose: 500mcg daily
    description: 'Anti-inflammatory peptide for gut and skin',
  },
  {
    name: 'Larazotide',
    aliases: ['AT-1001'],
    category: 'healing',
    typicalVialSizes: [
      { amount: 5, unit: 'mg' },
    ],
    recommendedDiluentMl: 2,
    typicalDose: { min: 500, max: 500, unit: 'mcg' }, // Standard dose: 0.5mg 3x daily
    description: 'Gut barrier and tight junction support',
  },

  // Sleep & Recovery
  {
    name: 'DSIP',
    aliases: ['Delta Sleep Inducing Peptide'],
    category: 'other',
    typicalVialSizes: [
      { amount: 5, unit: 'mg' },
    ],
    recommendedDiluentMl: 2,
    typicalDose: { min: 100, max: 100, unit: 'mcg' }, // Standard dose: 100mcg before bed
    description: 'Sleep-promoting peptide',
  },

  // Cognitive & Neuro
  {
    name: 'Dihexa',
    aliases: ['PNB-0408'],
    category: 'other',
    typicalVialSizes: [
      { amount: 10, unit: 'mg' },
    ],
    recommendedDiluentMl: 2,
    typicalDose: { min: 10, max: 10, unit: 'mg' }, // Standard dose: 10-20mg (often oral)
    description: 'Cognitive enhancement and neuroprotection',
  },
  {
    name: 'P21',
    aliases: ['P-21'],
    category: 'other',
    typicalVialSizes: [
      { amount: 10, unit: 'mg' },
    ],
    recommendedDiluentMl: 2,
    typicalDose: { min: 500, max: 500, unit: 'mcg' }, // Standard dose: 500mcg daily
    description: 'CNTF-derived cognitive peptide',
  },
  {
    name: 'FGL',
    aliases: ['FGL Peptide', 'NCAM Mimetic'],
    category: 'other',
    typicalVialSizes: [
      { amount: 5, unit: 'mg' },
    ],
    recommendedDiluentMl: 2,
    typicalDose: { min: 1, max: 1, unit: 'mg' }, // Standard dose: 1mg daily
    description: 'Neural cell adhesion molecule mimetic for cognition',
  },
  {
    name: 'Cerebrolysin',
    aliases: [],
    category: 'other',
    typicalVialSizes: [
      { amount: 5, unit: 'mg' },
      { amount: 10, unit: 'mg' },
    ],
    recommendedDiluentMl: 1,
    typicalDose: { min: 5, max: 5, unit: 'mg' }, // Standard dose: 5-10mg daily
    description: 'Neuroprotective brain peptide complex',
  },
  {
    name: 'Cortexin',
    aliases: [],
    category: 'other',
    typicalVialSizes: [
      { amount: 10, unit: 'mg' },
    ],
    recommendedDiluentMl: 2,
    typicalDose: { min: 10, max: 10, unit: 'mg' }, // Standard dose: 10mg daily
    description: 'Neuroprotective peptide complex',
  },
  {
    name: 'NA-Selank',
    aliases: ['N-Acetyl Selank', 'NA Selank'],
    category: 'other',
    typicalVialSizes: [
      { amount: 5, unit: 'mg' },
    ],
    recommendedDiluentMl: 2,
    typicalDose: { min: 500, max: 500, unit: 'mcg' }, // Standard dose: 500mcg 1-2x daily
    description: 'Enhanced anxiolytic and cognitive peptide',
  },
  {
    name: 'NA-Semax',
    aliases: ['N-Acetyl Semax', 'NA Semax'],
    category: 'other',
    typicalVialSizes: [
      { amount: 5, unit: 'mg' },
    ],
    recommendedDiluentMl: 2,
    typicalDose: { min: 600, max: 600, unit: 'mcg' }, // Standard dose: 600mcg 1-2x daily
    description: 'Enhanced cognitive and focus peptide',
  },

  // Immune & Longevity
  {
    name: 'Thymalin',
    aliases: [],
    category: 'other',
    typicalVialSizes: [
      { amount: 10, unit: 'mg' },
    ],
    recommendedDiluentMl: 2,
    typicalDose: { min: 10, max: 10, unit: 'mg' }, // Standard dose: 10mg daily for 10 days
    description: 'Thymic peptide for immune function',
  },
  {
    name: 'Humanin',
    aliases: ['HN'],
    category: 'other',
    typicalVialSizes: [
      { amount: 5, unit: 'mg' },
    ],
    recommendedDiluentMl: 2,
    typicalDose: { min: 1, max: 1, unit: 'mg' }, // Standard dose: 1-2mg daily
    description: 'Mitochondrial-derived peptide for longevity',
  },
  {
    name: 'SS-31',
    aliases: ['Elamipretide', 'Bendavia', 'MTP-131'],
    category: 'other',
    typicalVialSizes: [
      { amount: 5, unit: 'mg' },
    ],
    recommendedDiluentMl: 2,
    typicalDose: { min: 5, max: 5, unit: 'mg' }, // Standard dose: 5mg daily
    description: 'Mitochondrial-targeted peptide for energy',
  },

  // Sexual Health
  {
    name: 'Kisspeptin-10',
    aliases: ['Kisspeptin', 'KP-10'],
    category: 'other',
    typicalVialSizes: [
      { amount: 5, unit: 'mg' },
    ],
    recommendedDiluentMl: 2,
    typicalDose: { min: 1, max: 1, unit: 'mg' }, // Dose varies
    description: 'Hormone regulation and reproductive health',
  },
  {
    name: 'Gonadorelin',
    aliases: ['GnRH', 'LHRH'],
    category: 'other',
    typicalVialSizes: [
      { amount: 2, unit: 'mg' },
    ],
    recommendedDiluentMl: 2,
    typicalDose: { min: 100, max: 100, unit: 'mcg' }, // Standard dose: 100mcg 2x/week
    description: 'Gonadotropin-releasing hormone for testosterone support',
  },

  // Hair & Skin
  {
    name: 'PTD-DBM',
    aliases: ['Hair Growth Peptide'],
    category: 'cosmetic',
    typicalVialSizes: [
      { amount: 5, unit: 'mg' },
    ],
    recommendedDiluentMl: 2,
    typicalDose: { min: 100, max: 100, unit: 'mcg' }, // Standard dose: topical or 100mcg subQ
    description: 'Hair follicle activation peptide',
  },
  {
    name: 'Thymulin',
    aliases: ['Zinc-Thymulin'],
    category: 'cosmetic',
    typicalVialSizes: [
      { amount: 5, unit: 'mg' },
    ],
    recommendedDiluentMl: 2,
    typicalDose: { min: 100, max: 100, unit: 'mcg' }, // For hair: topical or injection
    description: 'Hair regrowth and immune peptide',
  },

  // Muscle Building
  {
    name: 'Follistatin-344',
    aliases: ['Follistatin', 'FS-344'],
    category: 'growth-hormone',
    typicalVialSizes: [
      { amount: 1, unit: 'mg' },
    ],
    recommendedDiluentMl: 1,
    typicalDose: { min: 100, max: 100, unit: 'mcg' }, // Standard dose: 100mcg daily
    description: 'Myostatin inhibitor for muscle growth',
  },
  {
    name: 'ACE-031',
    aliases: ['ACVR2B'],
    category: 'growth-hormone',
    typicalVialSizes: [
      { amount: 1, unit: 'mg' },
    ],
    recommendedDiluentMl: 1,
    typicalDose: { min: 1, max: 1, unit: 'mg' }, // Dose varies
    description: 'Myostatin blocker for muscle mass',
  },

  // VIP & Related
  {
    name: 'VIP',
    aliases: ['Vasoactive Intestinal Peptide'],
    category: 'other',
    typicalVialSizes: [
      { amount: 6, unit: 'mg' },
    ],
    recommendedDiluentMl: 6,
    typicalDose: { min: 50, max: 50, unit: 'mcg' }, // Often nasal: 50mcg 4x daily
    description: 'Neuromodulator and immune regulator',
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
  typicalDurationWeeks: number | null | undefined
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
    typicalDurationWeeks: ref.typicalDurationWeeks,
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
