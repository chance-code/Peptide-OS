// Re-export Prisma types for convenience
export type {
  UserProfile,
  Peptide,
  Protocol,
  DoseSchedule,
  DoseLog,
  InventoryVial,
  Reconstitution,
  ProtocolHistory,
  Note,
} from '@prisma/client'

// Frequency options (matches validations.ts zod enum)
export type FrequencyType = 'daily' | 'every_other_day' | 'weekly' | 'custom'

// Protocol status
export type ProtocolStatus = 'active' | 'paused' | 'completed'

// Dose log status
export type DoseLogStatus = 'pending' | 'completed' | 'skipped' | 'missed'

// Unit options
export type DoseUnit = 'mcg' | 'mg' | 'IU'

// Item type (peptide or supplement)
export type ItemType = 'peptide' | 'supplement'

// Serving unit options for supplements
export type ServingUnit = 'capsule' | 'tablet' | 'softgel' | 'scoop' | 'drop' | 'spray'

// Day of week for custom schedules
export type DayOfWeek = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun'

// Today's checklist item
export interface TodayDoseItem {
  id: string
  protocolId: string
  scheduleId?: string
  peptideName: string
  itemType: ItemType
  doseAmount: number
  doseUnit: string
  timing?: string | null
  status: DoseLogStatus
  notes?: string | null
  vialExpired?: boolean
  // Pen units to draw (calculated from reconstitution info) - peptides only
  penUnits?: number | null
  concentration?: string | null
  // Serving info - supplements only
  servingSize?: number | null
  servingUnit?: string | null
  // Refocus Phase 1 additions (2026-04-23): vial + site linkage
  // Optional for backwards compatibility with iOS clients that don't know about them yet.
  vialId?: string | null
  vialLabel?: string | null
  volumeDrawnMl?: number | null
  injectionSiteSuggestion?: string | null
  // Cycle/phase info (peptides with cycleMode='cycled' or 'titrated')
  phase?: string | null
  daysUntilNextPhaseBoundary?: number | null
}

// Adherence stats
export interface AdherenceStats {
  total: number
  completed: number
  skipped: number
  missed: number
  percentage: number
}

// Protocol with computed fields
export interface ProtocolWithStats {
  id: string
  peptideName: string
  doseAmount: number
  doseUnit: string
  frequency: string
  timing?: string | null
  startDate: Date
  endDate?: Date | null
  status: string
  daysCompleted: number
  daysRemaining: number | null // null for indefinite
  adherencePercentage: number
}

// Reconstitution calculation input
export interface ReconstitutionInput {
  vialAmount: number
  vialUnit: DoseUnit
  diluentVolume: number
  targetDose?: number
  targetUnit?: DoseUnit
}

// Reconstitution calculation result
export interface ReconstitutionResult {
  concentration: number
  concentrationUnit: string
  volumePerDose?: number
  volumePerDoseUnit?: string
  totalDoses?: number
  steps: ReconstitutionStep[]
}

// Step in reconstitution calculation
export interface ReconstitutionStep {
  description: string
  formula: string
  result: string
}

// Inventory status
export interface InventoryStatus {
  total: number
  active: number
  expiringSoon: number // within 7 days
  expired: number
  exhausted: number
}
