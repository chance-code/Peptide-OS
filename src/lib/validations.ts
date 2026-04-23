import { z } from 'zod'

// Common field schemas
const cuidSchema = z.string().cuid('Invalid ID format')
const dateStringSchema = z.string().refine(
  (val) => !isNaN(Date.parse(val)),
  { message: 'Invalid date format' }
)

// Protocol schemas
export const createProtocolSchema = z.object({
  userId: cuidSchema.optional(),
  peptideId: cuidSchema,
  startDate: dateStringSchema,
  endDate: dateStringSchema.nullable().optional(),
  frequency: z.enum(['daily', 'weekly', 'every_other_day', 'custom']),
  customDays: z.array(z.enum(['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'])).optional(),
  doseAmount: z.number().positive('Dose must be positive'),
  doseUnit: z.string().min(1).max(10),
  timing: z.string().max(50).nullable().optional(),
  timings: z.string().max(200).nullable().optional(), // JSON string
  notes: z.string().max(1000).nullable().optional(),
  vialAmount: z.number().positive().nullable().optional(),
  vialUnit: z.string().max(10).nullable().optional(),
  diluentVolume: z.number().positive().nullable().optional(),
  servingSize: z.number().int().positive().nullable().optional(),
  servingUnit: z.string().max(20).nullable().optional(),
})

export const updateProtocolSchema = createProtocolSchema.partial().extend({
  status: z.enum(['active', 'paused', 'completed']).optional(),
})

// Protocol cycle (on/off phases) — 2026-04-23 refocus Phase 1
export const protocolCycleSchema = z.object({
  onDays: z.number().int().positive().max(365),
  offDays: z.number().int().nonnegative().max(365),
  cycleStartDate: dateStringSchema,
  repeatCount: z.number().int().min(-1).max(100).optional(), // -1 = indefinite
})

// Titration steps (gradual dose ramp) — 2026-04-23 refocus Phase 1
export const titrationStepSchema = z.object({
  stepIndex: z.number().int().nonnegative(),
  weekOffset: z.number().int().nonnegative().max(520), // 10 years safety bound
  doseAmount: z.number().positive(),
  doseUnit: z.enum(['mcg', 'mg', 'IU']),
  notes: z.string().max(500).nullable().optional(),
})

export const titrationStepsPutSchema = z.object({
  steps: z.array(titrationStepSchema).max(52), // 52 weeks = 1 year cap
})

// Dose schemas
export const createDoseSchema = z.object({
  userId: cuidSchema,
  protocolId: cuidSchema,
  scheduleId: cuidSchema.nullable().optional(),
  scheduledDate: dateStringSchema,
  status: z.enum(['pending', 'completed', 'skipped', 'missed']),
  timing: z.string().max(50).nullable().optional(),
  actualDose: z.number().positive().nullable().optional(),
  actualUnit: z.string().max(10).nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
  // Refocus Phase 1 additions (2026-04-23): vial + site + phase linkage
  vialId: cuidSchema.nullable().optional(),
  volumeDrawnMl: z.number().positive().nullable().optional(),
  concentrationAtDose: z.number().positive().nullable().optional(),
  injectionSite: z.string().max(30).nullable().optional(),
  phase: z.string().max(40).nullable().optional(),
})

// Inventory schemas
export const createInventorySchema = z.object({
  userId: cuidSchema,
  peptideId: cuidSchema,
  identifier: z.string().max(100).nullable().optional(),
  totalAmount: z.number().positive('Amount must be positive'),
  totalUnit: z.string().min(1).max(10),
  diluentVolume: z.number().positive().nullable().optional(),
  concentration: z.number().positive().nullable().optional(),
  concentrationUnit: z.string().max(20).nullable().optional(),
  dateReceived: dateStringSchema.nullable().optional(),
  dateReconstituted: dateStringSchema.nullable().optional(),
  expirationDate: dateStringSchema.nullable().optional(),
  remainingAmount: z.number().min(0).nullable().optional(),
  itemCount: z.number().int().positive().nullable().optional(),
  remainingCount: z.number().int().min(0).nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
})

export const updateInventorySchema = createInventorySchema.partial().extend({
  isExpired: z.boolean().optional(),
  isExhausted: z.boolean().optional(),
})

// Peptide schemas
export const createPeptideSchema = z.object({
  name: z.string().min(1).max(100),
  type: z.enum(['peptide', 'supplement']).default('peptide'),
  category: z.string().max(50).nullable().optional(),
  description: z.string().max(1000).nullable().optional(),
  storageNotes: z.string().max(500).nullable().optional(),
})

// User schemas
export const updateUserSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  notes: z.string().max(1000).nullable().optional(),
  isActive: z.boolean().optional(),
})

// Helper to validate and return typed result
export function validate<T>(schema: z.ZodSchema<T>, data: unknown):
  | { success: true; data: T }
  | { success: false; error: string } {
  const result = schema.safeParse(data)
  if (result.success) {
    return { success: true, data: result.data }
  }
  const errors = result.error.issues.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')
  return { success: false, error: errors }
}
