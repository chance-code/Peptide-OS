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

// Frequency options
export type FrequencyType = 'daily' | 'weekly' | 'custom'

// Protocol status
export type ProtocolStatus = 'active' | 'paused' | 'completed'

// Dose log status
export type DoseLogStatus = 'pending' | 'completed' | 'skipped' | 'missed'

// Unit options
export type DoseUnit = 'mcg' | 'mg' | 'IU'

// Day of week for custom schedules
export type DayOfWeek = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun'

// Today's checklist item
export interface TodayDoseItem {
  id: string
  protocolId: string
  scheduleId?: string
  peptideName: string
  doseAmount: number
  doseUnit: string
  timing?: string | null
  status: DoseLogStatus
  notes?: string | null
  vialExpired?: boolean
  // Pen units to draw (calculated from reconstitution info)
  penUnits?: number | null
  concentration?: string | null
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
