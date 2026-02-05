/**
 * GET /api/health/mechanism
 *
 * Protocol Mechanism Detail Endpoint
 *
 * Returns the full mechanism detail from the protocol-mechanisms database
 * for a given peptide/supplement.
 *
 * Query Parameters:
 *   peptideId?: string    - Look up by peptide database ID
 *   peptideName?: string  - Look up by peptide name (fuzzy matched)
 *
 * At least one of peptideId or peptideName must be provided.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUserId } from '@/lib/api-auth'
import prisma from '@/lib/prisma'
import {
  findProtocolMechanism,
  type ProtocolMechanism,
} from '@/lib/protocol-mechanisms'

export const dynamic = 'force-dynamic'

// Map internal evidence level names to the response format
function mapEvidenceLevel(
  level: ProtocolMechanism['evidenceLevel']
): string {
  switch (level) {
    case 'clinical_trials': return 'strong'
    case 'preclinical': return 'moderate'
    case 'anecdotal': return 'emerging'
    case 'theoretical': return 'theoretical'
    default: return 'unknown'
  }
}

export async function GET(request: NextRequest) {
  try {
    // Authenticate user
    const authResult = await getAuthenticatedUserId()
    if (!authResult.success) {
      return authResult.response
    }

    // Parse query parameters
    const { searchParams } = new URL(request.url)
    const peptideId = searchParams.get('peptideId')
    const peptideName = searchParams.get('peptideName')

    if (!peptideId && !peptideName) {
      return NextResponse.json(
        { error: 'Either peptideId or peptideName query parameter is required' },
        { status: 400 }
      )
    }

    // Resolve the protocol name
    let resolvedName: string | null = null

    if (peptideId) {
      // Look up the peptide by ID in the database to get its name
      const peptide = await prisma.peptide.findUnique({
        where: { id: peptideId },
        select: { name: true },
      })
      if (!peptide) {
        return NextResponse.json(
          { error: 'Peptide not found for the given peptideId' },
          { status: 404 }
        )
      }
      resolvedName = peptide.name
    } else if (peptideName) {
      resolvedName = peptideName
    }

    if (!resolvedName) {
      return NextResponse.json(
        { error: 'Could not resolve protocol name' },
        { status: 400 }
      )
    }

    // Look up the mechanism data using fuzzy matching
    const mechanism = findProtocolMechanism(resolvedName)

    if (!mechanism) {
      return NextResponse.json(
        { error: `No mechanism data found for "${resolvedName}"` },
        { status: 404 }
      )
    }

    // Build the mechanisms array from expectedEffects + insight templates
    const mechanisms = Object.entries(mechanism.expectedEffects).map(
      ([effectKey, effect]) => {
        // Use the mechanismDetail as description, or fall back to the improving template
        const description =
          effect.mechanismDetail ||
          mechanism.insightTemplates.improving.replace(/\{metric\}/g, effectKey).replace(/\{change\}/g, '')

        return {
          name: effectKey,
          description,
          evidenceLevel: mapEvidenceLevel(mechanism.evidenceLevel),
          expectedMetrics: effect.metrics,
          expectedTimeline: {
            onsetWeeks: effect.timelineWeeks[0],
            peakWeeks: effect.timelineWeeks[1],
            plateauWeeks: Math.round(effect.timelineWeeks[1] * 1.5),
          },
        }
      }
    )

    // Build synergies array by looking up synergy protocols in the database
    const synergies = (mechanism.synergyWith || []).map(synergyName => {
      const synergyMechanism = findProtocolMechanism(synergyName)

      // Describe the synergy based on shared mechanism categories
      let effect = 'complementary'
      let description = `May complement ${mechanism.name} when used together.`

      if (synergyMechanism) {
        // Find overlapping effect categories
        const ourEffects = new Set(Object.keys(mechanism.expectedEffects))
        const theirEffects = new Set(Object.keys(synergyMechanism.expectedEffects))
        const shared = [...ourEffects].filter(e => theirEffects.has(e))

        if (shared.length > 0) {
          effect = 'synergistic'
          description = `Synergistic effects on ${shared.join(', ')}. ${synergyMechanism.name} works through: ${synergyMechanism.mechanisms.slice(0, 2).join('; ')}.`
        } else {
          effect = 'complementary'
          description = `${synergyMechanism.name} targets different pathways (${Object.keys(synergyMechanism.expectedEffects).join(', ')}), providing complementary support.`
        }
      }

      return {
        withProtocol: synergyName,
        effect,
        description,
      }
    })

    // Gather all monitor metrics (primary + secondary)
    const monitorMetrics = [
      ...mechanism.monitorMetrics,
      ...(mechanism.secondaryMetrics || []),
    ]

    // Confound factors
    const confoundFactors = mechanism.confounds || []

    return NextResponse.json(
      {
        protocolName: mechanism.name,
        category: mechanism.category,
        mechanismPathways: mechanism.mechanisms,
        mechanisms,
        synergies,
        monitorMetrics,
        confoundFactors,
        evidenceLevel: mapEvidenceLevel(mechanism.evidenceLevel),
        researchNotes: mechanism.researchNotes || [],
        contraindications: mechanism.contraindications || [],
      },
      {
        headers: {
          // Mechanism data is static, cache for 1 hour
          'Cache-Control': 'private, max-age=3600',
        },
      }
    )
  } catch (error) {
    console.error('Error fetching mechanism detail:', error)
    return NextResponse.json(
      { error: 'Failed to fetch mechanism detail' },
      { status: 500 }
    )
  }
}
