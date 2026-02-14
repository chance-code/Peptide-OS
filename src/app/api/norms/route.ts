import { NORMATIVE_TABLES, NORMATIVE_TABLES_VERSION } from '@/lib/normative-tables'
import { NextResponse } from 'next/server'

/**
 * GET /api/norms
 *
 * Returns versioned normative reference tables for Health Capital banding.
 * Public endpoint — no auth required (published clinical reference data).
 * Tables include VO2max, resting heart rate, waist circumference, and body fat %.
 */
export async function GET() {
  return NextResponse.json(
    { version: NORMATIVE_TABLES_VERSION, tables: NORMATIVE_TABLES },
    { headers: { 'Cache-Control': 'public, max-age=86400' } }
  )
}
