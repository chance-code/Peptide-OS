// Vial label scan — prompt + result normalization for POST /api/inventory/scan
//
// The vision model returns loosely-typed JSON. Everything here is pure so the
// alias handling and compounded-vial math can be unit tested without OpenAI.

export type ScanConfidence = 'high' | 'medium' | 'low'

export interface ScanIngredient {
  name: string
  /** Concentration (e.g. 25 for "25 mg/mL") or absolute amount for dry vials */
  amount: number | null
  /** 'mg/mL', 'mcg/mL', 'mg', 'mcg', 'IU', ... exactly as printed */
  unit: string | null
}

export interface VialScanResult {
  /** Canonical name used to match a Peptide row (single peptide, blend, or compound) */
  peptideName: string | null
  /** Product name as printed on the label, before alias normalization */
  productName: string | null
  /** Total amount of the primary ingredient in the vial */
  amount: number | null
  unit: string | null
  /** Every ingredient on a compounded / blended label (empty for single peptides) */
  ingredients: ScanIngredient[]
  /** Liquid volume for pre-mixed vials (e.g. 2 for "2 mL") */
  volumeMl: number | null
  /** True when the vial is supplied as a ready-to-inject solution (no reconstitution) */
  isPreMixed: boolean
  manufacturer: string | null
  lotNumber: string | null
  expirationDate: string | null
  confidence: ScanConfidence
  rawText: string | null
}

// ---------------------------------------------------------------------------
// Aliases — canonical name → label spellings we've seen (compared after
// stripping case + punctuation, so 'MOTS-C', 'motsc', 'MOT C' all collapse).
// ---------------------------------------------------------------------------

export const COMPOUNDED_MG_TAURATE_NAME = 'Magnesium Taurate + B6 + Glycine (Compounded)'

const SCAN_NAME_ALIASES: Record<string, string[]> = {
  'MOTS-c': ['MOTS-c', 'MOTS-C', 'MOTSc', 'MOTS c', 'MOTC', 'MOT-C', 'MOTS'],
  'KLOW': ['KLOW', 'KLOW Blend', 'KLOW Peptide Blend', 'K.L.O.W.'],
  'GLOW': ['GLOW', 'GLOW Blend', 'GLOW Peptide Blend'],
  'KPV': ['KPV', 'Lys-Pro-Val'],
  'BPC-157': ['BPC-157', 'BPC157', 'BPC 157', 'Body Protection Compound'],
  'TB-500': ['TB-500', 'TB500', 'TB 500', 'Thymosin Beta-4', 'Thymosin Beta 4'],
  'GHK-Cu': ['GHK-Cu', 'GHKCu', 'GHK Cu', 'Copper Peptide'],
  'NAD+': ['NAD+', 'NAD', 'NAD Plus', 'Nicotinamide Adenine Dinucleotide'],
  [COMPOUNDED_MG_TAURATE_NAME]: [
    'Magnesium Taurate B6 Glycine',
    'Magnesium Taurate / B6 / Glycine',
    'Mag Taurate B6 Glycine',
    'Mg Taurate B6 Glycine',
    'Taurate B6 Glycine',
    'Magnesium Taurate Pyridoxine Glycine',
  ],
}

/** Lowercase alphanumerics only — the comparison key for names and aliases. */
export function scanKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '')
}

const ALIAS_LOOKUP: Map<string, string> = new Map()
for (const [canonical, aliases] of Object.entries(SCAN_NAME_ALIASES)) {
  ALIAS_LOOKUP.set(scanKey(canonical), canonical)
  for (const alias of aliases) ALIAS_LOOKUP.set(scanKey(alias), canonical)
}

/**
 * Map a label spelling to its canonical peptide name, or null when unknown.
 * 'MOTC' → 'MOTS-c', 'klow blend' → 'KLOW'. Unknown names are left to the caller.
 */
export function normalizeScannedPeptideName(name: string | null | undefined): string | null {
  if (!name) return null
  const key = scanKey(name)
  if (!key) return null
  return ALIAS_LOOKUP.get(key) ?? null
}

// ---------------------------------------------------------------------------
// Compounded / blended vials — infer the product from its ingredient list when
// the label has no single product name.
// ---------------------------------------------------------------------------

interface CompoundSignature {
  name: string
  /** Each entry is a list of accepted spellings for one required ingredient */
  ingredients: string[][]
}

const COMPOUND_SIGNATURES: CompoundSignature[] = [
  {
    name: COMPOUNDED_MG_TAURATE_NAME,
    ingredients: [
      ['magnesium taurate', 'mag taurate', 'mg taurate', 'taurate'],
      ['b6', 'vitamin b6', 'pyridoxine', 'pyridoxine hcl', 'p5p', 'pyridoxal 5 phosphate'],
      ['glycine'],
    ],
  },
  {
    name: 'KLOW',
    ingredients: [['kpv'], ['ghk-cu', 'ghk cu', 'copper peptide'], ['bpc-157', 'bpc157'], ['tb-500', 'tb500', 'thymosin beta-4']],
  },
  {
    name: 'GLOW',
    ingredients: [['ghk-cu', 'ghk cu', 'copper peptide'], ['bpc-157', 'bpc157'], ['tb-500', 'tb500', 'thymosin beta-4']],
  },
]

function ingredientMatches(ingredient: ScanIngredient, spellings: string[]): boolean {
  const key = scanKey(ingredient.name)
  return spellings.some((s) => key.includes(scanKey(s)))
}

/** Name a multi-ingredient vial from its ingredients. Returns null for single-ingredient lists. */
export function inferCompoundName(ingredients: ScanIngredient[]): string | null {
  if (ingredients.length < 2) return null
  // Most specific signature first (KLOW before GLOW — GLOW is a subset).
  for (const sig of COMPOUND_SIGNATURES) {
    if (sig.ingredients.every((spellings) => ingredients.some((i) => ingredientMatches(i, spellings)))) {
      return sig.name
    }
  }
  return ingredients.map((i) => i.name.trim()).filter(Boolean).join(' + ')
}

// ---------------------------------------------------------------------------
// Coercion helpers — the model is asked for JSON but types drift.
// ---------------------------------------------------------------------------

function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = parseFloat(value.replace(/[^0-9.\-]/g, ''))
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function asString(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length ? trimmed : null
}

function asConfidence(value: unknown): ScanConfidence {
  if (value === 'high' || value === 'medium' || value === 'low') return value
  const n = asNumber(value)
  if (n !== null) return n >= 0.8 ? 'high' : n >= 0.5 ? 'medium' : 'low'
  return 'low'
}

function asIngredients(value: unknown): ScanIngredient[] {
  if (!Array.isArray(value)) return []
  const out: ScanIngredient[] = []
  for (const entry of value) {
    if (!entry || typeof entry !== 'object') continue
    const record = entry as Record<string, unknown>
    const name = asString(record.name)
    if (!name) continue
    out.push({ name, amount: asNumber(record.amount), unit: asString(record.unit) })
  }
  return out
}

/** 'mg/mL' → { base: 'mg', perMl: true }; 'mg' → { base: 'mg', perMl: false } */
function splitUnit(unit: string | null): { base: string | null; perMl: boolean } {
  if (!unit) return { base: null, perMl: false }
  const match = unit.match(/^\s*([a-zA-Z+]+)\s*(?:\/\s*m[lL])?\s*$/)
  if (!match) return { base: unit, perMl: /\/\s*m[lL]/i.test(unit) }
  return { base: match[1], perMl: /\/\s*m[lL]/i.test(unit) }
}

export const EMPTY_SCAN_RESULT: VialScanResult = {
  peptideName: null,
  productName: null,
  amount: null,
  unit: null,
  ingredients: [],
  volumeMl: null,
  isPreMixed: false,
  manufacturer: null,
  lotNumber: null,
  expirationDate: null,
  confidence: 'low',
  rawText: null,
}

/**
 * Turn the model's raw JSON into a well-typed VialScanResult:
 * - canonicalises the name via aliases (MOTC → MOTS-c) or the ingredient list
 * - derives total amount for pre-mixed vials from concentration × volume
 * - coerces every field to the type the iOS client decodes
 */
export function normalizeVialScanResult(raw: unknown): VialScanResult {
  if (!raw || typeof raw !== 'object') return { ...EMPTY_SCAN_RESULT }
  const r = raw as Record<string, unknown>

  const ingredients = asIngredients(r.ingredients)
  const volumeMl = asNumber(r.volumeMl ?? r.volume_ml ?? r.volume)
  const isPreMixed =
    r.isPreMixed === true ||
    ingredients.some((i) => splitUnit(i.unit).perMl) ||
    splitUnit(asString(r.unit)).perMl

  const productName = asString(r.productName) ?? asString(r.peptideName)
  const peptideName =
    normalizeScannedPeptideName(productName) ??
    normalizeScannedPeptideName(asString(r.peptideName)) ??
    inferCompoundName(ingredients) ??
    productName

  let amount = asNumber(r.amount)
  let unit = asString(r.unit)
  const primary = ingredients[0]
  if (primary && primary.amount !== null) {
    const { base, perMl } = splitUnit(primary.unit)
    if (perMl && volumeMl !== null) {
      // Label gives concentration; the vial holds concentration × volume.
      amount = amount ?? Math.round(primary.amount * volumeMl * 1000) / 1000
      unit = unit ?? base
    } else if (!perMl) {
      amount = amount ?? primary.amount
      unit = unit ?? base
    }
  }
  // A concentration unit is never a valid vial unit — collapse 'mg/mL' → 'mg'.
  if (unit) unit = splitUnit(unit).base

  const rawText = asString(r.rawText)
  let confidence = asConfidence(r.confidence)
  // A name the model reports but that does not appear anywhere in the transcribed label text is
  // a likely substitution (e.g. reading "Tirzepatide" off a magnesium taurate vial). Flag it.
  if (rawText && !namesAppearInRawText([productName, ...ingredients.map((i) => i.name)], rawText)) {
    confidence = 'low'
  }

  return {
    peptideName,
    productName,
    amount,
    unit,
    ingredients,
    volumeMl,
    isPreMixed,
    manufacturer: asString(r.manufacturer),
    lotNumber: asString(r.lotNumber),
    expirationDate: asString(r.expirationDate),
    confidence,
    rawText,
  }
}

/** True when every non-empty name has its first word somewhere in the label text (loose OCR tolerance). */
export function namesAppearInRawText(names: (string | null)[], rawText: string): boolean {
  const haystack = scanKey(rawText)
  return names
    .filter((n): n is string => !!n && n.trim().length > 0)
    .every((name) => {
      const firstWord = name.trim().split(/[\s/+,()-]+/)[0] ?? ''
      const key = scanKey(firstWord)
      return key.length < 3 || haystack.includes(key)
    })
}

/** Strip ```json fences and parse; null when the content isn't JSON. */
export function parseScanJson(content: string): unknown | null {
  const clean = content.replace(/```json\n?|\n?```/g, '').trim()
  try {
    return JSON.parse(clean)
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Prompt
// ---------------------------------------------------------------------------

export const VIAL_SCAN_SYSTEM_PROMPT = `You are an expert at reading injectable vial labels: research peptides, peptide blends, and compounded pharmacy injectables. Analyze the image and extract the label information.

There are two kinds of vials:
1. Single-peptide lyophilized (dry powder) vials — one peptide, one total amount (e.g. "BPC-157 10mg").
2. Pre-mixed / compounded solutions — a liquid vial listing one or more ingredients as concentrations (e.g. "25 mg/mL") plus a fill volume (e.g. "2 mL"). Compounding pharmacies print these; blends like KLOW or GLOW may be either dry or pre-mixed.

Common single peptides (case-insensitive, may have variations):
- BPC-157 (BPC157, Body Protection Compound)
- TB-500 (TB500, Thymosin Beta-4)
- Semaglutide (Ozempic, Wegovy)
- Tirzepatide (Mounjaro)
- Retatrutide
- CJC-1295 (with or without DAC)
- Ipamorelin
- Tesamorelin
- Sermorelin
- GHK-Cu (Copper Peptide)
- KPV
- PT-141 (Bremelanotide)
- Melanotan II (MT2)
- AOD-9604
- MOTS-c — labels often abbreviate this as "MOTC", "MOTS-C", or "MOTSc"; always standardize to "MOTS-c"
- SS-31 (Elamipretide)
- Epitalon
- Thymalin
- Selank
- Semax
- DSIP (Delta Sleep Inducing Peptide)
- Kisspeptin
- NAD+
- HGH (Human Growth Hormone, Somatropin)
- IGF-1 (Insulin-like Growth Factor)
- HCG (Human Chorionic Gonadotropin)

Common blends (report the blend name as productName AND list each component in ingredients):
- KLOW (KPV + GHK-Cu + BPC-157 + TB-500)
- GLOW (GHK-Cu + BPC-157 + TB-500)

Common compounded injectable ingredients:
- Magnesium Taurate, Vitamin B6 (Pyridoxine / Pyridoxine HCl), Glycine, Glutathione, Methylcobalamin (B12), NAD+, L-Carnitine, Taurine, Ascorbic Acid (Vitamin C), Zinc

Return ONLY a JSON object with these fields (use null for anything you can't determine):
{
  "productName": "name as printed on the label, or null if the label only lists ingredients",
  "peptideName": "standardized name of the product (single peptide, blend, or compound)",
  "ingredients": [
    { "name": "ingredient as printed", "amount": numeric value only, "unit": "mg/mL" or "mcg/mL" or "mg" or "mcg" or "IU" }
  ],
  "volumeMl": numeric liquid volume in mL for pre-mixed vials, else null,
  "isPreMixed": true if the vial is a ready-to-inject solution, false for dry powder,
  "amount": total amount of the primary (first) ingredient in the vial,
  "unit": "mg" or "mcg" or "IU",
  "manufacturer": "company or pharmacy name if visible",
  "lotNumber": "lot/batch number if visible",
  "expirationDate": "YYYY-MM-DD format if visible",
  "confidence": "high" or "medium" or "low",
  "rawText": "all visible text on the label"
}

Rules:
- Copy ingredient and product names EXACTLY as printed. Never substitute a peptide from the list above for a similar-looking word — if the label says "Magnesium Taurate", report "Magnesium Taurate", not a peptide. The lists above are hints for standardizing spelling, not a menu to choose from.
- Standardize peptide names only when the printed text clearly is that peptide (e.g. "BPC 157" → "BPC-157", "MOTC" → "MOTS-c").
- For single-peptide dry vials, leave ingredients as an empty array and report the total content as amount (not a concentration). Common sizes: 2mg, 5mg, 10mg.
- For compounded / pre-mixed vials, list EVERY ingredient with its concentration exactly as printed (e.g. Magnesium Taurate 25 mg/mL, Pyridoxine 25 mg/mL, Glycine 5 mg/mL), set volumeMl from the fill volume (e.g. "2 mL" → 2), set isPreMixed to true, and set amount = primary ingredient concentration × volumeMl with unit "mg" (25 mg/mL × 2 mL → 50, "mg").
- If unsure about the product, set confidence to "low" and include rawText.
- Return valid JSON only, no markdown formatting.`
