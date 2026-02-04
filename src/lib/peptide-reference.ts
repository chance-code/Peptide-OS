// Peptide Reference Database
// Common peptides with typical reconstitution settings and dose ranges
// Used for auto-suggestions when creating protocols

export type CycleType = 'continuous' | 'cycled' | 'pulse'
export type Reassessment = 'end_of_cycle' | 'periodic' | 'symptom_driven'
export type ConfidenceLevel = 'low' | 'medium' | 'high'

export interface CycleGuidance {
  cycleType: CycleType
  cycleLengthWeeks?: { min: number; max: number }
  offCycleLengthWeeks?: { min: number; max: number }
  reassessment: Reassessment
  reassessmentNote?: string
  timeToEffect: { phase: string; description: string }[]
  primaryOutcomes: { outcome: string; confidence: ConfidenceLevel }[]
  stopSignals: string[]
}

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

  // Cycle and decision guidance
  guidance?: CycleGuidance
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
    typicalDose: { min: 500, max: 500, unit: 'mcg' },
    typicalDurationWeeks: 8,
    description: 'Healing peptide for gut, tendons, and tissue repair',
    guidance: {
      cycleType: 'cycled',
      cycleLengthWeeks: { min: 4, max: 8 },
      offCycleLengthWeeks: { min: 4, max: 4 },
      reassessment: 'end_of_cycle',
      timeToEffect: [
        { phase: 'Week 1–2', description: 'Subtle comfort improvement' },
        { phase: 'Week 3–5', description: 'Noticeable pain or healing changes' },
        { phase: 'Week 6–8', description: 'Full effect window' },
      ],
      primaryOutcomes: [
        { outcome: 'Recovery', confidence: 'high' },
        { outcome: 'Inflammation', confidence: 'medium' },
        { outcome: 'Sleep', confidence: 'low' },
      ],
      stopSignals: ['No subjective improvement after 4 weeks', 'Persistent GI discomfort', 'Symptoms fully resolved'],
    },
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
    typicalDose: { min: 2.5, max: 2.5, unit: 'mg' },
    typicalDurationWeeks: 8,
    description: 'Promotes healing, flexibility, and tissue repair',
    guidance: {
      cycleType: 'cycled',
      cycleLengthWeeks: { min: 4, max: 8 },
      offCycleLengthWeeks: { min: 4, max: 4 },
      reassessment: 'end_of_cycle',
      timeToEffect: [
        { phase: 'Week 1–2', description: 'Reduced stiffness may begin' },
        { phase: 'Week 3–5', description: 'Improved flexibility and healing' },
        { phase: 'Week 6–8', description: 'Tissue remodeling effects' },
      ],
      primaryOutcomes: [
        { outcome: 'Recovery', confidence: 'high' },
        { outcome: 'Inflammation', confidence: 'medium' },
      ],
      stopSignals: ['No improvement in mobility after 4 weeks', 'Unusual swelling at injection site', 'Injury fully resolved'],
    },
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
    guidance: {
      cycleType: 'cycled',
      cycleLengthWeeks: { min: 8, max: 16 },
      offCycleLengthWeeks: { min: 4, max: 8 },
      reassessment: 'periodic',
      reassessmentNote: 'Every 3–4 months',
      timeToEffect: [
        { phase: 'Week 1–2', description: 'Improved sleep quality' },
        { phase: 'Week 4–8', description: 'Body composition changes' },
        { phase: 'Week 8–12', description: 'Cumulative recovery effects' },
      ],
      primaryOutcomes: [
        { outcome: 'Recovery', confidence: 'medium' },
        { outcome: 'Sleep', confidence: 'medium' },
        { outcome: 'Body composition', confidence: 'low' },
      ],
      stopSignals: ['Water retention or joint pain', 'Numbness or tingling in extremities', 'No sleep or recovery improvement after 8 weeks'],
    },
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
    guidance: {
      cycleType: 'cycled',
      cycleLengthWeeks: { min: 8, max: 16 },
      offCycleLengthWeeks: { min: 4, max: 8 },
      reassessment: 'periodic',
      reassessmentNote: 'Every 3–4 months',
      timeToEffect: [
        { phase: 'Week 1–2', description: 'Improved sleep quality' },
        { phase: 'Week 4–8', description: 'Body composition changes' },
        { phase: 'Week 8–12', description: 'Cumulative recovery effects' },
      ],
      primaryOutcomes: [
        { outcome: 'Recovery', confidence: 'medium' },
        { outcome: 'Sleep', confidence: 'medium' },
        { outcome: 'Body composition', confidence: 'low' },
      ],
      stopSignals: ['Water retention or joint pain', 'Numbness or tingling in extremities', 'No sleep or recovery improvement after 8 weeks'],
    },
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
    guidance: {
      cycleType: 'cycled',
      cycleLengthWeeks: { min: 8, max: 16 },
      offCycleLengthWeeks: { min: 4, max: 8 },
      reassessment: 'periodic',
      reassessmentNote: 'Every 3–4 months',
      timeToEffect: [
        { phase: 'Week 1–2', description: 'Improved sleep quality' },
        { phase: 'Week 4–8', description: 'Body composition changes' },
        { phase: 'Week 8–12', description: 'Cumulative recovery effects' },
      ],
      primaryOutcomes: [
        { outcome: 'Recovery', confidence: 'medium' },
        { outcome: 'Sleep', confidence: 'medium' },
        { outcome: 'Body composition', confidence: 'low' },
      ],
      stopSignals: ['Water retention or joint pain', 'Numbness or tingling in extremities', 'No sleep or recovery improvement after 8 weeks'],
    },
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
    guidance: {
      cycleType: 'continuous',
      reassessment: 'periodic',
      reassessmentNote: 'Every 3 months with prescriber',
      timeToEffect: [
        { phase: 'Week 2–4', description: 'Early visceral fat reduction' },
        { phase: 'Week 8–12', description: 'Measurable body composition changes' },
        { phase: 'Week 12+', description: 'Sustained reduction' },
      ],
      primaryOutcomes: [
        { outcome: 'Body composition', confidence: 'high' },
        { outcome: 'Inflammation', confidence: 'medium' },
      ],
      stopSignals: ['No visceral fat reduction after 12 weeks', 'Elevated IGF-1 levels', 'Joint pain or swelling'],
    },
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
    guidance: {
      cycleType: 'cycled',
      cycleLengthWeeks: { min: 8, max: 16 },
      offCycleLengthWeeks: { min: 4, max: 8 },
      reassessment: 'periodic',
      reassessmentNote: 'Every 3–4 months',
      timeToEffect: [
        { phase: 'Week 1–2', description: 'Improved sleep quality' },
        { phase: 'Week 4–8', description: 'Body composition changes' },
        { phase: 'Week 8–12', description: 'Cumulative recovery effects' },
      ],
      primaryOutcomes: [
        { outcome: 'Recovery', confidence: 'medium' },
        { outcome: 'Sleep', confidence: 'medium' },
        { outcome: 'Body composition', confidence: 'low' },
      ],
      stopSignals: ['Water retention or joint pain', 'Numbness or tingling in extremities', 'No sleep or recovery improvement after 8 weeks'],
    },
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
    guidance: {
      cycleType: 'cycled',
      cycleLengthWeeks: { min: 8, max: 16 },
      offCycleLengthWeeks: { min: 4, max: 8 },
      reassessment: 'periodic',
      reassessmentNote: 'Every 3–4 months',
      timeToEffect: [
        { phase: 'Week 1–2', description: 'Improved sleep quality' },
        { phase: 'Week 4–8', description: 'Body composition changes' },
        { phase: 'Week 8–12', description: 'Cumulative recovery effects' },
      ],
      primaryOutcomes: [
        { outcome: 'Recovery', confidence: 'medium' },
        { outcome: 'Sleep', confidence: 'medium' },
        { outcome: 'Body composition', confidence: 'low' },
      ],
      stopSignals: ['Water retention or joint pain', 'Numbness or tingling in extremities', 'No sleep or recovery improvement after 8 weeks'],
    },
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
    guidance: {
      cycleType: 'cycled',
      cycleLengthWeeks: { min: 8, max: 12 },
      offCycleLengthWeeks: { min: 4, max: 8 },
      reassessment: 'periodic',
      reassessmentNote: 'Monitor blood sugar every 8 weeks',
      timeToEffect: [
        { phase: 'Week 1–2', description: 'Improved sleep and appetite' },
        { phase: 'Week 4–8', description: 'Recovery and fullness' },
        { phase: 'Week 8–12', description: 'Body composition shifts' },
      ],
      primaryOutcomes: [
        { outcome: 'Sleep', confidence: 'high' },
        { outcome: 'Recovery', confidence: 'medium' },
        { outcome: 'Body composition', confidence: 'medium' },
      ],
      stopSignals: ['Blood sugar elevation', 'Unmanageable appetite increase', 'Water retention or lethargy'],
    },
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
    guidance: {
      cycleType: 'continuous',
      reassessment: 'periodic',
      reassessmentNote: 'Every 3 months with prescriber',
      timeToEffect: [
        { phase: 'Week 1–4', description: 'Reduced appetite' },
        { phase: 'Week 4–12', description: 'Measurable weight loss' },
        { phase: 'Week 12+', description: 'Significant body composition changes' },
      ],
      primaryOutcomes: [
        { outcome: 'Body composition', confidence: 'high' },
        { outcome: 'Blood sugar', confidence: 'high' },
        { outcome: 'Inflammation', confidence: 'medium' },
      ],
      stopSignals: ['Severe nausea not improving with dose adjustment', 'Signs of pancreatitis (severe abdominal pain)', 'Gallbladder symptoms'],
    },
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
    guidance: {
      cycleType: 'continuous',
      reassessment: 'periodic',
      reassessmentNote: 'Every 3 months with prescriber',
      timeToEffect: [
        { phase: 'Week 1–4', description: 'Reduced appetite' },
        { phase: 'Week 4–12', description: 'Measurable weight loss' },
        { phase: 'Week 12+', description: 'Significant body composition changes' },
      ],
      primaryOutcomes: [
        { outcome: 'Body composition', confidence: 'high' },
        { outcome: 'Blood sugar', confidence: 'high' },
        { outcome: 'Inflammation', confidence: 'medium' },
      ],
      stopSignals: ['Severe nausea not improving with dose adjustment', 'Signs of pancreatitis (severe abdominal pain)', 'Gallbladder symptoms'],
    },
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
    guidance: {
      cycleType: 'continuous',
      reassessment: 'periodic',
      reassessmentNote: 'Every 3 months with prescriber',
      timeToEffect: [
        { phase: 'Week 1–4', description: 'Reduced appetite' },
        { phase: 'Week 4–12', description: 'Measurable weight loss' },
        { phase: 'Week 12+', description: 'Significant body composition changes' },
      ],
      primaryOutcomes: [
        { outcome: 'Body composition', confidence: 'high' },
        { outcome: 'Inflammation', confidence: 'medium' },
      ],
      stopSignals: ['Severe nausea not improving with dose adjustment', 'Signs of pancreatitis (severe abdominal pain)', 'Gallbladder symptoms'],
    },
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
    guidance: {
      cycleType: 'cycled',
      cycleLengthWeeks: { min: 8, max: 12 },
      offCycleLengthWeeks: { min: 4, max: 4 },
      reassessment: 'end_of_cycle',
      timeToEffect: [
        { phase: 'Week 1–2', description: 'Subtle changes' },
        { phase: 'Week 4–8', description: 'Body composition changes' },
        { phase: 'Week 8–12', description: 'Full effect window' },
      ],
      primaryOutcomes: [
        { outcome: 'Body composition', confidence: 'medium' },
      ],
      stopSignals: ['No measurable fat loss after 8 weeks', 'Injection site reactions'],
    },
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
    guidance: {
      cycleType: 'cycled',
      cycleLengthWeeks: { min: 8, max: 12 },
      offCycleLengthWeeks: { min: 4, max: 8 },
      reassessment: 'end_of_cycle',
      timeToEffect: [
        { phase: 'Week 2–4', description: 'Skin quality changes' },
        { phase: 'Week 4–8', description: 'Tissue remodeling' },
        { phase: 'Week 8–12', description: 'Cumulative effects' },
      ],
      primaryOutcomes: [
        { outcome: 'Recovery', confidence: 'medium' },
        { outcome: 'Inflammation', confidence: 'medium' },
      ],
      stopSignals: ['No visible skin or healing improvement after 8 weeks', 'Injection site discoloration'],
    },
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
    guidance: {
      cycleType: 'cycled',
      cycleLengthWeeks: { min: 2, max: 4 },
      offCycleLengthWeeks: { min: 4, max: 8 },
      reassessment: 'symptom_driven',
      timeToEffect: [
        { phase: 'Week 1', description: 'Initial tanning response' },
        { phase: 'Week 2–3', description: 'Visible darkening' },
        { phase: 'Week 4+', description: 'Maintenance phase' },
      ],
      primaryOutcomes: [
        { outcome: 'Cosmetic', confidence: 'high' },
      ],
      stopSignals: ['New or changing moles', 'Persistent nausea', 'Desired tan achieved (transition to maintenance)'],
    },
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
    guidance: {
      cycleType: 'pulse',
      reassessment: 'symptom_driven',
      timeToEffect: [
        { phase: '1–2 hours', description: 'Onset of effects' },
        { phase: '4–8 hours', description: 'Peak response window' },
      ],
      primaryOutcomes: [
        { outcome: 'Sexual function', confidence: 'high' },
      ],
      stopSignals: ['Persistent nausea', 'Elevated blood pressure', 'Flushing that doesn\'t resolve'],
    },
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
    guidance: {
      cycleType: 'cycled',
      cycleLengthWeeks: { min: 2, max: 3 },
      offCycleLengthWeeks: { min: 16, max: 24 },
      reassessment: 'periodic',
      reassessmentNote: 'Every 4–6 months',
      timeToEffect: [
        { phase: 'Day 1–5', description: 'Subtle changes' },
        { phase: 'Week 1–2', description: 'Sleep improvement' },
        { phase: 'Week 2–3', description: 'Cumulative effects' },
      ],
      primaryOutcomes: [
        { outcome: 'Sleep', confidence: 'medium' },
        { outcome: 'Recovery', confidence: 'low' },
      ],
      stopSignals: ['No sleep improvement after full cycle', 'Unusual fatigue'],
    },
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
    guidance: {
      cycleType: 'cycled',
      cycleLengthWeeks: { min: 4, max: 8 },
      offCycleLengthWeeks: { min: 4, max: 4 },
      reassessment: 'end_of_cycle',
      timeToEffect: [
        { phase: 'Week 1–2', description: 'Immune priming' },
        { phase: 'Week 3–4', description: 'Measurable immune response' },
        { phase: 'Week 6–8', description: 'Full effect' },
      ],
      primaryOutcomes: [
        { outcome: 'Immune function', confidence: 'high' },
        { outcome: 'Recovery', confidence: 'low' },
      ],
      stopSignals: ['No change in illness frequency after 8 weeks', 'Autoimmune flare'],
    },
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
    guidance: {
      cycleType: 'cycled',
      cycleLengthWeeks: { min: 2, max: 4 },
      offCycleLengthWeeks: { min: 4, max: 4 },
      reassessment: 'end_of_cycle',
      timeToEffect: [
        { phase: 'Week 1', description: 'Antimicrobial effects' },
        { phase: 'Week 2–3', description: 'Immune modulation' },
        { phase: 'Week 3–4', description: 'Tissue effects' },
      ],
      primaryOutcomes: [
        { outcome: 'Immune function', confidence: 'medium' },
        { outcome: 'Inflammation', confidence: 'medium' },
      ],
      stopSignals: ['No improvement in infection markers', 'Injection site inflammation'],
    },
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
    guidance: {
      cycleType: 'cycled',
      cycleLengthWeeks: { min: 2, max: 4 },
      offCycleLengthWeeks: { min: 2, max: 4 },
      reassessment: 'end_of_cycle',
      timeToEffect: [
        { phase: 'Day 1–3', description: 'Anxiolytic onset' },
        { phase: 'Week 1–2', description: 'Cognitive clarity' },
        { phase: 'Week 2–4', description: 'Sustained mood effects' },
      ],
      primaryOutcomes: [
        { outcome: 'Cognition', confidence: 'medium' },
        { outcome: 'Mood', confidence: 'medium' },
      ],
      stopSignals: ['No anxiety reduction after 2 weeks', 'Excessive sedation', 'Headaches'],
    },
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
    guidance: {
      cycleType: 'cycled',
      cycleLengthWeeks: { min: 2, max: 4 },
      offCycleLengthWeeks: { min: 2, max: 4 },
      reassessment: 'end_of_cycle',
      timeToEffect: [
        { phase: 'Day 1–3', description: 'Focus improvement' },
        { phase: 'Week 1–2', description: 'Cognitive enhancement' },
        { phase: 'Week 2–4', description: 'Sustained effects' },
      ],
      primaryOutcomes: [
        { outcome: 'Cognition', confidence: 'medium' },
      ],
      stopSignals: ['No cognitive improvement after 2 weeks', 'Irritability or overstimulation', 'Headaches'],
    },
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
    guidance: {
      cycleType: 'cycled',
      cycleLengthWeeks: { min: 4, max: 8 },
      offCycleLengthWeeks: { min: 4, max: 4 },
      reassessment: 'end_of_cycle',
      timeToEffect: [
        { phase: 'Week 1–2', description: 'Subtle comfort improvement' },
        { phase: 'Week 3–5', description: 'Noticeable pain or healing changes' },
        { phase: 'Week 6–8', description: 'Full effect window' },
      ],
      primaryOutcomes: [
        { outcome: 'Recovery', confidence: 'high' },
        { outcome: 'Inflammation', confidence: 'medium' },
        { outcome: 'Mobility', confidence: 'medium' },
      ],
      stopSignals: ['No improvement after 4 weeks', 'Injection site reactions', 'Injury fully resolved'],
    },
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
    guidance: {
      cycleType: 'cycled',
      cycleLengthWeeks: { min: 4, max: 8 },
      offCycleLengthWeeks: { min: 4, max: 4 },
      reassessment: 'periodic',
      reassessmentNote: 'Every 2–3 months',
      timeToEffect: [
        { phase: 'Session 1–2', description: 'Energy boost' },
        { phase: 'Week 2–4', description: 'Sustained energy' },
        { phase: 'Week 4–8', description: 'Cumulative effects' },
      ],
      primaryOutcomes: [
        { outcome: 'Recovery', confidence: 'medium' },
        { outcome: 'Cognition', confidence: 'low' },
      ],
      stopSignals: ['No energy improvement after 4 weeks', 'Flushing or nausea during infusion', 'Heart palpitations'],
    },
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
    guidance: {
      cycleType: 'continuous',
      reassessment: 'periodic',
      reassessmentNote: 'Every 3 months',
      timeToEffect: [
        { phase: 'Week 1–2', description: 'Subtle detox support' },
        { phase: 'Week 2–4', description: 'Skin brightness' },
        { phase: 'Week 4–8', description: 'Cumulative antioxidant effects' },
      ],
      primaryOutcomes: [
        { outcome: 'Recovery', confidence: 'medium' },
        { outcome: 'Inflammation', confidence: 'medium' },
      ],
      stopSignals: ['GI discomfort', 'No subjective improvement after 4 weeks'],
    },
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
    guidance: {
      cycleType: 'cycled',
      cycleLengthWeeks: { min: 2, max: 4 },
      offCycleLengthWeeks: { min: 4, max: 8 },
      reassessment: 'symptom_driven',
      timeToEffect: [
        { phase: 'Week 1', description: 'Initial tanning response' },
        { phase: 'Week 2–3', description: 'Visible darkening' },
        { phase: 'Week 4+', description: 'Maintenance phase' },
      ],
      primaryOutcomes: [
        { outcome: 'Cosmetic', confidence: 'high' },
      ],
      stopSignals: ['New or changing moles', 'Persistent nausea', 'Desired tan achieved (transition to maintenance)'],
    },
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
    guidance: {
      cycleType: 'cycled',
      cycleLengthWeeks: { min: 12, max: 24 },
      offCycleLengthWeeks: { min: 4, max: 8 },
      reassessment: 'periodic',
      reassessmentNote: 'Every 3 months with lab work',
      timeToEffect: [
        { phase: 'Week 1–4', description: 'Sleep and skin improvement' },
        { phase: 'Week 4–12', description: 'Body composition changes' },
        { phase: 'Week 12+', description: 'Full effect range' },
      ],
      primaryOutcomes: [
        { outcome: 'Recovery', confidence: 'high' },
        { outcome: 'Body composition', confidence: 'high' },
        { outcome: 'Sleep', confidence: 'medium' },
      ],
      stopSignals: ['Joint pain or carpal tunnel symptoms', 'Elevated blood sugar', 'Unusual swelling'],
    },
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
    guidance: {
      cycleType: 'cycled',
      cycleLengthWeeks: { min: 4, max: 6 },
      offCycleLengthWeeks: { min: 4, max: 4 },
      reassessment: 'end_of_cycle',
      timeToEffect: [
        { phase: 'Week 1–2', description: 'Muscle fullness' },
        { phase: 'Week 3–4', description: 'Localized growth response' },
        { phase: 'Week 5–6', description: 'Plateau' },
      ],
      primaryOutcomes: [
        { outcome: 'Body composition', confidence: 'medium' },
        { outcome: 'Recovery', confidence: 'low' },
      ],
      stopSignals: ['Hypoglycemia symptoms', 'Joint pain', 'No visible response after 4 weeks'],
    },
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
    guidance: {
      cycleType: 'cycled',
      cycleLengthWeeks: { min: 4, max: 6 },
      offCycleLengthWeeks: { min: 4, max: 4 },
      reassessment: 'end_of_cycle',
      timeToEffect: [
        { phase: 'Week 1–2', description: 'Muscle fullness' },
        { phase: 'Week 3–4', description: 'Localized growth response' },
        { phase: 'Week 5–6', description: 'Plateau' },
      ],
      primaryOutcomes: [
        { outcome: 'Body composition', confidence: 'medium' },
        { outcome: 'Recovery', confidence: 'low' },
      ],
      stopSignals: ['Hypoglycemia symptoms', 'Joint pain', 'No visible response after 4 weeks'],
    },
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
    guidance: {
      cycleType: 'cycled',
      cycleLengthWeeks: { min: 8, max: 16 },
      offCycleLengthWeeks: { min: 4, max: 8 },
      reassessment: 'periodic',
      reassessmentNote: 'Every 3–4 months',
      timeToEffect: [
        { phase: 'Week 1–2', description: 'Improved sleep quality' },
        { phase: 'Week 4–8', description: 'Body composition changes' },
        { phase: 'Week 8–12', description: 'Cumulative recovery effects' },
      ],
      primaryOutcomes: [
        { outcome: 'Recovery', confidence: 'medium' },
        { outcome: 'Sleep', confidence: 'medium' },
        { outcome: 'Body composition', confidence: 'low' },
      ],
      stopSignals: ['Water retention or joint pain', 'Numbness or tingling in extremities', 'No sleep or recovery improvement after 8 weeks'],
    },
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
    guidance: {
      cycleType: 'cycled',
      cycleLengthWeeks: { min: 4, max: 6 },
      offCycleLengthWeeks: { min: 4, max: 4 },
      reassessment: 'end_of_cycle',
      timeToEffect: [
        { phase: 'Week 1–2', description: 'Localized soreness reduction' },
        { phase: 'Week 3–4', description: 'Improved recovery' },
        { phase: 'Week 5–6', description: 'Muscle repair' },
      ],
      primaryOutcomes: [
        { outcome: 'Recovery', confidence: 'medium' },
        { outcome: 'Body composition', confidence: 'low' },
      ],
      stopSignals: ['No recovery improvement after 4 weeks', 'Injection site issues'],
    },
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
    guidance: {
      cycleType: 'cycled',
      cycleLengthWeeks: { min: 4, max: 6 },
      offCycleLengthWeeks: { min: 4, max: 4 },
      reassessment: 'end_of_cycle',
      timeToEffect: [
        { phase: 'Week 1–2', description: 'Localized soreness reduction' },
        { phase: 'Week 3–4', description: 'Improved recovery' },
        { phase: 'Week 5–6', description: 'Muscle repair' },
      ],
      primaryOutcomes: [
        { outcome: 'Recovery', confidence: 'medium' },
        { outcome: 'Body composition', confidence: 'low' },
      ],
      stopSignals: ['No recovery improvement after 4 weeks', 'Injection site issues'],
    },
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
    guidance: {
      cycleType: 'cycled',
      cycleLengthWeeks: { min: 8, max: 12 },
      offCycleLengthWeeks: { min: 4, max: 4 },
      reassessment: 'end_of_cycle',
      timeToEffect: [
        { phase: 'Week 1–2', description: 'Subtle changes' },
        { phase: 'Week 4–8', description: 'Body composition changes' },
        { phase: 'Week 8–12', description: 'Full effect window' },
      ],
      primaryOutcomes: [
        { outcome: 'Body composition', confidence: 'medium' },
      ],
      stopSignals: ['No measurable fat loss after 8 weeks', 'Injection site reactions'],
    },
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
    guidance: {
      cycleType: 'continuous',
      reassessment: 'periodic',
      reassessmentNote: 'Every 3 months with prescriber',
      timeToEffect: [
        { phase: 'Week 1–4', description: 'Reduced appetite' },
        { phase: 'Week 4–12', description: 'Measurable weight loss' },
        { phase: 'Week 12+', description: 'Significant body composition changes' },
      ],
      primaryOutcomes: [
        { outcome: 'Body composition', confidence: 'high' },
        { outcome: 'Inflammation', confidence: 'medium' },
      ],
      stopSignals: ['Severe nausea not improving with dose adjustment', 'Signs of pancreatitis (severe abdominal pain)', 'Gallbladder symptoms'],
    },
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
    guidance: {
      cycleType: 'continuous',
      reassessment: 'periodic',
      reassessmentNote: 'Every 3 months with prescriber',
      timeToEffect: [
        { phase: 'Week 1–4', description: 'Reduced appetite' },
        { phase: 'Week 4–12', description: 'Measurable weight loss' },
        { phase: 'Week 12+', description: 'Significant body composition changes' },
      ],
      primaryOutcomes: [
        { outcome: 'Body composition', confidence: 'high' },
        { outcome: 'Inflammation', confidence: 'medium' },
      ],
      stopSignals: ['Severe nausea not improving with dose adjustment', 'Signs of pancreatitis (severe abdominal pain)', 'Gallbladder symptoms'],
    },
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
    guidance: {
      cycleType: 'cycled',
      cycleLengthWeeks: { min: 8, max: 12 },
      offCycleLengthWeeks: { min: 4, max: 4 },
      reassessment: 'end_of_cycle',
      timeToEffect: [
        { phase: 'Week 2–4', description: 'Metabolic changes' },
        { phase: 'Week 4–8', description: 'Body composition changes' },
        { phase: 'Week 8–12', description: 'Cumulative effects' },
      ],
      primaryOutcomes: [
        { outcome: 'Body composition', confidence: 'medium' },
        { outcome: 'Inflammation', confidence: 'low' },
      ],
      stopSignals: ['No body composition changes after 8 weeks', 'GI discomfort'],
    },
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
    guidance: {
      cycleType: 'cycled',
      cycleLengthWeeks: { min: 8, max: 12 },
      offCycleLengthWeeks: { min: 4, max: 4 },
      reassessment: 'end_of_cycle',
      timeToEffect: [
        { phase: 'Week 1–2', description: 'Energy improvements' },
        { phase: 'Week 4–8', description: 'Metabolic effects' },
        { phase: 'Week 8–12', description: 'Body composition changes' },
      ],
      primaryOutcomes: [
        { outcome: 'Body composition', confidence: 'medium' },
        { outcome: 'Recovery', confidence: 'low' },
      ],
      stopSignals: ['No energy or metabolic improvement after 6 weeks', 'Injection site reactions'],
    },
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
    guidance: {
      cycleType: 'cycled',
      cycleLengthWeeks: { min: 4, max: 8 },
      offCycleLengthWeeks: { min: 4, max: 8 },
      reassessment: 'end_of_cycle',
      timeToEffect: [
        { phase: 'Week 2–4', description: 'Reduced joint discomfort' },
        { phase: 'Week 4–6', description: 'Improved mobility' },
        { phase: 'Week 6–8', description: 'Cartilage support' },
      ],
      primaryOutcomes: [
        { outcome: 'Recovery', confidence: 'medium' },
        { outcome: 'Inflammation', confidence: 'medium' },
      ],
      stopSignals: ['No joint improvement after 6 weeks', 'Unusual bruising', 'GI discomfort'],
    },
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
    guidance: {
      cycleType: 'cycled',
      cycleLengthWeeks: { min: 4, max: 8 },
      offCycleLengthWeeks: { min: 4, max: 4 },
      reassessment: 'end_of_cycle',
      timeToEffect: [
        { phase: 'Week 1–2', description: 'Gut comfort' },
        { phase: 'Week 3–4', description: 'Inflammation reduction' },
        { phase: 'Week 5–8', description: 'Sustained effects' },
      ],
      primaryOutcomes: [
        { outcome: 'Inflammation', confidence: 'high' },
        { outcome: 'Recovery', confidence: 'medium' },
      ],
      stopSignals: ['No GI improvement after 4 weeks', 'Symptoms worsen'],
    },
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
    guidance: {
      cycleType: 'cycled',
      cycleLengthWeeks: { min: 4, max: 8 },
      offCycleLengthWeeks: { min: 4, max: 4 },
      reassessment: 'end_of_cycle',
      timeToEffect: [
        { phase: 'Week 1–2', description: 'Gut barrier support' },
        { phase: 'Week 3–4', description: 'Reduced permeability symptoms' },
        { phase: 'Week 5–8', description: 'Sustained effects' },
      ],
      primaryOutcomes: [
        { outcome: 'Gut health', confidence: 'medium' },
        { outcome: 'Inflammation', confidence: 'low' },
      ],
      stopSignals: ['No GI improvement after 4 weeks', 'New digestive symptoms'],
    },
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
    guidance: {
      cycleType: 'cycled',
      cycleLengthWeeks: { min: 2, max: 4 },
      offCycleLengthWeeks: { min: 2, max: 4 },
      reassessment: 'end_of_cycle',
      timeToEffect: [
        { phase: 'Night 1–3', description: 'Sleep onset changes' },
        { phase: 'Week 1–2', description: 'Sleep architecture improvement' },
        { phase: 'Week 2–4', description: 'Sustained effects' },
      ],
      primaryOutcomes: [
        { outcome: 'Sleep', confidence: 'medium' },
      ],
      stopSignals: ['No sleep improvement after 2 weeks', 'Morning grogginess', 'Tolerance development'],
    },
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
    guidance: {
      cycleType: 'cycled',
      cycleLengthWeeks: { min: 4, max: 8 },
      offCycleLengthWeeks: { min: 4, max: 8 },
      reassessment: 'end_of_cycle',
      timeToEffect: [
        { phase: 'Week 1–2', description: 'Subtle cognitive changes' },
        { phase: 'Week 3–4', description: 'Memory or focus improvement' },
        { phase: 'Week 5–8', description: 'Cumulative effects' },
      ],
      primaryOutcomes: [
        { outcome: 'Cognition', confidence: 'low' },
      ],
      stopSignals: ['No cognitive improvement after 4 weeks', 'Headaches or overstimulation', 'Mood changes'],
    },
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
    guidance: {
      cycleType: 'cycled',
      cycleLengthWeeks: { min: 4, max: 8 },
      offCycleLengthWeeks: { min: 4, max: 8 },
      reassessment: 'end_of_cycle',
      timeToEffect: [
        { phase: 'Week 1–2', description: 'Subtle cognitive changes' },
        { phase: 'Week 3–4', description: 'Memory or focus improvement' },
        { phase: 'Week 5–8', description: 'Cumulative effects' },
      ],
      primaryOutcomes: [
        { outcome: 'Cognition', confidence: 'low' },
      ],
      stopSignals: ['No cognitive improvement after 4 weeks', 'Headaches or overstimulation', 'Mood changes'],
    },
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
    guidance: {
      cycleType: 'cycled',
      cycleLengthWeeks: { min: 4, max: 8 },
      offCycleLengthWeeks: { min: 4, max: 8 },
      reassessment: 'end_of_cycle',
      timeToEffect: [
        { phase: 'Week 1–2', description: 'Subtle cognitive changes' },
        { phase: 'Week 3–4', description: 'Memory or focus improvement' },
        { phase: 'Week 5–8', description: 'Cumulative effects' },
      ],
      primaryOutcomes: [
        { outcome: 'Cognition', confidence: 'low' },
      ],
      stopSignals: ['No cognitive improvement after 4 weeks', 'Headaches or overstimulation', 'Mood changes'],
    },
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
    guidance: {
      cycleType: 'cycled',
      cycleLengthWeeks: { min: 4, max: 8 },
      offCycleLengthWeeks: { min: 4, max: 8 },
      reassessment: 'end_of_cycle',
      timeToEffect: [
        { phase: 'Week 1–2', description: 'Subtle cognitive changes' },
        { phase: 'Week 3–4', description: 'Memory or focus improvement' },
        { phase: 'Week 5–8', description: 'Cumulative effects' },
      ],
      primaryOutcomes: [
        { outcome: 'Cognition', confidence: 'medium' },
      ],
      stopSignals: ['No cognitive improvement after 4 weeks', 'Headaches or overstimulation', 'Mood changes'],
    },
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
    guidance: {
      cycleType: 'cycled',
      cycleLengthWeeks: { min: 4, max: 8 },
      offCycleLengthWeeks: { min: 4, max: 8 },
      reassessment: 'end_of_cycle',
      timeToEffect: [
        { phase: 'Week 1–2', description: 'Subtle cognitive changes' },
        { phase: 'Week 3–4', description: 'Memory or focus improvement' },
        { phase: 'Week 5–8', description: 'Cumulative effects' },
      ],
      primaryOutcomes: [
        { outcome: 'Cognition', confidence: 'low' },
      ],
      stopSignals: ['No cognitive improvement after 4 weeks', 'Headaches or overstimulation', 'Mood changes'],
    },
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
    guidance: {
      cycleType: 'cycled',
      cycleLengthWeeks: { min: 2, max: 4 },
      offCycleLengthWeeks: { min: 2, max: 4 },
      reassessment: 'end_of_cycle',
      timeToEffect: [
        { phase: 'Day 1–3', description: 'Anxiolytic onset' },
        { phase: 'Week 1–2', description: 'Cognitive clarity' },
        { phase: 'Week 2–4', description: 'Sustained mood effects' },
      ],
      primaryOutcomes: [
        { outcome: 'Cognition', confidence: 'medium' },
        { outcome: 'Mood', confidence: 'medium' },
      ],
      stopSignals: ['No anxiety reduction after 2 weeks', 'Excessive sedation', 'Headaches'],
    },
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
    guidance: {
      cycleType: 'cycled',
      cycleLengthWeeks: { min: 2, max: 4 },
      offCycleLengthWeeks: { min: 2, max: 4 },
      reassessment: 'end_of_cycle',
      timeToEffect: [
        { phase: 'Day 1–3', description: 'Focus improvement' },
        { phase: 'Week 1–2', description: 'Cognitive enhancement' },
        { phase: 'Week 2–4', description: 'Sustained effects' },
      ],
      primaryOutcomes: [
        { outcome: 'Cognition', confidence: 'medium' },
      ],
      stopSignals: ['No cognitive improvement after 2 weeks', 'Irritability or overstimulation', 'Headaches'],
    },
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
    guidance: {
      cycleType: 'cycled',
      cycleLengthWeeks: { min: 1, max: 2 },
      offCycleLengthWeeks: { min: 16, max: 24 },
      reassessment: 'periodic',
      reassessmentNote: 'Every 4–6 months',
      timeToEffect: [
        { phase: 'Day 1–5', description: 'Immune priming' },
        { phase: 'Week 1–2', description: 'Immune modulation' },
      ],
      primaryOutcomes: [
        { outcome: 'Immune function', confidence: 'medium' },
      ],
      stopSignals: ['Autoimmune flare', 'No change in illness frequency over 6 months'],
    },
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
    guidance: {
      cycleType: 'cycled',
      cycleLengthWeeks: { min: 4, max: 8 },
      offCycleLengthWeeks: { min: 4, max: 4 },
      reassessment: 'end_of_cycle',
      timeToEffect: [
        { phase: 'Week 1–2', description: 'Subtle energy changes' },
        { phase: 'Week 3–4', description: 'Mitochondrial support' },
        { phase: 'Week 5–8', description: 'Cumulative effects' },
      ],
      primaryOutcomes: [
        { outcome: 'Recovery', confidence: 'low' },
        { outcome: 'Energy', confidence: 'low' },
      ],
      stopSignals: ['No energy improvement after 4 weeks', 'Injection site reactions'],
    },
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
    guidance: {
      cycleType: 'cycled',
      cycleLengthWeeks: { min: 4, max: 8 },
      offCycleLengthWeeks: { min: 4, max: 4 },
      reassessment: 'end_of_cycle',
      timeToEffect: [
        { phase: 'Week 1–2', description: 'Subtle energy changes' },
        { phase: 'Week 3–4', description: 'Mitochondrial support' },
        { phase: 'Week 5–8', description: 'Cumulative effects' },
      ],
      primaryOutcomes: [
        { outcome: 'Recovery', confidence: 'low' },
        { outcome: 'Energy', confidence: 'low' },
      ],
      stopSignals: ['No energy improvement after 4 weeks', 'Injection site reactions'],
    },
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
    guidance: {
      cycleType: 'pulse',
      reassessment: 'symptom_driven',
      reassessmentNote: 'Monitor hormone levels',
      timeToEffect: [
        { phase: '1–2 hours', description: 'Acute hormonal response' },
        { phase: 'Week 1–2', description: 'Sustained effects with repeated use' },
      ],
      primaryOutcomes: [
        { outcome: 'Hormone regulation', confidence: 'medium' },
      ],
      stopSignals: ['Hormone panel changes outside target range', 'Mood instability'],
    },
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
    guidance: {
      cycleType: 'cycled',
      cycleLengthWeeks: { min: 8, max: 12 },
      offCycleLengthWeeks: { min: 4, max: 4 },
      reassessment: 'periodic',
      reassessmentNote: 'Check testosterone and LH levels at 8 weeks',
      timeToEffect: [
        { phase: 'Week 2–4', description: 'Hormonal stimulation' },
        { phase: 'Week 4–8', description: 'Testosterone support' },
        { phase: 'Week 8–12', description: 'Stabilization' },
      ],
      primaryOutcomes: [
        { outcome: 'Hormone regulation', confidence: 'medium' },
        { outcome: 'Recovery', confidence: 'low' },
      ],
      stopSignals: ['No testosterone improvement on lab work', 'Mood changes', 'Testicular discomfort'],
    },
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
    guidance: {
      cycleType: 'cycled',
      cycleLengthWeeks: { min: 12, max: 24 },
      offCycleLengthWeeks: { min: 4, max: 8 },
      reassessment: 'periodic',
      reassessmentNote: 'Every 3 months',
      timeToEffect: [
        { phase: 'Week 4–8', description: 'Reduced shedding' },
        { phase: 'Week 8–16', description: 'Early regrowth' },
        { phase: 'Week 16–24', description: 'Visible improvement' },
      ],
      primaryOutcomes: [
        { outcome: 'Cosmetic', confidence: 'medium' },
      ],
      stopSignals: ['No reduction in shedding after 12 weeks', 'Scalp irritation'],
    },
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
    guidance: {
      cycleType: 'cycled',
      cycleLengthWeeks: { min: 12, max: 24 },
      offCycleLengthWeeks: { min: 4, max: 8 },
      reassessment: 'periodic',
      reassessmentNote: 'Every 3 months',
      timeToEffect: [
        { phase: 'Week 4–8', description: 'Reduced shedding' },
        { phase: 'Week 8–16', description: 'Early regrowth' },
        { phase: 'Week 16–24', description: 'Visible improvement' },
      ],
      primaryOutcomes: [
        { outcome: 'Cosmetic', confidence: 'medium' },
      ],
      stopSignals: ['No reduction in shedding after 12 weeks', 'Scalp irritation'],
    },
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
    guidance: {
      cycleType: 'cycled',
      cycleLengthWeeks: { min: 4, max: 8 },
      offCycleLengthWeeks: { min: 8, max: 8 },
      reassessment: 'end_of_cycle',
      timeToEffect: [
        { phase: 'Week 1–2', description: 'Subtle changes' },
        { phase: 'Week 3–6', description: 'Strength and fullness' },
        { phase: 'Week 6–8', description: 'Measurable effects' },
      ],
      primaryOutcomes: [
        { outcome: 'Body composition', confidence: 'medium' },
        { outcome: 'Recovery', confidence: 'low' },
      ],
      stopSignals: ['No strength changes after 6 weeks', 'Unusual fatigue'],
    },
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
    guidance: {
      cycleType: 'cycled',
      cycleLengthWeeks: { min: 4, max: 8 },
      offCycleLengthWeeks: { min: 8, max: 8 },
      reassessment: 'end_of_cycle',
      timeToEffect: [
        { phase: 'Week 1–2', description: 'Subtle changes' },
        { phase: 'Week 3–6', description: 'Strength and fullness' },
        { phase: 'Week 6–8', description: 'Measurable effects' },
      ],
      primaryOutcomes: [
        { outcome: 'Body composition', confidence: 'medium' },
        { outcome: 'Recovery', confidence: 'low' },
      ],
      stopSignals: ['No strength changes after 6 weeks', 'Unusual fatigue'],
    },
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
    guidance: {
      cycleType: 'cycled',
      cycleLengthWeeks: { min: 4, max: 8 },
      offCycleLengthWeeks: { min: 4, max: 4 },
      reassessment: 'symptom_driven',
      timeToEffect: [
        { phase: 'Week 1–2', description: 'Neuromodulatory onset' },
        { phase: 'Week 3–4', description: 'Immune regulation' },
        { phase: 'Week 5–8', description: 'Sustained effects' },
      ],
      primaryOutcomes: [
        { outcome: 'Immune function', confidence: 'medium' },
        { outcome: 'Inflammation', confidence: 'medium' },
      ],
      stopSignals: ['No symptom improvement after 4 weeks', 'Blood pressure changes', 'GI discomfort'],
    },
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
