// Supplement Reference Database
// Common supplements with categories for display

export type SupplementCategory =
  | 'vitamin'
  | 'mineral'
  | 'amino-acid'
  | 'nootropic'
  | 'adaptogen'
  | 'omega'
  | 'probiotic'
  | 'herb'
  | 'hormone'
  | 'antioxidant'
  | 'other'

export interface SupplementReference {
  name: string
  aliases?: string[]
  category: SupplementCategory
}

export const SUPPLEMENT_REFERENCE: SupplementReference[] = [
  // Vitamins
  { name: 'Vitamin D', aliases: ['Vitamin D3', 'D3', 'Cholecalciferol'], category: 'vitamin' },
  { name: 'Vitamin D3', aliases: ['D3', 'Cholecalciferol'], category: 'vitamin' },
  { name: 'Vitamin B12', aliases: ['B12', 'Cobalamin', 'Methylcobalamin'], category: 'vitamin' },
  { name: 'Vitamin C', aliases: ['Ascorbic Acid'], category: 'vitamin' },
  { name: 'Vitamin K2', aliases: ['K2', 'MK-7', 'Menaquinone'], category: 'vitamin' },
  { name: 'Vitamin B Complex', aliases: ['B Complex', 'B-Complex'], category: 'vitamin' },
  { name: 'Vitamin E', aliases: ['Tocopherol'], category: 'vitamin' },
  { name: 'Vitamin A', aliases: ['Retinol'], category: 'vitamin' },
  { name: 'Multivitamin', aliases: ['Multi', 'MVI'], category: 'vitamin' },

  // Minerals
  { name: 'Magnesium', aliases: ['Mag', 'Magnesium Glycinate', 'Magnesium Citrate', 'Magnesium L-Threonate'], category: 'mineral' },
  { name: 'Magnesium Glycinate', aliases: ['Mag Glycinate'], category: 'mineral' },
  { name: 'Magnesium L-Threonate', aliases: ['Magtein'], category: 'mineral' },
  { name: 'Zinc', aliases: ['Zinc Picolinate', 'Zinc Citrate'], category: 'mineral' },
  { name: 'Iron', aliases: ['Ferrous', 'Iron Bisglycinate'], category: 'mineral' },
  { name: 'Calcium', aliases: ['Calcium Citrate', 'Calcium Carbonate'], category: 'mineral' },
  { name: 'Potassium', aliases: ['Potassium Citrate'], category: 'mineral' },
  { name: 'Selenium', aliases: ['Selenomethionine'], category: 'mineral' },
  { name: 'Iodine', aliases: ['Potassium Iodide', 'Iodoral'], category: 'mineral' },
  { name: 'Boron', aliases: [], category: 'mineral' },

  // Amino Acids
  { name: 'L-Theanine', aliases: ['Theanine'], category: 'amino-acid' },
  { name: 'L-Tyrosine', aliases: ['Tyrosine', 'N-Acetyl L-Tyrosine', 'NALT'], category: 'amino-acid' },
  { name: 'L-Glutamine', aliases: ['Glutamine'], category: 'amino-acid' },
  { name: 'L-Carnitine', aliases: ['Carnitine', 'Acetyl-L-Carnitine', 'ALCAR'], category: 'amino-acid' },
  { name: 'GABA', aliases: ['Gamma-Aminobutyric Acid'], category: 'amino-acid' },
  { name: 'Taurine', aliases: [], category: 'amino-acid' },
  { name: 'Glycine', aliases: [], category: 'amino-acid' },
  { name: 'Creatine', aliases: ['Creatine Monohydrate'], category: 'amino-acid' },
  { name: 'BCAAs', aliases: ['Branched Chain Amino Acids'], category: 'amino-acid' },
  { name: 'Collagen', aliases: ['Collagen Peptides', 'Hydrolyzed Collagen'], category: 'amino-acid' },

  // Nootropics
  { name: "Lion's Mane", aliases: ['Lions Mane', 'Hericium erinaceus'], category: 'nootropic' },
  { name: 'Alpha-GPC', aliases: ['Alpha GPC', 'Choline Alfoscerate'], category: 'nootropic' },
  { name: 'Bacopa', aliases: ['Bacopa Monnieri'], category: 'nootropic' },
  { name: 'Phosphatidylserine', aliases: ['PS'], category: 'nootropic' },
  { name: 'Citicoline', aliases: ['CDP-Choline'], category: 'nootropic' },
  { name: 'Ginkgo Biloba', aliases: ['Ginkgo'], category: 'nootropic' },
  { name: 'Modafinil', aliases: ['Provigil'], category: 'nootropic' },
  { name: 'Racetam', aliases: ['Piracetam', 'Aniracetam', 'Phenylpiracetam'], category: 'nootropic' },

  // Adaptogens
  { name: 'Ashwagandha', aliases: ['KSM-66', 'Sensoril', 'Withania somnifera'], category: 'adaptogen' },
  { name: 'Rhodiola', aliases: ['Rhodiola Rosea'], category: 'adaptogen' },
  { name: 'Tongkat Ali', aliases: ['Longjack', 'Eurycoma longifolia'], category: 'adaptogen' },
  { name: 'Maca', aliases: ['Maca Root'], category: 'adaptogen' },
  { name: 'Cordyceps', aliases: ['Cordyceps Sinensis'], category: 'adaptogen' },
  { name: 'Reishi', aliases: ['Ganoderma lucidum'], category: 'adaptogen' },
  { name: 'Holy Basil', aliases: ['Tulsi'], category: 'adaptogen' },
  { name: 'Ginseng', aliases: ['Panax Ginseng', 'Korean Ginseng', 'American Ginseng'], category: 'adaptogen' },
  { name: 'Eleuthero', aliases: ['Siberian Ginseng'], category: 'adaptogen' },
  { name: 'Shilajit', aliases: [], category: 'adaptogen' },

  // Omegas/Fats
  { name: 'Fish Oil', aliases: ['Omega-3', 'Omega 3', 'EPA/DHA', 'EPA DHA'], category: 'omega' },
  { name: 'Omega-3', aliases: ['Fish Oil', 'EPA/DHA'], category: 'omega' },
  { name: 'Krill Oil', aliases: [], category: 'omega' },
  { name: 'Cod Liver Oil', aliases: [], category: 'omega' },
  { name: 'Flaxseed Oil', aliases: ['Flax Oil'], category: 'omega' },
  { name: 'MCT Oil', aliases: ['Medium Chain Triglycerides'], category: 'omega' },

  // Probiotics
  { name: 'Probiotic', aliases: ['Probiotics'], category: 'probiotic' },
  { name: 'Lactobacillus', aliases: [], category: 'probiotic' },
  { name: 'Bifidobacterium', aliases: [], category: 'probiotic' },
  { name: 'Saccharomyces', aliases: ['S. Boulardii'], category: 'probiotic' },

  // Herbs
  { name: 'Turmeric', aliases: ['Curcumin'], category: 'herb' },
  { name: 'Curcumin', aliases: ['Turmeric Extract'], category: 'herb' },
  { name: 'Berberine', aliases: [], category: 'herb' },
  { name: 'Milk Thistle', aliases: ['Silymarin'], category: 'herb' },
  { name: 'Saw Palmetto', aliases: [], category: 'herb' },
  { name: 'Valerian', aliases: ['Valerian Root'], category: 'herb' },
  { name: 'Elderberry', aliases: ['Sambucus'], category: 'herb' },
  { name: 'Echinacea', aliases: [], category: 'herb' },
  { name: 'St. Johns Wort', aliases: ["St John's Wort"], category: 'herb' },
  { name: 'Ginger', aliases: ['Ginger Root'], category: 'herb' },
  { name: 'Garlic', aliases: ['Aged Garlic', 'Allicin'], category: 'herb' },
  { name: 'Green Tea Extract', aliases: ['EGCG'], category: 'herb' },

  // Hormones/Hormone Support
  { name: 'DHEA', aliases: ['Dehydroepiandrosterone'], category: 'hormone' },
  { name: 'Pregnenolone', aliases: [], category: 'hormone' },
  { name: 'Melatonin', aliases: [], category: 'hormone' },
  { name: 'DIM', aliases: ['Diindolylmethane'], category: 'hormone' },
  { name: 'Boron', aliases: [], category: 'hormone' },

  // Antioxidants
  { name: 'CoQ10', aliases: ['Coenzyme Q10', 'Ubiquinol', 'Ubiquinone'], category: 'antioxidant' },
  { name: 'Glutathione', aliases: ['GSH', 'Liposomal Glutathione'], category: 'antioxidant' },
  { name: 'NAC', aliases: ['N-Acetyl Cysteine', 'N-Acetylcysteine'], category: 'antioxidant' },
  { name: 'Resveratrol', aliases: [], category: 'antioxidant' },
  { name: 'Quercetin', aliases: [], category: 'antioxidant' },
  { name: 'Alpha Lipoic Acid', aliases: ['ALA', 'R-Lipoic Acid'], category: 'antioxidant' },
  { name: 'Astaxanthin', aliases: [], category: 'antioxidant' },
  { name: 'PQQ', aliases: ['Pyrroloquinoline Quinone'], category: 'antioxidant' },
  { name: 'NMN', aliases: ['Nicotinamide Mononucleotide'], category: 'antioxidant' },
  { name: 'NR', aliases: ['Nicotinamide Riboside', 'Niagen'], category: 'antioxidant' },
  { name: 'NAD+', aliases: ['NAD'], category: 'antioxidant' },
]

// Helper to find supplement category
export function getSupplementCategory(name: string): SupplementCategory {
  const normalizedName = name.toLowerCase().trim()

  for (const supp of SUPPLEMENT_REFERENCE) {
    if (supp.name.toLowerCase() === normalizedName) {
      return supp.category
    }
    if (supp.aliases?.some(a => a.toLowerCase() === normalizedName)) {
      return supp.category
    }
    // Partial match - if the supplement name contains or is contained in the search
    if (normalizedName.includes(supp.name.toLowerCase()) ||
        supp.name.toLowerCase().includes(normalizedName)) {
      return supp.category
    }
    // Check aliases for partial matches
    if (supp.aliases?.some(a =>
        normalizedName.includes(a.toLowerCase()) ||
        a.toLowerCase().includes(normalizedName)
    )) {
      return supp.category
    }
  }

  return 'other'
}
