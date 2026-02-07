import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// ─── Mocks ──────────────────────────────────────────────────────────────────

vi.mock('@/lib/api-auth', () => ({
  getAuthenticatedUserId: vi.fn().mockResolvedValue({
    success: true,
    userId: 'test-user-123',
  }),
}))

const mockGetLatestSnapshot = vi.fn()
const mockEvaluate = vi.fn()

vi.mock('@/lib/health-brain', async () => {
  const actual = await vi.importActual<typeof import('@/lib/health-brain')>('@/lib/health-brain')
  return {
    getLatestSnapshot: (...args: unknown[]) => mockGetLatestSnapshot(...args),
    evaluate: (...args: unknown[]) => mockEvaluate(...args),
    shouldPublishVelocity: vi.fn(),
    isVelocityPublishable: vi.fn(),
    scoreToVelocity: vi.fn(),
    computeDomainWeight: vi.fn(),
    computeVelocityUncertainty: vi.fn(),
    computeEWMAAlpha: vi.fn(),
    applyVelocityEWMA: vi.fn(),
    quantizeDaysGained: vi.fn(),
    computeVelocityTrend: vi.fn(),
    computeTopDrivers: vi.fn(),
    // Route uses these directly — provide real implementations
    formatDaysDisplay: actual.formatDaysDisplay,
    getDaysGainedLabel: actual.getDaysGainedLabel,
    VELOCITY_CONFIDENCE_WEIGHTS: {},
    VELOCITY_STABILITY_WEIGHTS: {},
    VELOCITY_PIPELINE_VERSION: actual.VELOCITY_PIPELINE_VERSION,
  }
})

// ─── Fixtures ───────────────────────────────────────────────────────────────

const FIXED_ISO = '2026-02-05T12:00:00.000Z'
const NEWER_ISO = '2026-02-05T12:05:00.000Z'
const YESTERDAY_ISO = '2026-02-04T08:00:00.000Z'

const DEFAULT_VELOCITY = {
  headline: 'You are aging 12 days slower per year',
  trend: 'decelerating' as const,
  confidence: 'medium' as const,
  score90d: 72,
  systemVelocities: {
    cardiovascular: { velocity: 0.85, confidence: 0.8, trend: 'decelerating' as const },
    metabolic: { velocity: 0.95, confidence: 0.7, trend: 'steady' as const },
  },
  overallVelocity: 0.9,
  daysGainedAnnually: 12,
  concordanceScore: 0.78,
  concordanceLabel: 'moderate' as const,
  overallVelocityCI: [0.86, 0.94] as [number, number],
  missingDomains: ['inflammatory', 'fitness', 'bodyComp', 'hormonal', 'neuro'],
  effectiveDomainsCount: 2,
  note: null,
  daysGainedAnnuallyBucket: 10,
  trendDirection: 'improving' as const,
  delta28d: -0.01,
  delta28dDays: 4,
  topDrivers: [
    { domain: 'cardiovascular', direction: 'improving' as const, magnitude: 0.015, plainEnglishReasonHint: 'Heart health markers improved' },
  ],
}

function makeSnapshot(overrides: Record<string, unknown> = {}) {
  return {
    evaluatedAt: FIXED_ISO,
    trigger: 'manual_refresh',
    pipelineMs: 1200,
    domains: {},
    agingVelocity: DEFAULT_VELOCITY,
    allostasis: { load: 'low', score: 0.3, drivers: [], trend: 'stable' },
    riskTrajectories: {},
    protocolEvidence: [],
    predictions: [],
    narrativePrimitives: [],
    actionItems: [],
    systemConfidence: { level: 'medium', score: 0.7, reasons: [] },
    personalBaselinesUpdated: false,
    unifiedScore: 72,
    dailyStatus: null,
    dataCompleteness: 0.65,
    // Publish pipeline fields
    publishedVelocity: DEFAULT_VELOCITY,
    publishedVelocityAt: FIXED_ISO,
    velocityComputedAt: FIXED_ISO,
    velocityWindowDays: 90,
    velocityVersion: '2.1.0',
    ...overrides,
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeRequest(params?: Record<string, string>, headers?: Record<string, string>) {
  const url = new URL('http://localhost/api/health/brain/velocity')
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, v)
    }
  }
  return new NextRequest(url, { headers })
}

async function callGET(params?: Record<string, string>, headers?: Record<string, string>) {
  const { GET } = await import('@/app/api/health/brain/velocity/route')
  const req = makeRequest(params, headers)
  const res = await GET(req)
  return res.json()
}

// ─── Tests: Stable Contract ─────────────────────────────────────────────────

describe('GET /api/health/brain/velocity — stable contract', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetLatestSnapshot.mockResolvedValue(makeSnapshot())
    mockEvaluate.mockResolvedValue(makeSnapshot({
      evaluatedAt: NEWER_ISO,
      velocityComputedAt: NEWER_ISO,
    }))
  })

  // Test 1: Repeated polling returns identical values, never calls evaluate
  it('repeated polling returns identical values without triggering evaluate', async () => {
    const results = []
    for (let i = 0; i < 10; i++) {
      results.push(await callGET())
    }

    expect(mockEvaluate).not.toHaveBeenCalled()
    expect(mockGetLatestSnapshot).toHaveBeenCalledTimes(10)

    const first = results[0]
    for (const result of results) {
      expect(result.meta.publishedAt).toBe(first.meta.publishedAt)
      expect(result.value.overallVelocityStable).toBe(first.value.overallVelocityStable)
      expect(result.value.daysGainedAnnuallyExact).toBe(first.value.daysGainedAnnuallyExact)
    }
  })

  // Test 2: refresh=true with x-user-action triggers evaluate exactly once
  it('refresh=true with x-user-action triggers evaluate exactly once', async () => {
    const result = await callGET(
      { refresh: 'true' },
      { 'x-user-action': 'pull_to_refresh' }
    )

    expect(mockEvaluate).toHaveBeenCalledTimes(1)
    expect(mockEvaluate).toHaveBeenCalledWith('test-user-123', 'user_refresh')
    expect(result.status).toBe('published')
    expect(result.meta.computedAt).toBe(NEWER_ISO)
  })

  // Test 3: refresh=true WITHOUT x-user-action does NOT trigger evaluate
  it('refresh=true without x-user-action does not trigger evaluate', async () => {
    const result = await callGET({ refresh: 'true' })

    expect(mockEvaluate).not.toHaveBeenCalled()
    expect(mockGetLatestSnapshot).toHaveBeenCalledTimes(1)
    expect(result.status).toBe('published')
    expect(result.meta.publishedAt).toBe(FIXED_ISO)
  })

  // Test 4: No snapshot returns initializing status
  it('no snapshot returns initializing status', async () => {
    mockGetLatestSnapshot.mockResolvedValue(null)

    const result = await callGET()

    expect(result.status).toBe('initializing')
    expect(result.value.overallVelocityStable).toBeNull()
    expect(result.value.daysGainedAnnuallyDisplay).toBeNull()
    expect(result.value.daysGainedAnnuallyExact).toBeNull()
    expect(result.value.systemVelocitiesStable).toEqual([])
    expect(result.meta.confidence).toBe('low')
    expect(result.meta.publishedAt).toBeNull()
    expect(result.meta.computedAt).toBeNull()
    expect(result.meta.version).toBe('2.1.0')
    expect(result.meta.timezone).toBe('UTC')
    expect(result.meta.overallVelocityCI).toBeNull()
    expect(result.meta.missingDomains).toEqual([])
    expect(result.meta.effectiveDomainsCount).toBe(0)
    expect(result.agingVelocity).toBeNull()
    expect(result.evaluatedAt).toBeNull()
  })

  // Test 5: Response includes both legacy and stable fields
  it('response includes both legacy and stable fields', async () => {
    const result = await callGET()

    // Stable fields
    expect(result.status).toBe('published')
    expect(result.value.overallVelocityStable).toBe(0.9)
    expect(result.value.daysGainedAnnuallyExact).toBe(36.5) // (1 - 0.9) * 365
    expect(result.value.daysGainedAnnuallyLabel).toBe('Gaining')
    expect(result.value.systemVelocitiesStable).toHaveLength(2)
    expect(result.meta.version).toBe('2.1.0')

    // Legacy fields
    expect(result.agingVelocity).toBeDefined()
    expect(result.agingVelocity.overallVelocity).toBe(0.9)
    expect(result.evaluatedAt).toBe(FIXED_ISO)

    // Stable and legacy values match on velocity
    expect(result.value.overallVelocityStable).toBe(result.agingVelocity.overallVelocity)
  })

  // Test 6: Timestamps are ISO strings
  it('timestamps are ISO 8601 strings', async () => {
    const result = await callGET()

    const isoRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/
    expect(result.meta.publishedAt).toMatch(isoRegex)
    expect(result.meta.computedAt).toMatch(isoRegex)
    expect(result.evaluatedAt).toMatch(isoRegex)
  })

  // Test 7: daysGainedAnnuallyDisplay formatting with buckets and copy rules
  it('formats daysGainedAnnuallyDisplay correctly', async () => {
    // Positive bucket=10, medium confidence: "+10"
    let result = await callGET()
    expect(result.value.daysGainedAnnuallyDisplay).toBe('+10')
    expect(result.value.daysGainedAnnuallyLabel).toBe('Gaining')

    // Negative bucket=-15: "-15"
    mockGetLatestSnapshot.mockResolvedValue(
      makeSnapshot({
        publishedVelocity: { ...DEFAULT_VELOCITY, overallVelocity: 1.04, daysGainedAnnually: -15, daysGainedAnnuallyBucket: -15 },
      })
    )
    result = await callGET()
    expect(result.value.daysGainedAnnuallyDisplay).toBe('-15')
    expect(result.value.daysGainedAnnuallyLabel).toBe('Losing')

    // Near-zero bucket=0: "About neutral"
    mockGetLatestSnapshot.mockResolvedValue(
      makeSnapshot({
        publishedVelocity: { ...DEFAULT_VELOCITY, overallVelocity: 1.0, daysGainedAnnually: 0, daysGainedAnnuallyBucket: 0 },
      })
    )
    result = await callGET()
    expect(result.value.daysGainedAnnuallyDisplay).toBe('About neutral')
    expect(result.value.daysGainedAnnuallyLabel).toBe('Neutral')

    // Low confidence: "Estimate stabilizing"
    mockGetLatestSnapshot.mockResolvedValue(
      makeSnapshot({
        publishedVelocity: { ...DEFAULT_VELOCITY, confidence: 'low' as const, daysGainedAnnuallyBucket: 15 },
      })
    )
    result = await callGET()
    expect(result.value.daysGainedAnnuallyDisplay).toBe('Estimate stabilizing')

    // Null velocity
    mockGetLatestSnapshot.mockResolvedValue(
      makeSnapshot({
        publishedVelocity: { ...DEFAULT_VELOCITY, overallVelocity: null, daysGainedAnnually: null, daysGainedAnnuallyBucket: null },
      })
    )
    result = await callGET()
    expect(result.value.daysGainedAnnuallyDisplay).toBeNull()
  })
})

// ─── Tests: Publish Pipeline ────────────────────────────────────────────────

describe('GET /api/health/brain/velocity — publish pipeline', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // Test 8: Multiple evaluates in a day do not change publishedAt
  it('multiple evaluates in a day produce identical publishedAt', async () => {
    // Snapshot was published today at 07:00 — gate should be closed for the rest of the day
    const todayPublishedAt = '2026-02-05T07:00:00.000Z'
    mockGetLatestSnapshot.mockResolvedValue(
      makeSnapshot({ publishedVelocityAt: todayPublishedAt })
    )

    const results = []
    for (let i = 0; i < 5; i++) {
      results.push(await callGET())
    }

    // All responses should have identical publishedAt (today's publish)
    for (const result of results) {
      expect(result.meta.publishedAt).toBe(todayPublishedAt)
    }
    expect(mockEvaluate).not.toHaveBeenCalled()
  })

  // Test 9: Crossing daily publish boundary updates publishedAt
  it('crossing daily boundary produces new publishedAt via evaluate', async () => {
    // First: snapshot with yesterday's publishedAt
    mockGetLatestSnapshot.mockResolvedValue(
      makeSnapshot({ publishedVelocityAt: YESTERDAY_ISO })
    )
    const result1 = await callGET()
    expect(result1.meta.publishedAt).toBe(YESTERDAY_ISO)

    // Now simulate a refresh that triggers evaluate — storeSnapshot will re-evaluate the gate
    // The returned snapshot from evaluate() has today's publishedAt (gate opened for new day)
    const todayPublishedAt = '2026-02-05T08:00:00.000Z'
    mockEvaluate.mockResolvedValue(
      makeSnapshot({
        evaluatedAt: NEWER_ISO,
        velocityComputedAt: NEWER_ISO,
        publishedVelocityAt: todayPublishedAt,
      })
    )

    const result2 = await callGET(
      { refresh: 'true' },
      { 'x-user-action': 'pull_to_refresh' }
    )

    expect(result2.meta.publishedAt).toBe(todayPublishedAt)
    expect(result2.meta.publishedAt).not.toBe(YESTERDAY_ISO)
    expect(mockEvaluate).toHaveBeenCalledTimes(1)
  })

  // Test 10: Unpublished data returns initializing status
  it('snapshot with no published velocity returns initializing', async () => {
    mockGetLatestSnapshot.mockResolvedValue(
      makeSnapshot({
        publishedVelocity: null,
        publishedVelocityAt: null,
      })
    )

    const result = await callGET()

    expect(result.status).toBe('initializing')
    expect(result.value.overallVelocityStable).toBeNull()
    expect(result.value.daysGainedAnnuallyDisplay).toBeNull()
    expect(result.value.systemVelocitiesStable).toEqual([])
    // Meta should still have computedAt even when not published
    expect(result.meta.computedAt).toBe(FIXED_ISO)
    expect(result.meta.publishedAt).toBeNull()
    // Legacy field falls back to computed
    expect(result.agingVelocity).toBeDefined()
    expect(result.agingVelocity.overallVelocity).toBe(0.9)
  })

  // Test 11: debug=true includes computed values
  it('debug=true includes computed values alongside published', async () => {
    // Different computed vs published values
    const differentComputed = { ...DEFAULT_VELOCITY, overallVelocity: 0.85, daysGainedAnnually: 15 }
    mockGetLatestSnapshot.mockResolvedValue(
      makeSnapshot({
        agingVelocity: differentComputed,
        publishedVelocity: DEFAULT_VELOCITY,
        velocityComputedAt: NEWER_ISO,
      })
    )

    const result = await callGET({ debug: 'true' })

    // Published values shown in main response
    expect(result.status).toBe('published')
    expect(result.value.overallVelocityStable).toBe(0.9)

    // Computed values available under debug key
    expect(result.computed).toBeDefined()
    expect(result.computed.agingVelocity.overallVelocity).toBe(0.85)
    expect(result.computed.computedAt).toBe(NEWER_ISO)

    // Without debug flag, computed should not be present
    mockGetLatestSnapshot.mockResolvedValue(
      makeSnapshot({
        agingVelocity: differentComputed,
        publishedVelocity: DEFAULT_VELOCITY,
      })
    )
    const resultNoDebug = await callGET()
    expect(resultNoDebug.computed).toBeUndefined()
  })
})

// ─── Tests: Publish Rules (unit) ────────────────────────────────────────────

describe('shouldPublishVelocity', () => {
  let shouldPublishVelocity: (prev: Date | null, now?: Date) => boolean

  beforeEach(async () => {
    const actual = await vi.importActual<typeof import('@/lib/health-brain')>('@/lib/health-brain')
    shouldPublishVelocity = actual.shouldPublishVelocity
  })

  it('returns false before 06:00 UTC', () => {
    const now = new Date('2026-02-05T05:59:00.000Z')
    expect(shouldPublishVelocity(null, now)).toBe(false)
  })

  it('returns true after 06:00 UTC if never published', () => {
    const now = new Date('2026-02-05T06:00:00.000Z')
    expect(shouldPublishVelocity(null, now)).toBe(true)
  })

  it('returns false if already published today', () => {
    const now = new Date('2026-02-05T10:00:00.000Z')
    const publishedToday = new Date('2026-02-05T07:00:00.000Z')
    expect(shouldPublishVelocity(publishedToday, now)).toBe(false)
  })

  it('returns true if published yesterday and now after 06:00 UTC', () => {
    const now = new Date('2026-02-05T08:00:00.000Z')
    const publishedYesterday = new Date('2026-02-04T07:00:00.000Z')
    expect(shouldPublishVelocity(publishedYesterday, now)).toBe(true)
  })

  it('returns false if published yesterday but now before 06:00 UTC', () => {
    const now = new Date('2026-02-05T03:00:00.000Z')
    const publishedYesterday = new Date('2026-02-04T07:00:00.000Z')
    expect(shouldPublishVelocity(publishedYesterday, now)).toBe(false)
  })

  it('is idempotent — multiple calls with same publishedAt and time return same result', () => {
    const now = new Date('2026-02-05T10:00:00.000Z')
    const publishedToday = new Date('2026-02-05T07:00:00.000Z')
    const results = Array.from({ length: 10 }, () => shouldPublishVelocity(publishedToday, now))
    expect(results.every(r => r === false)).toBe(true)
  })
})

describe('isVelocityPublishable', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let isVelocityPublishable: (v: any, dc: number) => boolean

  beforeEach(async () => {
    const actual = await vi.importActual<typeof import('@/lib/health-brain')>('@/lib/health-brain')
    isVelocityPublishable = actual.isVelocityPublishable
  })

  it('returns true when overallVelocity present and completeness >= 0.2', () => {
    expect(isVelocityPublishable(DEFAULT_VELOCITY, 0.65)).toBe(true)
  })

  it('returns false when overallVelocity is null', () => {
    expect(isVelocityPublishable({ ...DEFAULT_VELOCITY, overallVelocity: null }, 0.65)).toBe(false)
  })

  it('returns false when data completeness < 0.2', () => {
    expect(isVelocityPublishable(DEFAULT_VELOCITY, 0.1)).toBe(false)
  })
})

// ─── Tests: Branded Pace Model (unit) ──────────────────────────────────────

describe('scoreToVelocity', () => {
  let scoreToVelocity: (score: number) => number

  beforeEach(async () => {
    const actual = await vi.importActual<typeof import('@/lib/health-brain')>('@/lib/health-brain')
    scoreToVelocity = actual.scoreToVelocity
  })

  it('is monotonically decreasing: higher score → lower velocity', () => {
    const scores = Array.from({ length: 101 }, (_, i) => i)
    const velocities = scores.map(scoreToVelocity)
    for (let i = 1; i < velocities.length; i++) {
      expect(velocities[i]).toBeLessThanOrEqual(velocities[i - 1])
    }
  })

  it('returns bounded values: 0.85 ≤ velocity ≤ 1.35', () => {
    for (let s = 0; s <= 100; s++) {
      const v = scoreToVelocity(s)
      expect(v).toBeGreaterThanOrEqual(0.85)
      expect(v).toBeLessThanOrEqual(1.35)
    }
  })

  it('returns exact values at breakpoints', () => {
    expect(scoreToVelocity(100)).toBe(0.85)
    expect(scoreToVelocity(90)).toBe(0.85)
    expect(scoreToVelocity(70)).toBe(1.00)
    expect(scoreToVelocity(40)).toBe(1.15)
    expect(scoreToVelocity(0)).toBe(1.30)
  })

  it('clamps out-of-range scores', () => {
    expect(scoreToVelocity(-10)).toBe(1.30)
    expect(scoreToVelocity(110)).toBe(0.85)
  })
})

describe('computeVelocityUncertainty', () => {
  let computeVelocityUncertainty: (c: number, w: number, d: number, t: number) => number

  beforeEach(async () => {
    const actual = await vi.importActual<typeof import('@/lib/health-brain')>('@/lib/health-brain')
    computeVelocityUncertainty = actual.computeVelocityUncertainty
  })

  it('missing domains produce larger uncertainty than full coverage', () => {
    const full = computeVelocityUncertainty(0.8, 5.0, 7, 7)
    const missing = computeVelocityUncertainty(0.8, 4.0, 5, 7)
    expect(missing).toBeGreaterThan(full)
  })

  it('low concordance produces larger uncertainty than high concordance', () => {
    const highConcordance = computeVelocityUncertainty(0.9, 5.0, 7, 7)
    const lowConcordance = computeVelocityUncertainty(0.3, 5.0, 7, 7)
    expect(lowConcordance).toBeGreaterThan(highConcordance)
  })

  it('is bounded at 0.15 maximum', () => {
    const worst = computeVelocityUncertainty(0, 0.5, 1, 7)
    expect(worst).toBeLessThanOrEqual(0.15)
  })
})

describe('computeDomainWeight', () => {
  let computeDomainWeight: (domain: any, systemName: string) => number

  beforeEach(async () => {
    const actual = await vi.importActual<typeof import('@/lib/health-brain')>('@/lib/health-brain')
    computeDomainWeight = actual.computeDomainWeight
  })

  it('high confidence + fresh + stable > low confidence + stale + volatile', () => {
    const highDomain = {
      domain: 'metabolic', score: 80, confidence: 'high' as const,
      trend: 'stable' as const, staleness: 2,
      labContribution: { weight: 0.8, recency: 7, markers: 5 },
      topSignals: [], narrative: '', coherence: null,
      personalBaselineComparison: 'at_personal_norm' as const,
      trajectoryConfidence: 0.8, recommendations: [],
    }
    const lowDomain = {
      domain: 'activity', score: 80, confidence: 'low' as const,
      trend: 'stable' as const, staleness: 120,
      labContribution: null,
      topSignals: [], narrative: '', coherence: null,
      personalBaselineComparison: 'at_personal_norm' as const,
      trajectoryConfidence: 0.3, recommendations: [],
    }
    const highWeight = computeDomainWeight(highDomain, 'metabolic')
    const lowWeight = computeDomainWeight(lowDomain, 'fitness')
    expect(highWeight).toBeGreaterThan(lowWeight)
  })
})

// ─── Tests: Acceptance Criteria ────────────────────────────────────────────

describe('branded pace acceptance criteria', () => {
  let scoreToVelocity: (score: number) => number

  beforeEach(async () => {
    const actual = await vi.importActual<typeof import('@/lib/health-brain')>('@/lib/health-brain')
    scoreToVelocity = actual.scoreToVelocity
  })

  it('5-point single-domain change shifts overall by ≤ 0.02', () => {
    const baseVelocity = scoreToVelocity(70)
    const shiftedVelocity = scoreToVelocity(75)
    // With equal weights across 7 domains:
    const baseOverall = baseVelocity
    const shiftedOverall = (6 * baseVelocity + shiftedVelocity) / 7
    expect(Math.abs(baseOverall - shiftedOverall)).toBeLessThanOrEqual(0.02)
  })

  it('response includes CI, missingDomains, effectiveDomainsCount in meta', async () => {
    vi.clearAllMocks()
    mockGetLatestSnapshot.mockResolvedValue(makeSnapshot())
    const result = await callGET()

    expect(result.meta.overallVelocityCI).toBeDefined()
    expect(Array.isArray(result.meta.overallVelocityCI)).toBe(true)
    expect(result.meta.overallVelocityCI).toHaveLength(2)
    expect(result.meta.overallVelocityCI[0]).toBeLessThanOrEqual(result.meta.overallVelocityCI[1])
    expect(Array.isArray(result.meta.missingDomains)).toBe(true)
    expect(typeof result.meta.effectiveDomainsCount).toBe('number')
  })

  it('missing a major domain widens uncertainty', async () => {
    vi.clearAllMocks()
    // Full coverage
    const fullVelocity = {
      ...DEFAULT_VELOCITY,
      overallVelocityCI: [0.88, 0.92] as [number, number],
      missingDomains: [],
      effectiveDomainsCount: 7,
    }
    mockGetLatestSnapshot.mockResolvedValue(
      makeSnapshot({ publishedVelocity: fullVelocity })
    )
    const fullResult = await callGET()

    // Missing sleep domain — wider CI
    const missingVelocity = {
      ...DEFAULT_VELOCITY,
      overallVelocityCI: [0.82, 0.98] as [number, number],
      missingDomains: ['neuro', 'hormonal', 'bodyComp'],
      effectiveDomainsCount: 4,
    }
    mockGetLatestSnapshot.mockResolvedValue(
      makeSnapshot({ publishedVelocity: missingVelocity })
    )
    const missingResult = await callGET()

    const fullWidth = fullResult.meta.overallVelocityCI[1] - fullResult.meta.overallVelocityCI[0]
    const missingWidth = missingResult.meta.overallVelocityCI[1] - missingResult.meta.overallVelocityCI[0]
    expect(missingWidth).toBeGreaterThan(fullWidth)
  })
})

// ─── Tests: EWMA Smoothing (unit) ──────────────────────────────────────────

describe('computeEWMAAlpha', () => {
  let computeEWMAAlpha: (c: 'high' | 'medium' | 'low', dc: number) => number

  beforeEach(async () => {
    const actual = await vi.importActual<typeof import('@/lib/health-brain')>('@/lib/health-brain')
    computeEWMAAlpha = actual.computeEWMAAlpha
  })

  it('returns 0.25 for high confidence + high completeness', () => {
    expect(computeEWMAAlpha('high', 0.65)).toBe(0.25)
  })

  it('returns 0.18 for medium confidence', () => {
    expect(computeEWMAAlpha('medium', 0.65)).toBe(0.18)
  })

  it('returns 0.18 for high confidence + low completeness', () => {
    expect(computeEWMAAlpha('high', 0.3)).toBe(0.18)
  })

  it('returns 0.12 for low confidence', () => {
    expect(computeEWMAAlpha('low', 0.1)).toBe(0.12)
  })
})

describe('applyVelocityEWMA', () => {
  let applyVelocityEWMA: (prev: number, computed: number, alpha: number) => {
    stableVelocity: number; wasShockCapped: boolean; rawDelta: number
  }

  beforeEach(async () => {
    const actual = await vi.importActual<typeof import('@/lib/health-brain')>('@/lib/health-brain')
    applyVelocityEWMA = actual.applyVelocityEWMA
  })

  it('applies standard EWMA for small deltas', () => {
    const result = applyVelocityEWMA(0.95, 0.93, 0.25)
    // stable = 0.75 * 0.95 + 0.25 * 0.93 = 0.7125 + 0.2325 = 0.945
    expect(result.stableVelocity).toBe(0.95) // rounds to 0.95
    expect(result.wasShockCapped).toBe(false)
  })

  it('caps movement for shocks > 0.12', () => {
    // prev=0.95, computed=1.10 → delta=0.15 > 0.12 threshold
    const result = applyVelocityEWMA(0.95, 1.10, 0.25)
    expect(result.stableVelocity).toBe(1.00) // 0.95 + 0.05 cap
    expect(result.wasShockCapped).toBe(true)
    expect(result.rawDelta).toBe(0.15)
  })

  it('caps negative shocks too', () => {
    const result = applyVelocityEWMA(1.10, 0.90, 0.25)
    expect(result.stableVelocity).toBe(1.05) // 1.10 - 0.05 cap
    expect(result.wasShockCapped).toBe(true)
    expect(result.rawDelta).toBe(-0.20)
  })

  it('no single day moves stable by > 0.05', () => {
    // Test across many scenarios
    const scenarios = [
      { prev: 0.95, computed: 0.80 },  // large negative shock
      { prev: 0.95, computed: 1.20 },  // large positive shock
      { prev: 1.00, computed: 0.85 },  // moderate change
      { prev: 0.90, computed: 0.92 },  // small change
    ]
    for (const { prev, computed } of scenarios) {
      const result = applyVelocityEWMA(prev, computed, 0.25)
      expect(Math.abs(result.stableVelocity - prev)).toBeLessThanOrEqual(0.05 + 1e-10)
    }
  })

  it('converges meaningfully after 7 consistent days', () => {
    // Simulate 7 days of consistent better input (computed=0.90, starting from stable=1.00)
    let stable = 1.00
    const computed = 0.90
    const alpha = 0.25
    for (let day = 0; day < 7; day++) {
      const result = applyVelocityEWMA(stable, computed, alpha)
      stable = result.stableVelocity
    }
    // After 7 days of consistently 0.90 input, stable should have moved meaningfully from 1.00
    expect(stable).toBeLessThan(0.96) // moved at least 0.04 in 7 days
    expect(stable).toBeGreaterThan(0.85) // but not past the input
  })
})

describe('EWMA in response', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('meta.note is null when no shock detected', async () => {
    mockGetLatestSnapshot.mockResolvedValue(makeSnapshot())
    const result = await callGET()
    expect(result.meta.note).toBeNull()
  })

  it('meta.note is present when shock was capped', async () => {
    const shockedVelocity = {
      ...DEFAULT_VELOCITY,
      note: 'Large data change detected; smoothing applied.',
    }
    mockGetLatestSnapshot.mockResolvedValue(
      makeSnapshot({ publishedVelocity: shockedVelocity })
    )
    const result = await callGET()
    expect(result.meta.note).toBe('Large data change detected; smoothing applied.')
  })
})

// ─── Tests: Days Gained Quantization & Hysteresis ──────────────────────────

describe('quantizeDaysGained', () => {
  let quantizeDaysGained: (exact: number, prevBucket: number | null) => number

  beforeEach(async () => {
    const actual = await vi.importActual<typeof import('@/lib/health-brain')>('@/lib/health-brain')
    quantizeDaysGained = actual.quantizeDaysGained
  })

  it('rounds to nearest 5 with no previous bucket', () => {
    expect(quantizeDaysGained(12, null)).toBe(10)
    expect(quantizeDaysGained(13, null)).toBe(15)
    expect(quantizeDaysGained(0, null)).toBe(0)
    expect(quantizeDaysGained(-7, null)).toBe(-5)
    expect(quantizeDaysGained(-8, null)).toBe(-10)
  })

  it('holds previous bucket within hysteresis margin', () => {
    // prevBucket=10, exact=12 → stays at 10 (not far enough to cross)
    expect(quantizeDaysGained(12, 10)).toBe(10)
    // prevBucket=10, exact=8 → stays at 10
    expect(quantizeDaysGained(8, 10)).toBe(10)
    // prevBucket=10, exact=14 → stays at 10 (needs halfBucket + margin = 5.5 away)
    expect(quantizeDaysGained(14, 10)).toBe(10)
  })

  it('moves to new bucket when crossing hysteresis threshold', () => {
    // prevBucket=10, exact moves far enough past next bucket (15.5+ or 1.5-)
    // halfBucket=2.5, margin=3, threshold=5.5
    expect(quantizeDaysGained(16, 10)).toBe(15)
    expect(quantizeDaysGained(3, 10)).toBe(5)
  })

  it('daysDisplay remains stable across small oscillations', () => {
    // Simulate small oscillations around 12
    const exactValues = [12, 11, 13, 12, 14, 11, 13, 12]
    let bucket = quantizeDaysGained(12, null) // initial: 10
    const buckets = [bucket]
    for (let i = 1; i < exactValues.length; i++) {
      bucket = quantizeDaysGained(exactValues[i], bucket)
      buckets.push(bucket)
    }
    // All should stay at the same bucket
    expect(new Set(buckets).size).toBe(1)
  })

  it('small stable velocity changes do not cause daysDisplay to jump', () => {
    // Start at bucket=10, oscillate exact between 8 and 13
    let bucket = 10
    const oscillations = [8, 13, 8, 13, 9, 12, 8, 13]
    for (const exact of oscillations) {
      bucket = quantizeDaysGained(exact, bucket)
    }
    expect(bucket).toBe(10) // should never have left 10
  })
})

describe('formatDaysDisplay', () => {
  let formatDaysDisplay: (bucket: number, confidence: 'high' | 'medium' | 'low') => string

  beforeEach(async () => {
    const actual = await vi.importActual<typeof import('@/lib/health-brain')>('@/lib/health-brain')
    formatDaysDisplay = actual.formatDaysDisplay
  })

  it('returns "Estimate stabilizing" for low confidence', () => {
    expect(formatDaysDisplay(15, 'low')).toBe('Estimate stabilizing')
    expect(formatDaysDisplay(-10, 'low')).toBe('Estimate stabilizing')
  })

  it('returns "About neutral" for buckets in [-5, +5]', () => {
    expect(formatDaysDisplay(0, 'medium')).toBe('About neutral')
    expect(formatDaysDisplay(5, 'high')).toBe('About neutral')
    expect(formatDaysDisplay(-5, 'medium')).toBe('About neutral')
  })

  it('returns signed number for buckets outside neutral zone', () => {
    expect(formatDaysDisplay(10, 'medium')).toBe('+10')
    expect(formatDaysDisplay(15, 'high')).toBe('+15')
    expect(formatDaysDisplay(-10, 'medium')).toBe('-10')
    expect(formatDaysDisplay(-15, 'high')).toBe('-15')
  })
})

describe('getDaysGainedLabel', () => {
  let getDaysGainedLabel: (bucket: number) => string

  beforeEach(async () => {
    const actual = await vi.importActual<typeof import('@/lib/health-brain')>('@/lib/health-brain')
    getDaysGainedLabel = actual.getDaysGainedLabel
  })

  it('returns correct labels', () => {
    expect(getDaysGainedLabel(10)).toBe('Gaining')
    expect(getDaysGainedLabel(15)).toBe('Gaining')
    expect(getDaysGainedLabel(0)).toBe('Neutral')
    expect(getDaysGainedLabel(5)).toBe('Neutral')
    expect(getDaysGainedLabel(-5)).toBe('Neutral')
    expect(getDaysGainedLabel(-10)).toBe('Losing')
    expect(getDaysGainedLabel(-15)).toBe('Losing')
  })
})

// ─── Tests: Velocity Trend (unit) ────────────────────────────────────────────

describe('computeVelocityTrend', () => {
  let computeVelocityTrend: (history: Array<{ date: string; velocity: number }>) => {
    trendDirection: 'improving' | 'worsening' | 'stable'
    delta28d: number | null
    delta28dDays: number | null
  }

  beforeEach(async () => {
    const actual = await vi.importActual<typeof import('@/lib/health-brain')>('@/lib/health-brain')
    computeVelocityTrend = actual.computeVelocityTrend
  })

  it('returns stable with null deltas when < 4 data points', () => {
    const result = computeVelocityTrend([
      { date: '2026-01-01', velocity: 0.95 },
      { date: '2026-01-02', velocity: 0.93 },
    ])
    expect(result.trendDirection).toBe('stable')
    expect(result.delta28d).toBeNull()
    expect(result.delta28dDays).toBeNull()
  })

  it('detects improving trend when velocity decreases over time', () => {
    // Older half averages 1.0, recent half averages 0.95 → delta = -0.05
    const history = [
      { date: '2026-01-01', velocity: 1.00 },
      { date: '2026-01-05', velocity: 1.00 },
      { date: '2026-01-15', velocity: 0.95 },
      { date: '2026-01-20', velocity: 0.95 },
    ]
    const result = computeVelocityTrend(history)
    expect(result.trendDirection).toBe('improving')
    expect(result.delta28d).toBeLessThan(0)
    expect(result.delta28dDays!).toBeGreaterThan(0) // gaining days
  })

  it('detects worsening trend when velocity increases over time', () => {
    const history = [
      { date: '2026-01-01', velocity: 0.95 },
      { date: '2026-01-05', velocity: 0.95 },
      { date: '2026-01-15', velocity: 1.05 },
      { date: '2026-01-20', velocity: 1.05 },
    ]
    const result = computeVelocityTrend(history)
    expect(result.trendDirection).toBe('worsening')
    expect(result.delta28d).toBeGreaterThan(0)
    expect(result.delta28dDays!).toBeLessThan(0) // losing days
  })

  it('returns stable when change is within ±0.005 threshold', () => {
    const history = [
      { date: '2026-01-01', velocity: 0.950 },
      { date: '2026-01-05', velocity: 0.951 },
      { date: '2026-01-15', velocity: 0.952 },
      { date: '2026-01-20', velocity: 0.953 },
    ]
    const result = computeVelocityTrend(history)
    expect(result.trendDirection).toBe('stable')
  })

  it('delta28dDays is positive when improving (gaining days)', () => {
    const history = [
      { date: '2026-01-01', velocity: 1.02 },
      { date: '2026-01-05', velocity: 1.01 },
      { date: '2026-01-15', velocity: 0.96 },
      { date: '2026-01-20', velocity: 0.95 },
    ]
    const result = computeVelocityTrend(history)
    expect(result.trendDirection).toBe('improving')
    // delta28dDays = (olderMean - recentMean) * 365 = positive
    expect(result.delta28dDays!).toBeGreaterThan(0)
  })
})

describe('computeTopDrivers', () => {
  let computeTopDrivers: (
    currentSystems: Record<string, { velocity: number | null; confidence: number }>,
    currentOverall: number,
    previousSystems: Record<string, { velocity: number | null; confidence: number }> | null,
    previousOverall: number | null,
    maxDrivers?: number
  ) => Array<{ domain: string; direction: 'improving' | 'worsening'; magnitude: number; plainEnglishReasonHint: string }>

  beforeEach(async () => {
    const actual = await vi.importActual<typeof import('@/lib/health-brain')>('@/lib/health-brain')
    computeTopDrivers = actual.computeTopDrivers
  })

  it('returns empty when no previous data', () => {
    const current = { cardiovascular: { velocity: 0.90, confidence: 0.8 } }
    expect(computeTopDrivers(current, 0.90, null, null)).toEqual([])
  })

  it('identifies improving domain when its contribution improves', () => {
    const current = {
      cardiovascular: { velocity: 0.85, confidence: 0.8 },
      metabolic: { velocity: 0.95, confidence: 0.7 },
    }
    const previous = {
      cardiovascular: { velocity: 0.95, confidence: 0.8 },
      metabolic: { velocity: 0.95, confidence: 0.7 },
    }
    const drivers = computeTopDrivers(current, 0.90, previous, 0.95)
    const cardioDriver = drivers.find(d => d.domain === 'cardiovascular')
    expect(cardioDriver).toBeDefined()
    expect(cardioDriver!.direction).toBe('improving')
    expect(cardioDriver!.plainEnglishReasonHint).toContain('improved')
  })

  it('limits to maxDrivers', () => {
    const current = {
      cardiovascular: { velocity: 0.80, confidence: 0.8 },
      metabolic: { velocity: 0.80, confidence: 0.7 },
      inflammatory: { velocity: 0.80, confidence: 0.9 },
      fitness: { velocity: 0.80, confidence: 0.6 },
    }
    const previous = {
      cardiovascular: { velocity: 1.00, confidence: 0.8 },
      metabolic: { velocity: 1.00, confidence: 0.7 },
      inflammatory: { velocity: 1.00, confidence: 0.9 },
      fitness: { velocity: 1.00, confidence: 0.6 },
    }
    const drivers = computeTopDrivers(current, 0.80, previous, 1.00, 2)
    expect(drivers.length).toBeLessThanOrEqual(2)
  })

  it('sorts by magnitude descending', () => {
    const current = {
      cardiovascular: { velocity: 0.85, confidence: 0.8 },
      metabolic: { velocity: 0.80, confidence: 0.9 },
    }
    const previous = {
      cardiovascular: { velocity: 0.90, confidence: 0.8 },
      metabolic: { velocity: 0.95, confidence: 0.9 },
    }
    const drivers = computeTopDrivers(current, 0.83, previous, 0.93)
    if (drivers.length >= 2) {
      expect(drivers[0].magnitude).toBeGreaterThanOrEqual(drivers[1].magnitude)
    }
  })
})

// ─── Tests: Trend in Response ────────────────────────────────────────────────

describe('trend fields in response', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('published response includes trend fields in meta', async () => {
    mockGetLatestSnapshot.mockResolvedValue(makeSnapshot())
    const result = await callGET()

    expect(result.meta.trendDirection).toBe('improving')
    expect(result.meta.delta28d).toBe(-0.01)
    expect(result.meta.delta28dDays).toBe(4)
    expect(result.meta.topDrivers).toHaveLength(1)
    expect(result.meta.topDrivers[0].domain).toBe('cardiovascular')
  })

  it('initializing response has null/undefined trend fields', async () => {
    mockGetLatestSnapshot.mockResolvedValue(null)
    const result = await callGET()

    expect(result.meta.delta28d).toBeNull()
    expect(result.meta.delta28dDays).toBeNull()
  })

  it('legacy trend field maps from trendDirection', async () => {
    // improving → decelerating
    mockGetLatestSnapshot.mockResolvedValue(makeSnapshot({
      publishedVelocity: { ...DEFAULT_VELOCITY, trendDirection: 'improving' as const, trend: 'decelerating' as const },
    }))
    let result = await callGET()
    expect(result.agingVelocity.trend).toBe('decelerating')

    // worsening → accelerating
    mockGetLatestSnapshot.mockResolvedValue(makeSnapshot({
      publishedVelocity: { ...DEFAULT_VELOCITY, trendDirection: 'worsening' as const, trend: 'accelerating' as const },
    }))
    result = await callGET()
    expect(result.agingVelocity.trend).toBe('accelerating')
  })
})

// ─── Property Tests: Integrity Guardrails ─────────────────────────────────

describe('scoreToVelocity — property tests', () => {
  let scoreToVelocity: (score: number) => number

  beforeEach(async () => {
    const actual = await vi.importActual<typeof import('@/lib/health-brain')>('@/lib/health-brain')
    scoreToVelocity = actual.scoreToVelocity
  })

  it('is monotonically non-increasing across full score range at 0.1 granularity', () => {
    let prev = scoreToVelocity(0)
    for (let s = 0.1; s <= 100; s += 0.1) {
      const v = scoreToVelocity(s)
      expect(v).toBeLessThanOrEqual(prev + 0.001) // floating-point tolerance
      prev = v
    }
  })

  it('adjacent integer scores differ by at most 0.02', () => {
    for (let s = 0; s < 100; s++) {
      const diff = Math.abs(scoreToVelocity(s) - scoreToVelocity(s + 1))
      expect(diff).toBeLessThanOrEqual(0.02)
    }
  })

  it('output is always within [0.85, 1.35]', () => {
    for (let s = -10; s <= 110; s++) {
      const v = scoreToVelocity(s)
      expect(v).toBeGreaterThanOrEqual(0.85)
      expect(v).toBeLessThanOrEqual(1.35)
    }
  })
})

describe('applyVelocityEWMA — smooth response properties', () => {
  let applyVelocityEWMA: (prev: number, computed: number, alpha: number) => {
    stableVelocity: number; wasShockCapped: boolean; rawDelta: number
  }

  beforeEach(async () => {
    const actual = await vi.importActual<typeof import('@/lib/health-brain')>('@/lib/health-brain')
    applyVelocityEWMA = actual.applyVelocityEWMA
  })

  it('output never moves more than 0.05 from previous in any scenario', () => {
    const prevValues = [0.75, 0.85, 0.95, 1.00, 1.10, 1.20, 1.35]
    const computedValues = [0.75, 0.85, 0.95, 1.00, 1.10, 1.20, 1.35]
    const alphas = [0.12, 0.18, 0.25]
    for (const prev of prevValues) {
      for (const computed of computedValues) {
        for (const alpha of alphas) {
          const result = applyVelocityEWMA(prev, computed, alpha)
          expect(Math.abs(result.stableVelocity - prev)).toBeLessThanOrEqual(0.05 + 1e-9)
        }
      }
    }
  })

  it('converges toward computed value over 30 consistent days', () => {
    let stable = 1.00
    const computed = 0.90
    for (let day = 0; day < 30; day++) {
      const result = applyVelocityEWMA(stable, computed, 0.25)
      stable = result.stableVelocity
    }
    expect(Math.abs(stable - computed)).toBeLessThanOrEqual(0.02 + 1e-9)
  })

  it('shock-capped result always moves toward computed value', () => {
    // Large positive shock
    const up = applyVelocityEWMA(0.90, 1.20, 0.25)
    expect(up.wasShockCapped).toBe(true)
    expect(up.stableVelocity).toBeGreaterThan(0.90)

    // Large negative shock
    const down = applyVelocityEWMA(1.10, 0.80, 0.25)
    expect(down.wasShockCapped).toBe(true)
    expect(down.stableVelocity).toBeLessThan(1.10)
  })

  it('does not oscillate with alternating inputs', () => {
    let stable = 1.00
    const positions: number[] = []
    for (let i = 0; i < 20; i++) {
      const computed = i % 2 === 0 ? 0.90 : 1.10
      const result = applyVelocityEWMA(stable, computed, 0.18)
      stable = result.stableVelocity
      positions.push(stable)
    }
    // After 20 alternating inputs, value should stay near 1.00 (average of 0.90 and 1.10)
    const last = positions[positions.length - 1]
    expect(Math.abs(last - 1.00)).toBeLessThan(0.05)
  })
})

describe('missing data resilience', () => {
  let computeVelocityUncertainty: (c: number, w: number, d: number, t: number) => number

  beforeEach(async () => {
    const actual = await vi.importActual<typeof import('@/lib/health-brain')>('@/lib/health-brain')
    computeVelocityUncertainty = actual.computeVelocityUncertainty
  })

  it('uncertainty increases monotonically as domains are removed', () => {
    const total = 7
    let prev = computeVelocityUncertainty(0.8, 5.0, 7, total)
    for (let d = 6; d >= 1; d--) {
      const weightSum = d * 0.7
      const current = computeVelocityUncertainty(0.8, weightSum, d, total)
      expect(current).toBeGreaterThanOrEqual(prev)
      prev = current
    }
  })

  it('uncertainty is always in [0.02, 0.15]', () => {
    const concordances = [0, 0.3, 0.5, 0.7, 1.0]
    const weights = [0.5, 1.0, 2.0, 4.0, 6.0]
    const domainCounts = [1, 3, 5, 7]
    for (const c of concordances) {
      for (const w of weights) {
        for (const d of domainCounts) {
          const u = computeVelocityUncertainty(c, w, d, 7)
          expect(u).toBeGreaterThanOrEqual(0.02)
          expect(u).toBeLessThanOrEqual(0.15)
        }
      }
    }
  })

  it('zero concordance produces higher uncertainty than perfect concordance', () => {
    const zeroConcordance = computeVelocityUncertainty(0, 3.0, 5, 7)
    const perfectConcordance = computeVelocityUncertainty(1.0, 3.0, 5, 7)
    expect(zeroConcordance).toBeGreaterThan(perfectConcordance)
  })
})

describe('version constant', () => {
  it('VELOCITY_PIPELINE_VERSION is 2.1.0', async () => {
    const actual = await vi.importActual<typeof import('@/lib/health-brain')>('@/lib/health-brain')
    expect(actual.VELOCITY_PIPELINE_VERSION).toBe('2.1.0')
  })

  it('initializing response uses the constant version', async () => {
    vi.clearAllMocks()
    mockGetLatestSnapshot.mockResolvedValue(null)
    const result = await callGET()
    expect(result.meta.version).toBe('2.1.0')
  })

  it('published response carries version from snapshot', async () => {
    vi.clearAllMocks()
    mockGetLatestSnapshot.mockResolvedValue(makeSnapshot({
      velocityVersion: '2.1.0',
    }))
    const result = await callGET()
    expect(result.meta.version).toBe('2.1.0')
  })
})
