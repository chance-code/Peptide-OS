# Arc Protocol Health Dashboard Redesign

## Overview

This is a comprehensive redesign of the health dashboard, implementing the "Physiology Graph" vision with claims-backed insights and protocol correlation.

## What's New

### Core Concept: Claims with Receipts
Every insight is backed by evidence:
- Sample size and effect size
- Time windows and methodology
- Confound detection and filtering
- "View days included" for full transparency

### New Files Created

#### Product Spec
- `docs/HEALTH_REDESIGN_SPEC.md` - Full product specification

#### Data Layer
- `src/lib/demo-data/seed-metrics.ts` - 60 days of realistic demo data
  - Sleep metrics (duration, efficiency, deep, REM, WASO)
  - Recovery metrics (HRV, RHR, respiratory rate, temp deviation)
  - Activity metrics (steps, calories, workouts)
  - Protocol events (BPC-157, TA1, Selank, supplements)
  - Context events (alcohol, travel, illness, stress)

- `src/lib/health-baselines.ts` - Baseline computation engine
  - Rolling 28-day baselines with robust statistics
  - Z-score comparisons for "vs baseline" display
  - Volatility and momentum tracking

- `src/lib/health-claims.ts` - Claims with receipts engine
  - Effect size calculations (Cohen's d)
  - Confidence scoring based on sample size + confounds
  - Intervention impact claims
  - Daily delta claims
  - Warning and correlation claims

#### UI Components
- `src/components/health/today-score-hero.tsx` - Premium score display
- `src/components/health/what-changed-card.tsx` - Delta list with explanations
- `src/components/health/do-this-next-card.tsx` - Single action recommendation
- `src/components/health/claim-with-receipts.tsx` - Expandable evidence cards
- `src/components/health/protocol-impact-report.tsx` - Full protocol analysis
- `src/components/health/index.ts` - Component exports

#### New Health Page
- `src/app/(app)/health/page-new.tsx` - Redesigned dashboard
  - Three tabs: Today, Protocols, Insights
  - Uses demo data with FORCE_DEMO_MODE flag
  - Premium dark mode styling

## Demo Mode

The new health page runs in demo mode by default (`FORCE_DEMO_MODE = true`).

Demo data includes:
- **60 days** of health metrics showing improvement over time
- **6 protocols**: BPC-157, Thymosin Alpha-1, Selank, Magnesium, Vitamin D, Omega-3
- **28+ context events**: alcohol, travel, illness, stress days
- **30 subjective check-ins**: mood, energy, focus scores

The demo data tells a story: user started BPC-157 45 days ago, added TA1 30 days ago, and is seeing measurable improvements in HRV, deep sleep, and recovery scores.

## How to Use

### View the New Dashboard

To switch to the new health dashboard:

1. Rename `src/app/(app)/health/page.tsx` to `page-old.tsx`
2. Rename `src/app/(app)/health/page-new.tsx` to `page.tsx`

Or access the demo by navigating to the health page - the demo mode will show all features without needing real integrations.

### Disable Demo Mode

In `page-new.tsx`, set:
```typescript
const FORCE_DEMO_MODE = false
```

This will fall back to real integration data.

## Key Features

### 1. Today's Score Hero
- Single unified score (0-100) with breakdown
- Top 3 drivers shown as chips
- Premium gradient ring visualization
- "Explain Score" drill-down

### 2. What Changed Card
- Top 4 deltas vs personal baseline
- Z-score based significance
- "Why might this be?" analysis

### 3. Do This Next
- ONE recommended action
- Evidence-backed reasoning
- Expandable evidence section
- Mark done / dismiss actions

### 4. Protocol Impact Reports
- Before vs after comparison
- Ramp effect analysis (days 1-7, 8-21, 22+)
- Context splits (training vs rest, home vs travel)
- Confidence and receipts section
- Filter toggles (exclude alcohol, travel-only, etc.)

### 5. Claims with Receipts
- Every insight expandable to show:
  - Sample size (before/after)
  - Effect size (Cohen's d + magnitude)
  - Time window
  - Confounds present
  - Confidence factors
  - Link to view included days
  - Filter toggles to adjust analysis

## UI Design

- **Dark mode**: Slate-950 base with subtle gradients
- **Premium cards**: Gradient borders, subtle shadows
- **Confidence badges**: Color-coded (emerald/amber/slate)
- **Tabular numbers**: For consistent metric display
- **Subtle animations**: On score rings and interactions

## Next Steps

1. **Timeline View**: Unified day/week timeline merging all sources
2. **Metric Detail Pages**: Trend + Drivers + Interventions tabs
3. **Experiments**: N-of-1 A/B testing workflow
4. **Sleep Forecast**: Tonight's prediction with risk factors
5. **Real Integration**: Connect claims engine to live data

## Technical Notes

- Uses Zustand store for user context
- React Query for data fetching (5-min cache)
- date-fns for date manipulation
- Tailwind CSS for styling
- All components are client-side rendered
