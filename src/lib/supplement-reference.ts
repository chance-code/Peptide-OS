// Supplement Reference Database
// Common supplements with benefit-focused labels

import type { CycleGuidance } from './peptide-reference'

export interface SupplementReference {
  name: string
  aliases?: string[]
  benefit: string  // Short benefit label like "Sleep & Calm" or "Brain & Focus"
  guidance?: CycleGuidance
}

export const SUPPLEMENT_REFERENCE: SupplementReference[] = [
  // Vitamins
  {
    name: 'Vitamin D',
    aliases: ['Vitamin D3', 'D3', 'Cholecalciferol'],
    benefit: 'Immune & Bone',
    guidance: {
      cycleType: 'continuous',
      reassessment: 'periodic',
      reassessmentNote: 'Every 3–6 months with labs',
      timeToEffect: [
        { phase: 'Week 1–4', description: 'Serum levels begin rising' },
        { phase: 'Week 4–8', description: 'Immune and energy improvements possible' },
        { phase: 'Week 8–12', description: 'Bone and mood benefits more likely' },
      ],
      primaryOutcomes: [
        { outcome: 'Inflammation', confidence: 'medium' },
        { outcome: 'Recovery', confidence: 'medium' },
        { outcome: 'Sleep', confidence: 'low' },
      ],
      stopSignals: ['Elevated serum calcium', 'Kidney symptoms', 'Serum 25(OH)D consistently above 80 ng/mL'],
    },
  },
  { name: 'Vitamin D3', aliases: ['D3', 'Cholecalciferol'], benefit: 'Immune & Bone' },
  { name: 'Vitamin B12', aliases: ['B12', 'Cobalamin', 'Methylcobalamin'], benefit: 'Energy & Nerves' },
  { name: 'Vitamin C', aliases: ['Ascorbic Acid'], benefit: 'Immune & Skin' },
  { name: 'Vitamin K2', aliases: ['K2', 'MK-7', 'Menaquinone'], benefit: 'Bone & Heart' },
  { name: 'Vitamin B Complex', aliases: ['B Complex', 'B-Complex'], benefit: 'Energy & Mood' },
  { name: 'Vitamin E', aliases: ['Tocopherol'], benefit: 'Skin & Antioxidant' },
  { name: 'Vitamin A', aliases: ['Retinol'], benefit: 'Vision & Skin' },
  { name: 'Multivitamin', aliases: ['Multi', 'MVI'], benefit: 'General Health' },
  { name: 'Folate', aliases: ['Folic Acid', 'Methylfolate', 'B9'], benefit: 'Cell & DNA' },

  // Minerals
  {
    name: 'Magnesium',
    aliases: ['Mag', 'Magnesium Glycinate', 'Magnesium Citrate', 'Magnesium L-Threonate'],
    benefit: 'Sleep & Calm',
    guidance: {
      cycleType: 'continuous',
      reassessment: 'symptom_driven',
      timeToEffect: [
        { phase: 'Week 1', description: 'Sleep quality improvement possible' },
        { phase: 'Week 2–4', description: 'Muscle relaxation and calm more noticeable' },
        { phase: 'Week 4–8', description: 'Consistent benefits if deficiency was present' },
      ],
      primaryOutcomes: [
        { outcome: 'Sleep', confidence: 'high' },
        { outcome: 'Recovery', confidence: 'medium' },
        { outcome: 'Cognition', confidence: 'low' },
      ],
      stopSignals: ['Loose stools or GI distress', 'Excessive drowsiness', 'Low blood pressure symptoms'],
    },
  },
  { name: 'Magnesium Glycinate', aliases: ['Mag Glycinate'], benefit: 'Sleep & Calm' },
  { name: 'Magnesium L-Threonate', aliases: ['Magtein'], benefit: 'Brain & Sleep' },
  { name: 'Zinc', aliases: ['Zinc Picolinate', 'Zinc Citrate'], benefit: 'Immune & Testosterone' },
  { name: 'Iron', aliases: ['Ferrous', 'Iron Bisglycinate'], benefit: 'Energy & Blood' },
  { name: 'Calcium', aliases: ['Calcium Citrate', 'Calcium Carbonate'], benefit: 'Bone & Muscle' },
  { name: 'Potassium', aliases: ['Potassium Citrate'], benefit: 'Heart & Muscle' },
  { name: 'Selenium', aliases: ['Selenomethionine'], benefit: 'Thyroid & Immune' },
  { name: 'Iodine', aliases: ['Potassium Iodide', 'Iodoral'], benefit: 'Thyroid' },
  { name: 'Boron', aliases: [], benefit: 'Testosterone & Bone' },

  // Amino Acids
  { name: 'L-Theanine', aliases: ['Theanine'], benefit: 'Calm & Focus' },
  { name: 'L-Tyrosine', aliases: ['Tyrosine', 'N-Acetyl L-Tyrosine', 'NALT'], benefit: 'Focus & Stress' },
  { name: 'L-Glutamine', aliases: ['Glutamine'], benefit: 'Gut & Recovery' },
  { name: 'L-Carnitine', aliases: ['Carnitine', 'Acetyl-L-Carnitine', 'ALCAR'], benefit: 'Energy & Fat Burn' },
  { name: 'GABA', aliases: ['Gamma-Aminobutyric Acid'], benefit: 'Calm & Sleep' },
  { name: 'Taurine', aliases: [], benefit: 'Heart & Energy' },
  { name: 'Glycine', aliases: [], benefit: 'Sleep & Collagen' },
  {
    name: 'Creatine',
    aliases: ['Creatine Monohydrate'],
    benefit: 'Strength & Brain',
    guidance: {
      cycleType: 'continuous',
      reassessment: 'periodic',
      reassessmentNote: 'Every 12 weeks',
      timeToEffect: [
        { phase: 'Week 1–2', description: 'Muscle saturation begins (loading) or gradual buildup' },
        { phase: 'Week 3–4', description: 'Strength and power output improvements' },
        { phase: 'Week 6–8+', description: 'Body composition and cognitive benefits more likely' },
      ],
      primaryOutcomes: [
        { outcome: 'Recovery', confidence: 'high' },
        { outcome: 'Body composition', confidence: 'high' },
        { outcome: 'Cognition', confidence: 'medium' },
      ],
      stopSignals: ['Persistent GI discomfort or bloating', 'Kidney concerns (consult labs)', 'Significant water retention causing issues'],
    },
  },
  { name: 'BCAAs', aliases: ['Branched Chain Amino Acids'], benefit: 'Muscle Recovery' },
  { name: 'Collagen', aliases: ['Collagen Peptides', 'Hydrolyzed Collagen'], benefit: 'Skin & Joints' },

  // Nootropics
  { name: "Lion's Mane", aliases: ['Lions Mane', 'Hericium erinaceus'], benefit: 'Brain & Nerve' },
  { name: 'Alpha-GPC', aliases: ['Alpha GPC', 'Choline Alfoscerate'], benefit: 'Memory & Focus' },
  { name: 'Bacopa', aliases: ['Bacopa Monnieri'], benefit: 'Memory & Calm' },
  { name: 'Phosphatidylserine', aliases: ['PS'], benefit: 'Memory & Cortisol' },
  { name: 'Citicoline', aliases: ['CDP-Choline'], benefit: 'Brain & Focus' },
  { name: 'Ginkgo Biloba', aliases: ['Ginkgo'], benefit: 'Brain & Circulation' },
  { name: 'Modafinil', aliases: ['Provigil'], benefit: 'Wakefulness' },

  // Adaptogens
  {
    name: 'Ashwagandha',
    aliases: ['KSM-66', 'Sensoril', 'Withania somnifera'],
    benefit: 'Stress & Energy',
    guidance: {
      cycleType: 'cycled',
      cycleLengthWeeks: { min: 8, max: 12 },
      offCycleLengthWeeks: { min: 4, max: 4 },
      reassessment: 'end_of_cycle',
      timeToEffect: [
        { phase: 'Week 1–2', description: 'Subtle stress response changes' },
        { phase: 'Week 3–4', description: 'Noticeable calm and sleep improvements' },
        { phase: 'Week 6–8+', description: 'Cortisol, recovery, and body composition effects' },
      ],
      primaryOutcomes: [
        { outcome: 'Sleep', confidence: 'high' },
        { outcome: 'Recovery', confidence: 'medium' },
        { outcome: 'Body composition', confidence: 'low' },
      ],
      stopSignals: ['Thyroid concerns (can affect TSH)', 'Persistent GI upset', 'Excessive drowsiness or emotional blunting'],
    },
  },
  {
    name: 'Rhodiola',
    aliases: ['Rhodiola Rosea'],
    benefit: 'Energy & Stress',
    guidance: {
      cycleType: 'cycled',
      cycleLengthWeeks: { min: 8, max: 12 },
      offCycleLengthWeeks: { min: 2, max: 4 },
      reassessment: 'end_of_cycle',
      timeToEffect: [
        { phase: 'Week 1', description: 'Acute energy and focus effects possible' },
        { phase: 'Week 2–4', description: 'Sustained stress resilience' },
        { phase: 'Week 6–8+', description: 'Full adaptogenic benefit window' },
      ],
      primaryOutcomes: [
        { outcome: 'Cognition', confidence: 'medium' },
        { outcome: 'Recovery', confidence: 'medium' },
      ],
      stopSignals: ['Overstimulation or jitteriness', 'Insomnia (especially if dosed late)', 'Diminishing subjective returns'],
    },
  },
  {
    name: 'Tongkat Ali',
    aliases: ['Longjack', 'Eurycoma longifolia'],
    benefit: 'Testosterone & Energy',
    guidance: {
      cycleType: 'cycled',
      cycleLengthWeeks: { min: 4, max: 8 },
      offCycleLengthWeeks: { min: 2, max: 4 },
      reassessment: 'end_of_cycle',
      timeToEffect: [
        { phase: 'Week 1–2', description: 'Subtle energy or libido changes' },
        { phase: 'Week 3–4', description: 'More noticeable drive and recovery' },
        { phase: 'Week 6–8', description: 'Hormonal effects more measurable' },
      ],
      primaryOutcomes: [
        { outcome: 'Recovery', confidence: 'medium' },
        { outcome: 'Body composition', confidence: 'medium' },
        { outcome: 'Sleep', confidence: 'low' },
      ],
      stopSignals: ['Irritability or restlessness', 'Insomnia', 'Elevated resting heart rate'],
    },
  },
  { name: 'Maca', aliases: ['Maca Root'], benefit: 'Energy & Libido' },
  { name: 'Cordyceps', aliases: ['Cordyceps Sinensis'], benefit: 'Energy & Endurance' },
  { name: 'Reishi', aliases: ['Ganoderma lucidum'], benefit: 'Immune & Sleep' },
  { name: 'Holy Basil', aliases: ['Tulsi'], benefit: 'Stress & Mood' },
  { name: 'Ginseng', aliases: ['Panax Ginseng', 'Korean Ginseng', 'American Ginseng'], benefit: 'Energy & Vitality' },
  { name: 'Eleuthero', aliases: ['Siberian Ginseng'], benefit: 'Stamina & Stress' },
  { name: 'Shilajit', aliases: [], benefit: 'Energy & Testosterone' },

  // Omegas/Fats
  {
    name: 'Fish Oil',
    aliases: ['Omega-3', 'Omega 3', 'EPA/DHA', 'EPA DHA'],
    benefit: 'Heart & Brain',
    guidance: {
      cycleType: 'continuous',
      reassessment: 'periodic',
      reassessmentNote: 'Every 6 months',
      timeToEffect: [
        { phase: 'Week 1–4', description: 'Subtle or no noticeable changes' },
        { phase: 'Week 4–8', description: 'Inflammation markers may begin improving' },
        { phase: 'Week 8–12', description: 'Lipid panel and joint comfort changes more likely' },
      ],
      primaryOutcomes: [
        { outcome: 'Inflammation', confidence: 'high' },
        { outcome: 'Recovery', confidence: 'medium' },
        { outcome: 'Cognition', confidence: 'low' },
      ],
      stopSignals: ['Persistent fishy taste or GI discomfort', 'Easy bruising or bleeding concerns', 'Allergic reaction'],
    },
  },
  { name: 'Omega-3', aliases: ['Fish Oil', 'EPA/DHA'], benefit: 'Heart & Brain' },
  { name: 'Krill Oil', aliases: [], benefit: 'Heart & Joints' },
  { name: 'Cod Liver Oil', aliases: [], benefit: 'Immune & Joints' },
  { name: 'Flaxseed Oil', aliases: ['Flax Oil'], benefit: 'Heart & Inflammation' },
  { name: 'MCT Oil', aliases: ['Medium Chain Triglycerides'], benefit: 'Energy & Ketones' },

  // Probiotics
  { name: 'Probiotic', aliases: ['Probiotics'], benefit: 'Gut Health' },
  { name: 'Lactobacillus', aliases: [], benefit: 'Gut & Immune' },
  { name: 'Bifidobacterium', aliases: [], benefit: 'Gut & Digestion' },
  { name: 'Saccharomyces', aliases: ['S. Boulardii'], benefit: 'Gut & Travel' },

  // Herbs
  { name: 'Turmeric', aliases: ['Curcumin'], benefit: 'Inflammation & Joints' },
  { name: 'Curcumin', aliases: ['Turmeric Extract'], benefit: 'Inflammation & Brain' },
  {
    name: 'Berberine',
    aliases: [],
    benefit: 'Blood Sugar & Gut',
    guidance: {
      cycleType: 'cycled',
      cycleLengthWeeks: { min: 8, max: 12 },
      offCycleLengthWeeks: { min: 4, max: 4 },
      reassessment: 'end_of_cycle',
      timeToEffect: [
        { phase: 'Week 1–2', description: 'GI adjustment period' },
        { phase: 'Week 3–6', description: 'Blood sugar regulation improvements' },
        { phase: 'Week 8–12', description: 'Lipid and metabolic marker changes more likely' },
      ],
      primaryOutcomes: [
        { outcome: 'Body composition', confidence: 'medium' },
        { outcome: 'Inflammation', confidence: 'medium' },
      ],
      stopSignals: ['Persistent GI distress', 'Hypoglycemia symptoms', 'Liver enzyme concerns (monitor with labs)'],
    },
  },
  { name: 'Milk Thistle', aliases: ['Silymarin'], benefit: 'Liver Detox' },
  { name: 'Saw Palmetto', aliases: [], benefit: 'Prostate' },
  { name: 'Valerian', aliases: ['Valerian Root'], benefit: 'Sleep & Calm' },
  { name: 'Elderberry', aliases: ['Sambucus'], benefit: 'Immune & Cold' },
  { name: 'Echinacea', aliases: [], benefit: 'Immune' },
  { name: 'St. Johns Wort', aliases: ["St John's Wort"], benefit: 'Mood & Depression' },
  { name: 'Ginger', aliases: ['Ginger Root'], benefit: 'Digestion & Nausea' },
  { name: 'Garlic', aliases: ['Aged Garlic', 'Allicin'], benefit: 'Heart & Immune' },
  { name: 'Green Tea Extract', aliases: ['EGCG'], benefit: 'Metabolism & Antioxidant' },

  // Hormones/Hormone Support
  {
    name: 'Enclomiphene',
    aliases: ['Enclomiphene Citrate', 'Androxal'],
    benefit: 'Testosterone & Fertility',
    guidance: {
      cycleType: 'cycled',
      cycleLengthWeeks: { min: 4, max: 12 },
      offCycleLengthWeeks: { min: 4, max: 8 },
      reassessment: 'periodic',
      reassessmentNote: 'Every 4–8 weeks with labs',
      timeToEffect: [
        { phase: 'Week 1–2', description: 'LH and FSH begin rising' },
        { phase: 'Week 3–6', description: 'Testosterone levels respond' },
        { phase: 'Week 8–12', description: 'Full hormonal steady state' },
      ],
      primaryOutcomes: [
        { outcome: 'Recovery', confidence: 'high' },
        { outcome: 'Body composition', confidence: 'medium' },
        { outcome: 'Sleep', confidence: 'low' },
      ],
      stopSignals: ['Vision changes (rare but serious)', 'Mood instability', 'Elevated estrogen symptoms'],
    },
  },
  { name: 'Clomiphene', aliases: ['Clomid', 'Clomiphene Citrate'], benefit: 'Testosterone & Fertility' },
  {
    name: 'DHEA',
    aliases: ['Dehydroepiandrosterone'],
    benefit: 'Hormone Balance',
    guidance: {
      cycleType: 'cycled',
      cycleLengthWeeks: { min: 8, max: 12 },
      offCycleLengthWeeks: { min: 4, max: 8 },
      reassessment: 'periodic',
      reassessmentNote: 'Every 8–12 weeks with labs',
      timeToEffect: [
        { phase: 'Week 1–4', description: 'Subtle or no changes' },
        { phase: 'Week 4–8', description: 'Energy and mood shifts possible' },
        { phase: 'Week 8–12', description: 'Hormonal panel changes more measurable' },
      ],
      primaryOutcomes: [
        { outcome: 'Recovery', confidence: 'medium' },
        { outcome: 'Body composition', confidence: 'low' },
        { outcome: 'Cognition', confidence: 'low' },
      ],
      stopSignals: ['Acne or oily skin', 'Mood changes or irritability', 'Lab values outside expected range'],
    },
  },
  { name: 'Pregnenolone', aliases: [], benefit: 'Hormone & Brain' },
  {
    name: 'Melatonin',
    aliases: [],
    benefit: 'Sleep',
    guidance: {
      cycleType: 'pulse',
      reassessment: 'periodic',
      reassessmentNote: 'Every 4 weeks',
      timeToEffect: [
        { phase: 'Day 1', description: 'Acute sleep onset effect' },
        { phase: 'Week 1–2', description: 'Sleep pattern adjustment' },
        { phase: 'Week 3–4', description: 'Consistent benefit or lack thereof becomes clear' },
      ],
      primaryOutcomes: [
        { outcome: 'Sleep', confidence: 'high' },
        { outcome: 'Recovery', confidence: 'low' },
      ],
      stopSignals: ['Morning grogginess persists', 'Vivid nightmares', 'No effect after 2 weeks', 'Daytime drowsiness'],
    },
  },
  { name: 'DIM', aliases: ['Diindolylmethane'], benefit: 'Estrogen Balance' },

  // Antioxidants & Longevity
  {
    name: 'CoQ10',
    aliases: ['Coenzyme Q10', 'Ubiquinol', 'Ubiquinone'],
    benefit: 'Heart & Energy',
    guidance: {
      cycleType: 'continuous',
      reassessment: 'periodic',
      reassessmentNote: 'Every 3–6 months',
      timeToEffect: [
        { phase: 'Week 2–4', description: 'Subtle energy improvements possible' },
        { phase: 'Week 4–8', description: 'Exercise tolerance and cardiac benefits' },
        { phase: 'Week 8–12', description: 'Consistent benefits if responding' },
      ],
      primaryOutcomes: [
        { outcome: 'Recovery', confidence: 'medium' },
        { outcome: 'Cognition', confidence: 'low' },
      ],
      stopSignals: ['GI discomfort', 'Insomnia if taken late in the day', 'No perceived benefit after 8 weeks'],
    },
  },
  { name: 'Glutathione', aliases: ['GSH', 'Liposomal Glutathione'], benefit: 'Detox & Immune' },
  {
    name: 'NAC',
    aliases: ['N-Acetyl Cysteine', 'N-Acetylcysteine'],
    benefit: 'Detox & Lung',
    guidance: {
      cycleType: 'cycled',
      cycleLengthWeeks: { min: 8, max: 12 },
      offCycleLengthWeeks: { min: 4, max: 4 },
      reassessment: 'periodic',
      reassessmentNote: 'Every 12 weeks',
      timeToEffect: [
        { phase: 'Week 1–2', description: 'Subtle mucus and respiratory changes' },
        { phase: 'Week 3–6', description: 'Mood and respiratory improvements' },
        { phase: 'Week 8–12', description: 'Liver markers and oxidative stress improvements' },
      ],
      primaryOutcomes: [
        { outcome: 'Inflammation', confidence: 'medium' },
        { outcome: 'Recovery', confidence: 'medium' },
        { outcome: 'Cognition', confidence: 'low' },
      ],
      stopSignals: ['GI discomfort', 'Interactions with certain medications', 'No perceived benefit after 8 weeks'],
    },
  },
  { name: 'Resveratrol', aliases: [], benefit: 'Longevity & Heart' },
  { name: 'Quercetin', aliases: [], benefit: 'Immune & Allergy' },
  { name: 'Alpha Lipoic Acid', aliases: ['ALA', 'R-Lipoic Acid'], benefit: 'Blood Sugar & Nerve' },
  { name: 'Astaxanthin', aliases: [], benefit: 'Skin & Eyes' },
  { name: 'PQQ', aliases: ['Pyrroloquinoline Quinone'], benefit: 'Mitochondria & Brain' },
  { name: 'NMN', aliases: ['Nicotinamide Mononucleotide'], benefit: 'Longevity & Energy' },
  { name: 'NR', aliases: ['Nicotinamide Riboside', 'Niagen'], benefit: 'Longevity & Energy' },
  { name: 'NAD+', aliases: ['NAD'], benefit: 'Longevity & Cellular' },
]

// Helper to find supplement benefit
export function getSupplementBenefit(name: string): string | null {
  const normalizedName = name.toLowerCase().trim()

  for (const supp of SUPPLEMENT_REFERENCE) {
    if (supp.name.toLowerCase() === normalizedName) {
      return supp.benefit
    }
    if (supp.aliases?.some(a => a.toLowerCase() === normalizedName)) {
      return supp.benefit
    }
    // Partial match
    if (normalizedName.includes(supp.name.toLowerCase()) ||
        supp.name.toLowerCase().includes(normalizedName)) {
      return supp.benefit
    }
    if (supp.aliases?.some(a =>
        normalizedName.includes(a.toLowerCase()) ||
        a.toLowerCase().includes(normalizedName)
    )) {
      return supp.benefit
    }
  }

  return null
}
