// Supplement Reference Database
// Common supplements with benefit-focused labels

export interface SupplementReference {
  name: string
  aliases?: string[]
  benefit: string  // Short benefit label like "Sleep & Calm" or "Brain & Focus"
}

export const SUPPLEMENT_REFERENCE: SupplementReference[] = [
  // Vitamins
  { name: 'Vitamin D', aliases: ['Vitamin D3', 'D3', 'Cholecalciferol'], benefit: 'Immune & Bone' },
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
  { name: 'Magnesium', aliases: ['Mag', 'Magnesium Glycinate', 'Magnesium Citrate', 'Magnesium L-Threonate'], benefit: 'Sleep & Calm' },
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
  { name: 'Creatine', aliases: ['Creatine Monohydrate'], benefit: 'Strength & Brain' },
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
  { name: 'Ashwagandha', aliases: ['KSM-66', 'Sensoril', 'Withania somnifera'], benefit: 'Stress & Energy' },
  { name: 'Rhodiola', aliases: ['Rhodiola Rosea'], benefit: 'Energy & Stress' },
  { name: 'Tongkat Ali', aliases: ['Longjack', 'Eurycoma longifolia'], benefit: 'Testosterone & Energy' },
  { name: 'Maca', aliases: ['Maca Root'], benefit: 'Energy & Libido' },
  { name: 'Cordyceps', aliases: ['Cordyceps Sinensis'], benefit: 'Energy & Endurance' },
  { name: 'Reishi', aliases: ['Ganoderma lucidum'], benefit: 'Immune & Sleep' },
  { name: 'Holy Basil', aliases: ['Tulsi'], benefit: 'Stress & Mood' },
  { name: 'Ginseng', aliases: ['Panax Ginseng', 'Korean Ginseng', 'American Ginseng'], benefit: 'Energy & Vitality' },
  { name: 'Eleuthero', aliases: ['Siberian Ginseng'], benefit: 'Stamina & Stress' },
  { name: 'Shilajit', aliases: [], benefit: 'Energy & Testosterone' },

  // Omegas/Fats
  { name: 'Fish Oil', aliases: ['Omega-3', 'Omega 3', 'EPA/DHA', 'EPA DHA'], benefit: 'Heart & Brain' },
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
  { name: 'Berberine', aliases: [], benefit: 'Blood Sugar & Gut' },
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
  { name: 'DHEA', aliases: ['Dehydroepiandrosterone'], benefit: 'Hormone Balance' },
  { name: 'Pregnenolone', aliases: [], benefit: 'Hormone & Brain' },
  { name: 'Melatonin', aliases: [], benefit: 'Sleep' },
  { name: 'DIM', aliases: ['Diindolylmethane'], benefit: 'Estrogen Balance' },

  // Antioxidants & Longevity
  { name: 'CoQ10', aliases: ['Coenzyme Q10', 'Ubiquinol', 'Ubiquinone'], benefit: 'Heart & Energy' },
  { name: 'Glutathione', aliases: ['GSH', 'Liposomal Glutathione'], benefit: 'Detox & Immune' },
  { name: 'NAC', aliases: ['N-Acetyl Cysteine', 'N-Acetylcysteine'], benefit: 'Detox & Lung' },
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
