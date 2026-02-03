# Arc Protocol Health Dashboard - Product Specification

## Vision: The Physiology Graph

Every data point maps into a unified model:

| Category | Signals |
|----------|---------|
| **Load** | Exercise, training, steps, late workouts, travel, alcohol, stress |
| **Recovery** | Sleep stages, HRV, RHR, respiratory rate, temp deviation, wake events |
| **State** | Mood, calm/stress, energy, focus, soreness, libido |
| **Inputs** | Peptides, supplements, caffeine timing, sauna/cold, hydration |
| **Outcomes** | Sleep quality, HRV trend, performance, body comp, biomarkers |

The UI constantly answers:
- "What changed?"
- "What likely caused it?"
- "What should I do next?"

---

## Screen Specifications

### A) Home ("Today") - `/health`

Three core blocks replacing the current ring-only view:

#### 1. Today's State (Hero Card)
```
┌─────────────────────────────────────────────────┐
│  TODAY'S SCORE                                  │
│                                                 │
│     ████████████████░░░░  82                   │
│                                                 │
│  "Deep sleep + HRV drove recovery"             │
│                                                 │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐        │
│  │ +0.8σ   │  │ -12min  │  │ +8%     │        │
│  │ HRV     │  │ WASO    │  │ Deep    │        │
│  └─────────┘  └─────────┘  └─────────┘        │
│                                                 │
│            [Explain Score →]                    │
└─────────────────────────────────────────────────┘
```

**Interaction:**
- Tap score → Drill into component breakdown
- Tap any delta chip → Jump to that metric's detail page
- "Explain Score" → Modal with full driver breakdown

#### 2. What Changed (Delta Cards)
```
┌─────────────────────────────────────────────────┐
│  WHAT CHANGED TODAY                             │
│                                                 │
│  ↑ HRV +18%          vs your baseline          │
│  ↓ Sleep frag -22min  best in 2 weeks          │
│  ↑ Temp dev +0.3°     above normal             │
│  ↑ Mood stability     improved 0.6 pts         │
│                                                 │
│            [Why might this be? →]               │
└─────────────────────────────────────────────────┘
```

**Interaction:**
- Tap any row → Metric detail page
- "Why might this be?" → Shows likely causes ranked

#### 3. Do This Next (Single Action)
```
┌─────────────────────────────────────────────────┐
│  DO THIS NEXT                        [Why →]   │
│                                                 │
│  🌡️ Lower bed temp to 68°F tonight             │
│                                                 │
│  Your temp deviation has been elevated for     │
│  3 nights. Cooler temps correlate with 12%     │
│  better deep sleep in your data.               │
│                                                 │
│            [Mark Done]  [Dismiss]               │
└─────────────────────────────────────────────────┘
```

**Logic:**
- ONE recommendation, not a list
- Grounded in user's data
- Shows evidence for the recommendation
- Actionable and specific

---

### B) Unified Timeline - `/health/timeline`

A scrollable day/week view merging ALL sources:

```
┌─────────────────────────────────────────────────┐
│  ◀ Feb 1                              Week ▼   │
├─────────────────────────────────────────────────┤
│                                                 │
│  ┌──────────────────────────────────────────┐  │
│  │ 11:00pm - 6:30am    SLEEP                │  │
│  │ ████████████████░░░ 7h 15m               │  │
│  │ Deep: 1h 42m  REM: 1h 28m  Eff: 91%     │  │
│  │ 📊 Oura + Eight Sleep                    │  │
│  └──────────────────────────────────────────┘  │
│                                                 │
│  7:00am  💊 BPC-157 250mcg (SubQ)              │
│  7:00am  💊 Thymosin Alpha-1 1.5mg            │
│                                                 │
│  8:30am  ☕ Caffeine                            │
│                                                 │
│  ┌──────────────────────────────────────────┐  │
│  │ 6:00pm - 7:15pm    WORKOUT               │  │
│  │ 🏋️ Strength Training  45min              │  │
│  │ 520 kcal  Avg HR: 142                    │  │
│  │ 📊 Apple Fitness                         │  │
│  └──────────────────────────────────────────┘  │
│                                                 │
│  8:00pm  🍷 Alcohol (2 drinks)     [context]   │
│  9:30pm  💊 Magnesium Glycinate 400mg         │
│                                                 │
│  10:15pm 📝 Mood check: 7/10, Calm: 8/10      │
│                                                 │
└─────────────────────────────────────────────────┘
```

**Event Types:**
- Sleep episodes (expandable to stages)
- Activity/workouts
- Interventions (peptides, supplements)
- Context tags (alcohol, travel, late meal, stress)
- Subjective check-ins (mood, energy, focus)

**Interactions:**
- Default: Compact "pill" events
- Tap: Expand into detail sheet
- Long-press: Add context tag / edit
- Swipe between days

---

### C) Metric Detail Pages - `/health/metrics/[metric]`

Each metric has three tabs:

#### Tab 1: Trend
```
┌─────────────────────────────────────────────────┐
│  HRV (Heart Rate Variability)                   │
│                                                 │
│  Current: 52ms        Baseline: 48ms           │
│           ↑ 8.3%      +0.6σ above baseline     │
│                                                 │
│  [Chart: 90-day with baseline band]            │
│  ────────────────────────────────────────      │
│       ·    ·  · ·                              │
│    ·    ·      ·  ···  ·  ·   ·               │
│  ···  ···  ····    ·  ···  ····  ·····        │
│  ═══════════ baseline ════════════════        │
│  ────────────────────────────────────────      │
│                                                 │
│  Volatility: Low (stable)    [7d] [30d] [90d] │
└─────────────────────────────────────────────────┘
```

#### Tab 2: Drivers
```
┌─────────────────────────────────────────────────┐
│  WHAT DRIVES YOUR HRV                           │
│                                                 │
│  Positive Impact:                              │
│  ████████████ Deep sleep >90min    +12%        │
│  █████████    No alcohol           +8%         │
│  ███████      Early workout        +6%         │
│                                                 │
│  Negative Impact:                              │
│  ████████████ Alcohol              -15%        │
│  ██████       Late workout         -7%         │
│  ████         Short sleep          -5%         │
│                                                 │
│  Filters: [✓ Exclude travel] [✓ Exclude sick] │
└─────────────────────────────────────────────────┘
```

#### Tab 3: Interventions
```
┌─────────────────────────────────────────────────┐
│  PEPTIDE & SUPPLEMENT IMPACT ON HRV             │
│                                                 │
│  BPC-157                                        │
│  ███████████████  +14%  (n=28, high confidence)│
│  Started Jan 5 • Current cycle                 │
│                                                 │
│  Thymosin Alpha-1                              │
│  ██████████       +9%   (n=21, high confidence)│
│  Started Jan 12 • Current cycle                │
│                                                 │
│  Magnesium Glycinate                           │
│  ████████         +6%   (n=45, high confidence)│
│  Ongoing daily                                 │
│                                                 │
│            [View Full Report →]                 │
└─────────────────────────────────────────────────┘
```

---

### D) Protocol Impact Report - `/health/protocols/[id]/impact`

The killer feature. For each peptide/supplement:

```
┌─────────────────────────────────────────────────┐
│  BPC-157 IMPACT REPORT                          │
│  Started Jan 5 • 28 days of data               │
│                                                 │
├─────────────────────────────────────────────────┤
│  BEFORE vs AFTER                                │
│                                                 │
│  Metric          Before    After    Change     │
│  ─────────────────────────────────────────     │
│  HRV             44ms      52ms     ↑ +18%     │
│  Deep Sleep      78min     94min    ↑ +21%     │
│  RHR             62bpm     58bpm    ↓ -6%      │
│  Sleep Eff       84%       91%      ↑ +8%      │
│  Recovery Score  68        82       ↑ +21%     │
│                                                 │
├─────────────────────────────────────────────────┤
│  RAMP EFFECT                                    │
│                                                 │
│  Days 1-7:   +8% HRV improvement               │
│  Days 8-21:  +14% HRV improvement (peak)       │
│  Days 22+:   +12% HRV (slight decline)         │
│                                                 │
│  [Chart showing effect over time]              │
│                                                 │
├─────────────────────────────────────────────────┤
│  CONTEXT SPLITS                                 │
│                                                 │
│  On Training Days:  +22% HRV improvement       │
│  On Rest Days:      +11% HRV improvement       │
│                                                 │
│  At Home:           +16% improvement           │
│  While Traveling:   +4% improvement            │
│                                                 │
├─────────────────────────────────────────────────┤
│  CONFIDENCE & RECEIPTS                          │
│                                                 │
│  Sample size: 28 days (HIGH confidence)        │
│  Confounds present: 3 alcohol days, 2 travel   │
│                                                 │
│  [View all 28 days included →]                 │
│                                                 │
│  Toggles:                                      │
│  [✓ Exclude alcohol] [✓ Exclude travel]        │
│  [  Training only  ] [  Rest only    ]         │
│                                                 │
└─────────────────────────────────────────────────┘
```

---

### E) Experiments - `/health/experiments`

N-of-1 self-experiments:

```
┌─────────────────────────────────────────────────┐
│  YOUR EXPERIMENTS                               │
│                                                 │
│  ┌───────────────────────────────────────────┐ │
│  │ COMPLETED                                  │ │
│  │                                            │ │
│  │ Caffeine Cutoff: 12pm vs 2pm              │ │
│  │ Duration: 14 days (7 + 7)                 │ │
│  │ Primary metric: Sleep Latency             │ │
│  │                                            │ │
│  │ RESULT: 12pm cutoff wins                  │ │
│  │ -8min sleep latency (HIGH confidence)     │ │
│  │                                            │ │
│  │ [View Full Report →]                      │ │
│  └───────────────────────────────────────────┘ │
│                                                 │
│  ┌───────────────────────────────────────────┐ │
│  │ IN PROGRESS                               │ │
│  │                                            │ │
│  │ Eight Sleep: Schedule A vs B              │ │
│  │ Day 5 of 14                               │ │
│  │ Primary metric: Deep Sleep                │ │
│  │                                            │ │
│  │ Preliminary: Schedule B +12min deep       │ │
│  │ (LOW confidence - need more data)         │ │
│  │                                            │ │
│  │ [View Progress →]                         │ │
│  └───────────────────────────────────────────┘ │
│                                                 │
│            [+ New Experiment]                   │
└─────────────────────────────────────────────────┘
```

**Experiment Types:**
- A vs B comparison (alternating days/weeks)
- ON/OFF windows (with washout)
- Dose optimization (gradient)

---

### F) Sleep Forecast - Card on Home

```
┌─────────────────────────────────────────────────┐
│  TONIGHT'S SLEEP FORECAST          [Details →] │
│                                                 │
│     ⚠️ ELEVATED RISK                           │
│                                                 │
│  Risk factors:                                 │
│  • Late workout (6pm) - usually hurts deep     │
│  • High training load today (+40% vs avg)      │
│                                                 │
│  Recommendation:                               │
│  Lower Eight Sleep temp 2° below normal        │
│  (This has improved your post-workout sleep    │
│   by 18min deep on similar nights)             │
│                                                 │
└─────────────────────────────────────────────────┘
```

---

## Data Model

### New/Updated Schemas

```prisma
// Timeline events (unified view)
model TimelineEvent {
  id          String   @id @default(cuid())
  userId      String
  type        String   // 'sleep' | 'activity' | 'intervention' | 'context' | 'checkin'
  startTime   DateTime
  endTime     DateTime?

  // Polymorphic data
  data        Json     // Type-specific fields

  // Source tracking
  source      String   // 'apple_health' | 'oura' | 'eight_sleep' | 'manual' | 'hume'
  sourceId    String?  // External ID for deduplication

  // Relations
  user        UserProfile @relation(fields: [userId], references: [id])

  @@unique([userId, source, sourceId])
  @@index([userId, startTime])
  @@index([userId, type])
}

// Context events (confounds)
model ContextEvent {
  id          String   @id @default(cuid())
  userId      String
  date        DateTime @db.Date
  type        String   // 'alcohol' | 'travel' | 'late_meal' | 'illness' | 'stress' | 'late_workout'
  severity    Int?     // 1-3 scale
  notes       String?

  user        UserProfile @relation(fields: [userId], references: [id])

  @@unique([userId, date, type])
  @@index([userId, date])
}

// Subjective check-ins
model SubjectiveCheckin {
  id          String   @id @default(cuid())
  userId      String
  timestamp   DateTime

  mood        Int?     // 1-10
  energy      Int?     // 1-10
  calm        Int?     // 1-10 (inverse of stress)
  focus       Int?     // 1-10
  soreness    Int?     // 1-10
  libido      Int?     // 1-10

  notes       String?

  user        UserProfile @relation(fields: [userId], references: [id])

  @@index([userId, timestamp])
}

// N-of-1 Experiments
model Experiment {
  id            String   @id @default(cuid())
  userId        String
  name          String
  description   String?

  // Design
  type          String   // 'ab_comparison' | 'on_off' | 'dose_gradient'
  primaryMetric String   // MetricType

  // Protocol
  conditionA    Json     // { name, description, settings }
  conditionB    Json?    // For A/B comparisons
  daysPerPhase  Int      @default(7)
  washoutDays   Int      @default(0)

  // Timeline
  startDate     DateTime
  endDate       DateTime?
  status        String   @default("active") // 'active' | 'completed' | 'cancelled'

  // Results
  result        Json?    // Computed analysis

  user          UserProfile @relation(fields: [userId], references: [id])

  @@index([userId, status])
}

// Baseline calculations (cached)
model MetricBaseline {
  id          String   @id @default(cuid())
  userId      String
  metricType  String

  // Baseline stats (28-day rolling)
  mean        Float
  stdDev      Float
  median      Float
  p25         Float
  p75         Float

  // Metadata
  dataPoints  Int
  lastUpdated DateTime

  user        UserProfile @relation(fields: [userId], references: [id])

  @@unique([userId, metricType])
}
```

### Canonical Metric Mapping

| Source | Raw Field | Canonical Metric | Unit | Transform |
|--------|-----------|------------------|------|-----------|
| Apple Health | HKQuantityTypeIdentifierHeartRateVariabilitySDNN | hrv | ms | none |
| Oura | daily_sleep.contributors.hrv_balance | hrv | ms | scale 0-100 to actual |
| Eight Sleep | intervals[].timeseries.hrv | hrv | ms | average overnight |
| Apple Health | HKQuantityTypeIdentifierRestingHeartRate | rhr | bpm | none |
| Oura | daily_readiness.contributors.resting_heart_rate | rhr | bpm | none |
| Apple Health | HKCategoryValueSleepAnalysis | sleep_duration | minutes | sum stages |
| Oura | daily_sleep.total_sleep_duration | sleep_duration | seconds | /60 |
| Eight Sleep | intervals[].duration | sleep_duration | seconds | /60 |

### Derived Metrics

| Metric | Calculation |
|--------|-------------|
| `sleep_efficiency` | (total_sleep / time_in_bed) * 100 |
| `waso` | Wake After Sleep Onset = awake_time during sleep window |
| `hrv_volatility` | stdDev(hrv) over 7 days / mean(hrv) |
| `sleep_regularity` | stdDev(bedtime) + stdDev(waketime) over 7 days |
| `thermal_mismatch` | abs(eight_sleep_temp_setting - optimal_temp) |
| `late_day_strain` | activity_calories after 6pm / total_activity |
| `recovery_debt` | rolling 7-day deficit from optimal sleep |

---

## Insight Engine Design

### Baseline Computation

```typescript
interface MetricBaseline {
  mean: number
  stdDev: number
  median: number
  p25: number
  p75: number
  dataPoints: number
  lastUpdated: Date
}

function computeBaseline(
  metrics: DailyMetric[],
  windowDays: number = 28
): MetricBaseline {
  // Use robust statistics (trimmed mean, MAD for std)
  // Exclude outliers beyond 3 IQR
  // Require minimum 7 data points
}

function deltaToBaseline(
  current: number,
  baseline: MetricBaseline
): { zScore: number; percentile: number; description: string } {
  const zScore = (current - baseline.mean) / baseline.stdDev
  return {
    zScore,
    percentile: normalCDF(zScore) * 100,
    description: zScoreToDescription(zScore) // "+0.8σ above baseline"
  }
}
```

### Confound Detection

```typescript
const CONFOUND_TYPES = [
  'alcohol',
  'travel',
  'timezone_shift',
  'illness',
  'late_meal',
  'late_workout',
  'high_training_load',
  'short_sleep',
  'menstrual_cycle'
] as const

interface ConfoundAnalysis {
  confoundsPresent: ConfoundType[]
  adjustedEffect: number
  rawEffect: number
  confoundImpact: Record<ConfoundType, number>
}

function analyzeWithConfounds(
  metricData: DailyMetric[],
  intervention: Intervention,
  contextEvents: ContextEvent[]
): ConfoundAnalysis {
  // Split data by confound presence
  // Calculate effect size with and without confounds
  // Report how much each confound changes the result
}
```

### Effect Size Calculation

```typescript
interface EffectSize {
  cohensD: number           // (mean_after - mean_before) / pooled_std
  percentChange: number
  absoluteChange: number
  confidence: 'low' | 'medium' | 'high'
  pValue: number            // Two-sample t-test
  sampleSize: { before: number; after: number }
}

function calculateEffectSize(
  before: number[],
  after: number[]
): EffectSize {
  // Cohen's d for practical significance
  // Confidence based on sample size:
  //   low: n < 7
  //   medium: 7 <= n < 14
  //   high: n >= 14
}
```

### Claim Generation

```typescript
interface Claim {
  id: string
  type: 'improvement' | 'decline' | 'correlation' | 'warning' | 'recommendation'
  headline: string          // "BPC-157 improved your HRV by 18%"
  evidence: string          // "Based on 28 days of data..."

  // Receipts
  sampleSize: number
  effectSize: EffectSize
  timeWindow: { start: Date; end: Date }
  confoundsPresent: ConfoundType[]
  dataPointsIncluded: string[]  // IDs for "view days included"

  // Interactivity
  filters: {
    excludeTravel: boolean
    excludeAlcohol: boolean
    trainingOnly: boolean
    restOnly: boolean
  }

  // Confidence
  confidence: number        // 0-100
  confidenceExplanation: string
}
```

---

## Implementation Plan

### File Structure

```
src/
├── app/(app)/health/
│   ├── page.tsx                 # Home (Today) - REDESIGN
│   ├── timeline/
│   │   └── page.tsx             # Unified Timeline - NEW
│   ├── metrics/
│   │   └── [metric]/
│   │       └── page.tsx         # Metric Detail - NEW
│   ├── protocols/
│   │   └── [id]/
│   │       └── impact/
│   │           └── page.tsx     # Protocol Impact - NEW
│   ├── experiments/
│   │   ├── page.tsx             # Experiments List - NEW
│   │   ├── new/
│   │   │   └── page.tsx         # Create Experiment - NEW
│   │   └── [id]/
│   │       └── page.tsx         # Experiment Detail - NEW
│   └── forecast/
│       └── page.tsx             # Sleep Forecast - NEW
│
├── components/health/
│   ├── today-score-hero.tsx     # Hero score card - NEW
│   ├── what-changed-card.tsx    # Delta list - NEW
│   ├── do-this-next-card.tsx    # Single action - NEW
│   ├── sleep-forecast-card.tsx  # Tonight's forecast - NEW
│   ├── timeline-event.tsx       # Timeline event pill - NEW
│   ├── timeline-day.tsx         # Day container - NEW
│   ├── metric-trend-chart.tsx   # Trend with baseline - NEW
│   ├── metric-drivers.tsx       # Driver rankings - NEW
│   ├── metric-interventions.tsx # Peptide impact - NEW
│   ├── protocol-impact-report.tsx # Full report - NEW
│   ├── experiment-card.tsx      # Experiment summary - NEW
│   ├── claim-with-receipts.tsx  # Evidence display - NEW
│   ├── confidence-badge.tsx     # Confidence indicator - NEW
│   └── context-filter-toggle.tsx # Confound filters - NEW
│
├── lib/
│   ├── health-synthesis.ts      # ENHANCE existing
│   ├── health-correlation.ts    # ENHANCE existing
│   ├── health-baselines.ts      # NEW - baseline computation
│   ├── health-confounds.ts      # NEW - confound analysis
│   ├── health-claims.ts         # NEW - claim generation
│   ├── health-forecast.ts       # NEW - sleep prediction
│   ├── health-experiments.ts    # NEW - experiment analysis
│   └── demo-data/
│       ├── seed-metrics.json    # 60 days metrics
│       ├── seed-interventions.json
│       ├── seed-context.json
│       └── seed-checkins.json
│
└── app/api/health/
    ├── timeline/route.ts        # Timeline events - NEW
    ├── baselines/route.ts       # Baseline data - NEW
    ├── claims/route.ts          # Claims with receipts - NEW
    ├── forecast/route.ts        # Sleep forecast - NEW
    └── experiments/
        ├── route.ts             # CRUD experiments - NEW
        └── [id]/
            └── results/route.ts # Experiment results - NEW
```

---

## UI Design System

### Colors (Premium Dark Mode)
```css
--bg-primary: #0a0a0f
--bg-card: #121218
--bg-elevated: #1a1a24
--accent-primary: #6366f1  /* Indigo */
--accent-secondary: #22d3ee /* Cyan */
--accent-success: #10b981  /* Emerald */
--accent-warning: #f59e0b  /* Amber */
--accent-danger: #ef4444   /* Red */
--text-primary: #f8fafc
--text-secondary: #94a3b8
--text-muted: #64748b
```

### Typography
```css
--font-display: 'SF Pro Display', system-ui
--font-body: 'SF Pro Text', system-ui
--font-mono: 'SF Mono', monospace

/* Sizes */
--text-hero: 48px / 1.1
--text-score: 72px / 1.0
--text-heading: 20px / 1.3
--text-body: 15px / 1.5
--text-caption: 13px / 1.4
--text-micro: 11px / 1.3
```

### Card Styling
```css
.premium-card {
  background: linear-gradient(
    135deg,
    rgba(99, 102, 241, 0.1) 0%,
    rgba(34, 211, 238, 0.05) 100%
  );
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 16px;
  backdrop-filter: blur(20px);
  box-shadow:
    0 4px 24px rgba(0, 0, 0, 0.3),
    inset 0 1px 0 rgba(255, 255, 255, 0.05);
}
```

### Interaction Patterns

1. **Expand Pattern**
   - Default: Minimal view (score + 2 drivers)
   - Tap: Expanded view (all drivers)
   - Long-press or "Details": Full detail sheet

2. **Confidence Indicators**
   - High: Solid badge, bold text
   - Medium: Outlined badge, normal text
   - Low: Dashed badge, muted text, "preliminary" label

3. **Delta Display**
   - Positive (good): Green, up arrow
   - Negative (good): Green, down arrow (for RHR, etc.)
   - Concerning: Amber/Red based on severity
   - Always show vs baseline, not vs yesterday

---

## Demo Mode

Demo mode activates when no real integrations are connected, using seed data to showcase the full experience.

### Seed Data Specification

**60 days of metrics** covering:
- Sleep: duration, efficiency, deep, REM, latency, WASO
- Recovery: HRV, RHR, respiratory rate, temp deviation
- Activity: steps, calories, workouts
- Body: weight, body fat (weekly)

**Protocol Events:**
- BPC-157: Started day -45, ongoing
- Thymosin Alpha-1: Started day -30, ongoing
- Magnesium Glycinate: Daily, ongoing
- Selank: Started day -14, ongoing

**Context Events:**
- 8 alcohol events (scattered)
- 3 travel events (multi-day)
- 5 late meal events
- 4 high-stress days
- 2 illness days

**Subjective Check-ins:**
- 30 mood/energy/focus entries

---

## Success Metrics

1. **Engagement**: Time on health pages, return visits
2. **Trust**: Users viewing "receipts" and evidence
3. **Action**: Recommendations marked "done"
4. **Discovery**: Protocol impact reports viewed
5. **Experiments**: N-of-1 experiments started

---

## Phase 1 Implementation Priority

1. Today's Score Hero (redesigned home)
2. What Changed card
3. Do This Next card
4. Baseline computation engine
5. Claims with receipts system
6. Protocol Impact Report page
7. Seed data and demo mode

Phase 2: Timeline, Experiments, Forecast
