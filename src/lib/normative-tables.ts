// Normative Reference Tables v1.0.0
// Grounded in published clinical norms for competitive Health Capital banding.
//
// Sources:
//   VO2max:             Cooper Institute / ACSM Guidelines (2023)
//   Resting Heart Rate: NCHS / AHA reference values
//   Waist Circumference: CDC/NCHS NHANES percentile tables
//   Body Fat %:         NHANES-based reference distributions
//
// Band mapping:
//   5 ascending thresholds create 6 bands.
//   higher_better → [Very Low, Low, Average, High, Very High, Elite] left to right
//   lower_better  → [Elite, Very High, High, Average, Low, Very Low] left to right

export interface NormativeCutpoints {
  thresholds: [number, number, number, number, number]
}

export interface AgeRow {
  ageRange: [number, number]
  male: NormativeCutpoints
  female: NormativeCutpoints
}

export interface NormativeTable {
  metric: string
  version: string
  source: string
  unit: string
  polarity: 'higher_better' | 'lower_better'
  rows: AgeRow[]
}

export const NORMATIVE_TABLES_VERSION = '1.0.0'

export const NORMATIVE_TABLES: NormativeTable[] = [
  // ── VO2max ──────────────────────────────────────────────────
  {
    metric: 'vo2_max',
    version: '1.0.0',
    source: 'Cooper Institute / ACSM 2023',
    unit: 'mL/kg/min',
    polarity: 'higher_better',
    rows: [
      { ageRange: [20, 29], male: { thresholds: [33, 37, 41, 45, 49] }, female: { thresholds: [24, 28, 33, 37, 41] } },
      { ageRange: [30, 39], male: { thresholds: [31, 35, 39, 43, 48] }, female: { thresholds: [23, 27, 31, 35, 40] } },
      { ageRange: [40, 49], male: { thresholds: [28, 32, 36, 40, 45] }, female: { thresholds: [21, 25, 29, 33, 38] } },
      { ageRange: [50, 59], male: { thresholds: [25, 29, 33, 37, 42] }, female: { thresholds: [19, 23, 27, 31, 36] } },
      { ageRange: [60, 69], male: { thresholds: [22, 26, 30, 34, 39] }, female: { thresholds: [17, 21, 25, 29, 34] } },
      { ageRange: [70, 99], male: { thresholds: [19, 23, 27, 31, 36] }, female: { thresholds: [15, 19, 23, 27, 32] } },
    ],
  },

  // ── Resting Heart Rate ──────────────────────────────────────
  {
    metric: 'resting_heart_rate',
    version: '1.0.0',
    source: 'NCHS / AHA reference',
    unit: 'bpm',
    polarity: 'lower_better',
    rows: [
      { ageRange: [20, 29], male: { thresholds: [50, 55, 62, 68, 76] }, female: { thresholds: [54, 59, 66, 72, 80] } },
      { ageRange: [30, 39], male: { thresholds: [50, 56, 63, 69, 77] }, female: { thresholds: [54, 60, 67, 73, 81] } },
      { ageRange: [40, 49], male: { thresholds: [51, 57, 64, 70, 78] }, female: { thresholds: [55, 61, 68, 74, 82] } },
      { ageRange: [50, 59], male: { thresholds: [52, 58, 65, 72, 80] }, female: { thresholds: [56, 62, 69, 75, 83] } },
      { ageRange: [60, 69], male: { thresholds: [53, 59, 66, 73, 81] }, female: { thresholds: [57, 63, 70, 76, 84] } },
      { ageRange: [70, 99], male: { thresholds: [54, 60, 67, 74, 82] }, female: { thresholds: [58, 64, 71, 77, 85] } },
    ],
  },

  // ── Waist Circumference ─────────────────────────────────────
  {
    metric: 'waist_circumference',
    version: '1.0.0',
    source: 'CDC/NCHS NHANES percentiles',
    unit: 'cm',
    polarity: 'lower_better',
    rows: [
      { ageRange: [20, 29], male: { thresholds: [74, 80, 87, 95, 102] }, female: { thresholds: [62, 68, 74, 80, 88] } },
      { ageRange: [30, 39], male: { thresholds: [78, 84, 91, 99, 107] }, female: { thresholds: [65, 71, 77, 84, 92] } },
      { ageRange: [40, 49], male: { thresholds: [80, 87, 94, 102, 110] }, female: { thresholds: [67, 73, 80, 87, 95] } },
      { ageRange: [50, 59], male: { thresholds: [82, 89, 96, 104, 112] }, female: { thresholds: [69, 76, 83, 90, 98] } },
      { ageRange: [60, 69], male: { thresholds: [84, 91, 98, 106, 114] }, female: { thresholds: [71, 78, 85, 92, 100] } },
      { ageRange: [70, 99], male: { thresholds: [86, 93, 100, 108, 116] }, female: { thresholds: [73, 80, 87, 94, 102] } },
    ],
  },

  // ── Body Fat % ──────────────────────────────────────────────
  {
    metric: 'body_fat_percentage',
    version: '1.0.0',
    source: 'NHANES-based reference',
    unit: '%',
    polarity: 'lower_better',
    rows: [
      { ageRange: [20, 29], male: { thresholds: [8, 12, 17, 22, 28] }, female: { thresholds: [15, 19, 24, 29, 35] } },
      { ageRange: [30, 39], male: { thresholds: [10, 14, 19, 24, 30] }, female: { thresholds: [17, 21, 26, 31, 37] } },
      { ageRange: [40, 49], male: { thresholds: [12, 16, 21, 26, 32] }, female: { thresholds: [19, 23, 28, 33, 39] } },
      { ageRange: [50, 59], male: { thresholds: [14, 18, 23, 28, 34] }, female: { thresholds: [21, 25, 30, 35, 41] } },
      { ageRange: [60, 69], male: { thresholds: [15, 19, 24, 29, 35] }, female: { thresholds: [22, 26, 31, 36, 42] } },
      { ageRange: [70, 99], male: { thresholds: [16, 20, 25, 30, 36] }, female: { thresholds: [23, 27, 32, 37, 43] } },
    ],
  },
]
