import { describe, it, expect } from 'vitest'
import {
  computeBodyCompState,
  computeEnhancedBodyComp,
} from '../health-trajectory'
import {
  RECOMP_METRICS,
  FAT_LOSS_METRICS,
  REGRESSING_METRICS,
  INSUFFICIENT_METRICS,
  STABLE_METRICS,
  METABOLIC_ADAPTATION_METRICS,
  EMPTY_METRICS,
  metric,
  series,
} from './fixtures/metrics-fixtures'

// ─── computeBodyCompState ────────────────────────────────────────────

describe('computeBodyCompState', () => {
  it('returns insufficient_data with < 4 data points', () => {
    const result = computeBodyCompState(INSUFFICIENT_METRICS)
    expect(result.recompStatus).toBe('insufficient_data')
    expect(result.confidence).toBe('insufficient')
  })

  it('detects recomposition (fat down, mass up)', () => {
    const result = computeBodyCompState(RECOMP_METRICS)
    expect(result.recompStatus).toBe('recomposing')
    expect(result.headline).toContain('recomposition')
  })

  it('detects fat loss phase', () => {
    const result = computeBodyCompState(FAT_LOSS_METRICS)
    expect(result.recompStatus).toBe('fat_loss')
    expect(result.headline).toContain('Fat loss')
  })

  it('detects regression (fat up, mass down)', () => {
    const result = computeBodyCompState(REGRESSING_METRICS)
    expect(result.recompStatus).toBe('regressing')
  })

  it('detects stable when no significant changes', () => {
    const result = computeBodyCompState(STABLE_METRICS)
    expect(result.recompStatus).toBe('stable')
  })

  it('returns empty metrics as insufficient', () => {
    const result = computeBodyCompState(EMPTY_METRICS)
    expect(result.recompStatus).toBe('insufficient_data')
  })

  it('assigns confidence based on data points', () => {
    // 8 points per metric = 24 total points → high
    const result = computeBodyCompState(RECOMP_METRICS)
    expect(result.confidence).toBe('high')
  })
})

// ─── computeEnhancedBodyComp ──────────────────────────────────────────

describe('computeEnhancedBodyComp', () => {
  it('inherits base body comp state', () => {
    const result = computeEnhancedBodyComp(RECOMP_METRICS)
    expect(result.recompStatus).toBe('recomposing')
    expect(result.weight).toBeDefined()
  })

  it('computes weekly rates', () => {
    const result = computeEnhancedBodyComp(FAT_LOSS_METRICS)
    expect(result.weeklyRates.weightChangePerWeek).not.toBeNull()
    expect(result.weeklyRates.weightChangePerWeek!).toBeLessThan(0) // losing weight
    expect(result.weeklyRates.fatChangePerWeek).not.toBeNull()
    expect(result.weeklyRates.fatChangePerWeek!).toBeLessThan(0) // losing fat
  })

  it('returns null weekly rates with insufficient data', () => {
    const result = computeEnhancedBodyComp(INSUFFICIENT_METRICS)
    expect(result.weeklyRates.weightChangePerWeek).toBeNull()
    expect(result.weeklyRates.fatChangePerWeek).toBeNull()
  })

  it('computes lean-to-fat ratio when weight and body fat exist', () => {
    const result = computeEnhancedBodyComp(RECOMP_METRICS)
    expect(result.leanToFatRatio).toBeDefined()
    expect(result.leanToFatRatio!.current).toBeGreaterThan(0)
  })

  it('detects metabolic adaptation', () => {
    const result = computeEnhancedBodyComp(METABOLIC_ADAPTATION_METRICS)
    expect(result.metabolicAdaptation).toBeDefined()
    expect(result.metabolicAdaptation!.detected).toBe(true)
    expect(result.metabolicAdaptation!.severity).not.toBe('none')
  })

  it('no metabolic adaptation when not present', () => {
    const result = computeEnhancedBodyComp(RECOMP_METRICS)
    expect(result.metabolicAdaptation).toBeDefined()
    expect(result.metabolicAdaptation!.detected).toBe(false)
  })

  it('computes time-to-goal for weight target', () => {
    const result = computeEnhancedBodyComp(FAT_LOSS_METRICS, { weight: 170 })
    expect(result.timeToGoal).toBeDefined()
    if (result.timeToGoal!.estimatedWeeks != null) {
      expect(result.timeToGoal!.estimatedWeeks).toBeGreaterThan(0)
      expect(result.timeToGoal!.estimatedWeeks).toBeLessThan(104)
    }
  })

  it('returns null time-to-goal when moving wrong direction', () => {
    // Gaining weight but targeting lower — can't estimate
    const result = computeEnhancedBodyComp(REGRESSING_METRICS, { weight: 170 })
    expect(result.timeToGoal).toBeDefined()
    expect(result.timeToGoal!.estimatedWeeks).toBeNull()
  })

  it('generates narratives', () => {
    const result = computeEnhancedBodyComp(RECOMP_METRICS)
    expect(result.narratives.primary).toBeTruthy()
    expect(result.narratives.metabolic).toBeTruthy()
    expect(result.narratives.prediction).toBeTruthy()
  })

  it('prediction narrative shows goal info when targets set', () => {
    const result = computeEnhancedBodyComp(FAT_LOSS_METRICS, { weight: 170 })
    // If it can estimate, narrative should mention the target
    if (result.timeToGoal?.estimatedWeeks != null) {
      expect(result.narratives.prediction).toContain('170')
    }
  })
})
