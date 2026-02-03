// Seed data for demo mode - 60 days of realistic health metrics
// This creates a compelling narrative: user started peptides ~45 days ago and is seeing improvements

import { addDays, subDays, format, startOfDay } from 'date-fns'

export interface SeedMetric {
  date: string // YYYY-MM-DD
  metricType: string
  value: number
  unit: string
  source: string
}

export interface SeedIntervention {
  id: string
  name: string
  type: 'peptide' | 'supplement'
  startDate: string
  endDate?: string
  dose: string
  frequency: string
  timing: string
}

export interface SeedContextEvent {
  date: string
  type: 'alcohol' | 'travel' | 'late_meal' | 'illness' | 'stress' | 'late_workout'
  severity: number // 1-3
  notes?: string
}

export interface SeedCheckin {
  date: string
  time: string
  mood: number
  energy: number
  calm: number
  focus: number
  notes?: string
}

// Generate dates for the past 60 days
const today = startOfDay(new Date())
const generateDates = (days: number): string[] => {
  return Array.from({ length: days }, (_, i) =>
    format(subDays(today, days - 1 - i), 'yyyy-MM-dd')
  )
}

const dates = generateDates(60)

// Helper to add natural variation
const vary = (base: number, variance: number): number => {
  return Math.round((base + (Math.random() - 0.5) * 2 * variance) * 10) / 10
}

// Create improvement curves for peptide effects
// Day 0-14: baseline
// Day 15-30: gradual improvement (started BPC-157 day 15)
// Day 30-45: continued improvement (added TA1 day 30)
// Day 45-60: peak/plateau

const getImprovementMultiplier = (dayIndex: number): number => {
  if (dayIndex < 15) return 1.0 // Baseline
  if (dayIndex < 30) return 1.0 + (dayIndex - 15) * 0.01 // 0-15% improvement
  if (dayIndex < 45) return 1.15 + (dayIndex - 30) * 0.01 // 15-30% improvement
  return 1.25 + Math.random() * 0.05 // Peak with small variation
}

const getDeclineMultiplier = (dayIndex: number): number => {
  // For metrics where lower is better (RHR)
  if (dayIndex < 15) return 1.0
  if (dayIndex < 30) return 1.0 - (dayIndex - 15) * 0.005
  if (dayIndex < 45) return 0.925 - (dayIndex - 30) * 0.005
  return 0.85 + Math.random() * 0.02
}

// Generate metrics
export const generateSeedMetrics = (): SeedMetric[] => {
  const metrics: SeedMetric[] = []

  dates.forEach((date, dayIndex) => {
    const improve = getImprovementMultiplier(dayIndex)
    const decline = getDeclineMultiplier(dayIndex)
    const isWeekend = new Date(date).getDay() === 0 || new Date(date).getDay() === 6

    // Check for context events that affect metrics
    const hasAlcohol = SEED_CONTEXT_EVENTS.some(e => e.date === date && e.type === 'alcohol')
    const isTravel = SEED_CONTEXT_EVENTS.some(e => e.date === date && e.type === 'travel')
    const isIll = SEED_CONTEXT_EVENTS.some(e => e.date === date && e.type === 'illness')
    const hadLateWorkout = SEED_CONTEXT_EVENTS.some(e => e.date === date && e.type === 'late_workout')

    // Alcohol impact
    const alcoholPenalty = hasAlcohol ? 0.85 : 1.0
    const alcoholRHRPenalty = hasAlcohol ? 1.08 : 1.0

    // HRV (baseline ~45ms, improving to ~55ms)
    let hrv = vary(45 * improve * alcoholPenalty, 8)
    if (isTravel) hrv *= 0.9
    if (isIll) hrv *= 0.75
    metrics.push({ date, metricType: 'hrv', value: Math.round(hrv), unit: 'ms', source: 'oura' })

    // RHR (baseline ~62bpm, improving to ~56bpm)
    let rhr = vary(62 * decline * alcoholRHRPenalty, 3)
    if (isIll) rhr *= 1.1
    metrics.push({ date, metricType: 'rhr', value: Math.round(rhr), unit: 'bpm', source: 'oura' })

    // Sleep Duration (baseline ~400min, improving to ~440min)
    let sleepDuration = vary(400 * (improve * 0.5 + 0.5), 30) // Less dramatic improvement
    if (isWeekend) sleepDuration += vary(30, 15)
    if (hasAlcohol) sleepDuration -= vary(25, 10)
    if (hadLateWorkout) sleepDuration -= vary(15, 5)
    metrics.push({ date, metricType: 'sleep_duration', value: Math.round(sleepDuration), unit: 'minutes', source: 'oura' })

    // Deep Sleep (baseline ~70min, improving to ~95min)
    let deepSleep = vary(70 * improve, 15)
    if (hasAlcohol) deepSleep *= 0.65
    if (hadLateWorkout) deepSleep *= 0.85
    metrics.push({ date, metricType: 'deep_sleep', value: Math.round(deepSleep), unit: 'minutes', source: 'oura' })

    // REM Sleep (baseline ~80min, slight improvement)
    let remSleep = vary(80 * (improve * 0.3 + 0.7), 20)
    if (hasAlcohol) remSleep *= 0.7
    metrics.push({ date, metricType: 'rem_sleep', value: Math.round(remSleep), unit: 'minutes', source: 'oura' })

    // Sleep Efficiency (baseline ~85%, improving to ~92%)
    let sleepEfficiency = vary(85 + (improve - 1) * 50, 4)
    if (hasAlcohol) sleepEfficiency -= vary(8, 3)
    sleepEfficiency = Math.min(98, Math.max(70, sleepEfficiency))
    metrics.push({ date, metricType: 'sleep_efficiency', value: Math.round(sleepEfficiency), unit: 'percent', source: 'oura' })

    // WASO - Wake After Sleep Onset (baseline ~35min, improving to ~18min)
    let waso = vary(35 * (2 - improve), 10)
    if (hasAlcohol) waso += vary(15, 5)
    waso = Math.max(5, waso)
    metrics.push({ date, metricType: 'waso', value: Math.round(waso), unit: 'minutes', source: 'eight_sleep' })

    // Sleep Latency (baseline ~18min, improving to ~12min)
    let sleepLatency = vary(18 * (2 - improve * 0.7), 6)
    if (hadLateWorkout) sleepLatency += vary(8, 3)
    sleepLatency = Math.max(3, sleepLatency)
    metrics.push({ date, metricType: 'sleep_latency', value: Math.round(sleepLatency), unit: 'minutes', source: 'eight_sleep' })

    // Bed Temperature Deviation (Eight Sleep)
    let tempDev = vary(0.1, 0.3)
    if (hasAlcohol) tempDev += vary(0.4, 0.1)
    if (isIll) tempDev += vary(0.6, 0.2)
    metrics.push({ date, metricType: 'temp_deviation', value: Math.round(tempDev * 10) / 10, unit: 'celsius', source: 'eight_sleep' })

    // Respiratory Rate (baseline ~14.5, stable)
    let respRate = vary(14.5, 0.8)
    if (isIll) respRate += vary(2, 0.5)
    metrics.push({ date, metricType: 'respiratory_rate', value: Math.round(respRate * 10) / 10, unit: 'breaths_min', source: 'oura' })

    // Steps (baseline ~7500, slight improvement with activity)
    let steps = vary(7500 + (improve - 1) * 2000, 2500)
    if (isWeekend) steps *= vary(1.15, 0.1)
    if (isTravel) steps *= 0.6
    if (isIll) steps *= 0.3
    metrics.push({ date, metricType: 'steps', value: Math.round(steps), unit: 'steps', source: 'apple_health' })

    // Active Calories (correlated with steps)
    let activeCals = vary(steps * 0.05 + 150, 100)
    metrics.push({ date, metricType: 'active_calories', value: Math.round(activeCals), unit: 'kcal', source: 'apple_health' })

    // Exercise Minutes (3-4 days per week)
    const isWorkoutDay = dayIndex % 7 < 4 && !isIll && !isTravel
    if (isWorkoutDay) {
      const exerciseMin = vary(55, 20)
      metrics.push({ date, metricType: 'exercise_minutes', value: Math.round(exerciseMin), unit: 'minutes', source: 'apple_health' })
    }

    // Weekly body composition (Sundays only)
    if (new Date(date).getDay() === 0) {
      // Weight (slight downtrend from 185 to 182)
      const weekNum = Math.floor(dayIndex / 7)
      let weight = vary(185 - weekNum * 0.4, 0.8)
      metrics.push({ date, metricType: 'weight', value: Math.round(weight * 10) / 10, unit: 'kg', source: 'apple_health' })

      // Body fat % (slight downtrend from 18% to 16.5%)
      let bodyFat = vary(18 - weekNum * 0.2, 0.5)
      metrics.push({ date, metricType: 'body_fat_percentage', value: Math.round(bodyFat * 10) / 10, unit: 'percent', source: 'apple_health' })
    }

    // Sleep score (Oura composite - baseline ~72, improving to ~85)
    let sleepScore = vary(72 + (improve - 1) * 80, 8)
    if (hasAlcohol) sleepScore -= vary(15, 5)
    sleepScore = Math.min(98, Math.max(50, sleepScore))
    metrics.push({ date, metricType: 'sleep_score', value: Math.round(sleepScore), unit: 'score', source: 'oura' })

    // Readiness score (Oura - baseline ~70, improving to ~82)
    let readinessScore = vary(70 + (improve - 1) * 75, 10)
    if (hasAlcohol) readinessScore -= vary(18, 6)
    if (isIll) readinessScore -= vary(25, 8)
    readinessScore = Math.min(95, Math.max(45, readinessScore))
    metrics.push({ date, metricType: 'readiness_score', value: Math.round(readinessScore), unit: 'score', source: 'oura' })
  })

  return metrics
}

// Interventions (peptides and supplements)
export const SEED_INTERVENTIONS: SeedIntervention[] = [
  {
    id: 'int_bpc157',
    name: 'BPC-157',
    type: 'peptide',
    startDate: format(subDays(today, 45), 'yyyy-MM-dd'),
    dose: '250mcg',
    frequency: 'daily',
    timing: '7:00 AM'
  },
  {
    id: 'int_ta1',
    name: 'Thymosin Alpha-1',
    type: 'peptide',
    startDate: format(subDays(today, 30), 'yyyy-MM-dd'),
    dose: '1.5mg',
    frequency: 'twice_weekly',
    timing: '7:00 AM'
  },
  {
    id: 'int_selank',
    name: 'Selank',
    type: 'peptide',
    startDate: format(subDays(today, 14), 'yyyy-MM-dd'),
    dose: '300mcg',
    frequency: 'daily',
    timing: '8:00 AM'
  },
  {
    id: 'int_magnesium',
    name: 'Magnesium Glycinate',
    type: 'supplement',
    startDate: format(subDays(today, 60), 'yyyy-MM-dd'),
    dose: '400mg',
    frequency: 'daily',
    timing: '9:00 PM'
  },
  {
    id: 'int_vitd',
    name: 'Vitamin D3',
    type: 'supplement',
    startDate: format(subDays(today, 60), 'yyyy-MM-dd'),
    dose: '5000 IU',
    frequency: 'daily',
    timing: '8:00 AM'
  },
  {
    id: 'int_omega3',
    name: 'Omega-3 Fish Oil',
    type: 'supplement',
    startDate: format(subDays(today, 60), 'yyyy-MM-dd'),
    dose: '2g',
    frequency: 'daily',
    timing: '8:00 AM'
  }
]

// Context events (confounds)
export const SEED_CONTEXT_EVENTS: SeedContextEvent[] = [
  // Alcohol events (scattered)
  { date: format(subDays(today, 52), 'yyyy-MM-dd'), type: 'alcohol', severity: 2, notes: '2 glasses wine' },
  { date: format(subDays(today, 45), 'yyyy-MM-dd'), type: 'alcohol', severity: 1, notes: '1 beer' },
  { date: format(subDays(today, 38), 'yyyy-MM-dd'), type: 'alcohol', severity: 3, notes: 'Dinner party' },
  { date: format(subDays(today, 31), 'yyyy-MM-dd'), type: 'alcohol', severity: 2, notes: '2 cocktails' },
  { date: format(subDays(today, 24), 'yyyy-MM-dd'), type: 'alcohol', severity: 1, notes: '1 glass wine' },
  { date: format(subDays(today, 17), 'yyyy-MM-dd'), type: 'alcohol', severity: 2, notes: 'Work event' },
  { date: format(subDays(today, 10), 'yyyy-MM-dd'), type: 'alcohol', severity: 1, notes: '1 beer' },
  { date: format(subDays(today, 3), 'yyyy-MM-dd'), type: 'alcohol', severity: 2, notes: 'Date night' },

  // Travel events
  { date: format(subDays(today, 42), 'yyyy-MM-dd'), type: 'travel', severity: 2, notes: 'Business trip - NYC' },
  { date: format(subDays(today, 41), 'yyyy-MM-dd'), type: 'travel', severity: 2, notes: 'Business trip - NYC' },
  { date: format(subDays(today, 40), 'yyyy-MM-dd'), type: 'travel', severity: 2, notes: 'Business trip - NYC' },
  { date: format(subDays(today, 21), 'yyyy-MM-dd'), type: 'travel', severity: 1, notes: 'Weekend getaway' },
  { date: format(subDays(today, 20), 'yyyy-MM-dd'), type: 'travel', severity: 1, notes: 'Weekend getaway' },

  // Late meals
  { date: format(subDays(today, 48), 'yyyy-MM-dd'), type: 'late_meal', severity: 2, notes: 'Dinner at 10pm' },
  { date: format(subDays(today, 35), 'yyyy-MM-dd'), type: 'late_meal', severity: 1, notes: 'Late snack' },
  { date: format(subDays(today, 28), 'yyyy-MM-dd'), type: 'late_meal', severity: 2, notes: 'Dinner at 9:30pm' },
  { date: format(subDays(today, 14), 'yyyy-MM-dd'), type: 'late_meal', severity: 1, notes: 'Dessert at 10pm' },
  { date: format(subDays(today, 7), 'yyyy-MM-dd'), type: 'late_meal', severity: 2, notes: 'Late dinner' },

  // Illness
  { date: format(subDays(today, 25), 'yyyy-MM-dd'), type: 'illness', severity: 2, notes: 'Cold symptoms' },
  { date: format(subDays(today, 24), 'yyyy-MM-dd'), type: 'illness', severity: 3, notes: 'Cold - worst day' },

  // High stress
  { date: format(subDays(today, 50), 'yyyy-MM-dd'), type: 'stress', severity: 3, notes: 'Work deadline' },
  { date: format(subDays(today, 33), 'yyyy-MM-dd'), type: 'stress', severity: 2, notes: 'Presentation' },
  { date: format(subDays(today, 18), 'yyyy-MM-dd'), type: 'stress', severity: 2, notes: 'Family issues' },
  { date: format(subDays(today, 5), 'yyyy-MM-dd'), type: 'stress', severity: 1, notes: 'Busy day' },

  // Late workouts
  { date: format(subDays(today, 47), 'yyyy-MM-dd'), type: 'late_workout', severity: 2, notes: '8pm gym session' },
  { date: format(subDays(today, 36), 'yyyy-MM-dd'), type: 'late_workout', severity: 2, notes: '7:30pm run' },
  { date: format(subDays(today, 22), 'yyyy-MM-dd'), type: 'late_workout', severity: 1, notes: '6:30pm workout' },
  { date: format(subDays(today, 8), 'yyyy-MM-dd'), type: 'late_workout', severity: 2, notes: '8pm strength' },
]

// Subjective check-ins
export const SEED_CHECKINS: SeedCheckin[] = [
  // Generate ~30 check-ins over 60 days (every other day roughly)
  ...Array.from({ length: 30 }, (_, i) => {
    const dayOffset = Math.floor(i * 2) + Math.floor(Math.random() * 2)
    const date = format(subDays(today, 60 - dayOffset), 'yyyy-MM-dd')
    const improve = getImprovementMultiplier(60 - dayOffset)

    // Check for context that affects mood
    const hasAlcohol = SEED_CONTEXT_EVENTS.some(e => e.date === date && e.type === 'alcohol')
    const isIll = SEED_CONTEXT_EVENTS.some(e => e.date === date && e.type === 'illness')
    const isStressed = SEED_CONTEXT_EVENTS.some(e => e.date === date && e.type === 'stress')

    let mood = Math.round(vary(6 + (improve - 1) * 15, 1.5))
    let energy = Math.round(vary(6 + (improve - 1) * 12, 1.5))
    let calm = Math.round(vary(6 + (improve - 1) * 10, 1.5))
    let focus = Math.round(vary(6 + (improve - 1) * 12, 1.5))

    if (hasAlcohol) { mood -= 1; energy -= 2; focus -= 2 }
    if (isIll) { mood -= 2; energy -= 3; calm -= 1; focus -= 2 }
    if (isStressed) { calm -= 2; focus -= 1 }

    // Clamp values
    mood = Math.min(10, Math.max(1, mood))
    energy = Math.min(10, Math.max(1, energy))
    calm = Math.min(10, Math.max(1, calm))
    focus = Math.min(10, Math.max(1, focus))

    return {
      date,
      time: '08:00',
      mood,
      energy,
      calm,
      focus,
      notes: i % 5 === 0 ? 'Feeling good today' : undefined
    }
  })
]

// Export all seed data
export const SEED_DATA = {
  metrics: generateSeedMetrics(),
  interventions: SEED_INTERVENTIONS,
  contextEvents: SEED_CONTEXT_EVENTS,
  checkins: SEED_CHECKINS
}

// Helper to check if demo mode should be used
export const shouldUseDemoData = (hasConnectedIntegrations: boolean): boolean => {
  return !hasConnectedIntegrations
}
