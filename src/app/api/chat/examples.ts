// ─── Few-Shot Examples for Generator ────────────────────────────────────────
// These are the single biggest quality lever. Each example demonstrates:
//   - No markdown headings (no #, ##, ###)
//   - No "blog post" structure
//   - Short, skimmable paragraphs
//   - Exactly one caveat at the end
//   - Max 3 questions when clarification is needed

import type { AssistantStructuredResponse } from './schemas'

interface FewShotExample {
  label: string
  user_message: string
  context_summary: string
  response: AssistantStructuredResponse
}

export const FEW_SHOT_EXAMPLES: FewShotExample[] = [
  // ── 1. Missing timeline — ask questions + conditional plan ──
  {
    label: 'optimize_timing_missing_timeline',
    user_message:
      'I want to optimize my BPC-157 timing to maximize recovery before my trip.',
    context_summary:
      'Active: BPC-157 500mcg daily morning. No trip date in profile.',
    response: {
      acknowledgment:
        'Good thinking — timing BPC-157 around a specific event can make a meaningful difference.',
      assumptions: [],
      questions: [
        'When is your trip?',
        'What kind of recovery are you targeting — injury, gut, or general tissue repair?',
        'How long have you been on your current protocol?',
      ],
      recommendation_paragraphs: [
        'If your trip is 2-4 weeks out, you have enough runway to see meaningful tissue repair effects. The key is consistent daily dosing without breaks.',
        'If it is less than a week away, the main benefit will be anti-inflammatory rather than structural repair, which takes longer to accumulate.',
      ],
      timeline_notes: [
        '2-4 weeks: expect noticeable recovery improvements',
        'Under 1 week: anti-inflammatory benefit only',
      ],
      watch_for: [
        'Injection site redness lasting more than 24 hours',
        'Any new joint pain or stiffness',
        'Digestive changes if switching to oral dosing for travel',
      ],
      caveat:
        'Adjust based on your clinician\'s guidance, especially if combining with other compounds.',
    },
  },

  // ── 2. Same request WITH timeline + experience ──
  {
    label: 'optimize_timing_full_context',
    user_message:
      'I want to maximize my BPC-157 recovery before my trip on March 15. Been on it 3 weeks for a shoulder injury.',
    context_summary:
      'Active: BPC-157 500mcg daily morning, started Feb 1. Shoulder injury noted.',
    response: {
      acknowledgment:
        'You have about 6 weeks of runway before March 15, and 3 weeks of tissue-level accumulation already working for you.',
      assumptions: [
        'Shoulder injury is the primary recovery target',
        'Current 500mcg daily dose is clinician-prescribed',
      ],
      questions: [],
      recommendation_paragraphs: [
        'At 3 weeks in, you are past the initial loading phase where BPC-157 upregulates growth factor expression. Weeks 4-6 are where you typically see the most noticeable functional improvement — reduced pain during movement, better range of motion.',
        'Keep your current 500mcg morning dose consistent. If you are doing physical therapy or mobility work, timing your dose 30-60 minutes before those sessions can help since BPC-157 concentrations peak around that window.',
        'For the last week before your trip, maintain the protocol rather than tapering. There is no rebound effect from stopping, but consistent dosing through departure gives you the best cumulative benefit.',
      ],
      timeline_notes: [
        'Weeks 4-5: expect most noticeable functional gains',
        'Week 6 (pre-trip): maintain dose, no need to taper',
        'Travel: can skip doses for a few days without losing progress',
      ],
      watch_for: [
        'Shoulder ROM improvements — track before/after PT sessions',
        'Sleep quality changes (BPC-157 can subtly improve sleep)',
        'If pain increases despite protocol, that warrants reassessment',
      ],
      caveat:
        'These timelines reflect typical responses — individual results vary based on injury severity and overall health.',
    },
  },

  // ── 3. Clinician dose + create protocol mode ──
  {
    label: 'create_protocol_full_info',
    user_message:
      'My doctor prescribed Semaglutide 0.25mg weekly for 4 weeks then 0.5mg. Start date January 6.',
    context_summary: 'No active Semaglutide protocol. User has clinician prescription.',
    response: {
      acknowledgment:
        'Got it — your clinician has you on a standard Semaglutide titration schedule.',
      assumptions: [
        'Subcutaneous injection, weekly dosing',
        'Titration: 0.25mg weeks 1-4, then 0.5mg ongoing',
        'Start date: January 6',
      ],
      questions: [
        'Do you have a preferred injection day of the week?',
      ],
      recommendation_paragraphs: [
        'I can set up your protocol starting at 0.25mg weekly from January 6. After 4 weeks, you will want to update the dose to 0.5mg — I will remind you when that date approaches.',
        'For tracking purposes, logging your injection day consistently helps the app calculate adherence and remind you at the right time.',
      ],
      timeline_notes: [
        'Jan 6 - Feb 3: 0.25mg weekly (loading phase)',
        'Feb 3 onward: 0.5mg weekly (therapeutic dose)',
      ],
      watch_for: [
        'Nausea in the first 1-2 weeks is common and usually resolves',
        'Appetite reduction is expected and a sign of therapeutic effect',
        'Injection site reactions — rotate sites each week',
        'Report persistent vomiting or severe GI discomfort to your prescriber',
      ],
      caveat:
        'Follow your prescriber\'s titration schedule — do not adjust doses without their guidance.',
    },
  },

  // ── 4. Generic "what dose" — asks clarifiers ──
  {
    label: 'dosing_question_generic',
    user_message: 'What dose of magnesium should I take?',
    context_summary: 'No magnesium protocol active. Goal: sleep optimization.',
    response: {
      acknowledgment:
        'Magnesium is a solid choice, especially with your sleep optimization focus.',
      assumptions: [],
      questions: [
        'Are you targeting sleep quality, muscle recovery, or general health?',
        'Have you taken magnesium before, and if so, which form?',
      ],
      recommendation_paragraphs: [
        'For sleep, magnesium glycinate at 200-400mg taken 30-60 minutes before bed is well-supported. It crosses the blood-brain barrier more effectively than other forms and has the least GI side effect risk.',
        'If you are also looking for muscle recovery, magnesium threonate has some evidence for both sleep and cognitive function, though it is more expensive.',
      ],
      timeline_notes: [
        'Sleep effects typically noticeable within 3-7 days',
        'Full steady-state benefit at 2-3 weeks',
      ],
      watch_for: [
        'Loose stools — usually means the dose is too high or the form does not agree with you',
        'Daytime drowsiness if taking too close to morning',
      ],
      caveat:
        'Start at the lower end of the range and adjust based on how you feel.',
    },
  },

  // ── 5. Side effects reported ──
  {
    label: 'troubleshooting_side_effects',
    user_message:
      'I have been getting headaches since starting TB-500 three days ago.',
    context_summary:
      'Active: TB-500 2.5mg 2x/week subQ, started 3 days ago. Also on BPC-157.',
    response: {
      acknowledgment:
        'Headaches in the first few days of TB-500 are reported by some users, though not universally.',
      assumptions: [
        'You are taking 2.5mg twice weekly as shown in your protocol',
        'Headaches started after the first or second dose',
      ],
      questions: [
        'Are the headaches constant or do they peak a few hours after injection?',
      ],
      recommendation_paragraphs: [
        'TB-500 can cause transient headaches, especially during the loading phase. This is thought to be related to its vasodilatory and tissue-repair signaling effects. For most users, this resolves within the first 1-2 weeks as the body adjusts.',
        'Make sure you are well-hydrated — dehydration amplifies this effect. If headaches are dose-timed (peaking 2-4 hours post-injection), that pattern further suggests a transient vascular response rather than something concerning.',
      ],
      timeline_notes: [
        'Typically resolves within 7-14 days',
        'If persistent beyond 2 weeks, reassess with your clinician',
      ],
      watch_for: [
        'Headache timing relative to injection — note this in your dose logs',
        'Visual changes or severe headache — stop and contact your prescriber immediately',
        'Fatigue or brain fog alongside headaches',
        'Any swelling at injection sites',
      ],
      caveat:
        'If headaches are severe or worsening, pause and consult your prescriber before continuing.',
    },
  },

  // ── 6. Lab interpretation ──
  {
    label: 'lab_interpretation',
    user_message: 'My testosterone came back at 380 ng/dL. Is that low?',
    context_summary:
      'Lab results: Total T 380 ng/dL (ref 264-916). Age not provided. Active: no hormonal protocols.',
    response: {
      acknowledgment:
        'Your total testosterone of 380 ng/dL is within the reference range but on the lower end.',
      assumptions: [
        'This is a fasting morning draw (standard for testosterone)',
        'No current testosterone-related protocols',
      ],
      questions: [
        'What time was the blood draw? Testosterone is highest in the early morning.',
        'Have you had previous testosterone levels to compare against?',
      ],
      recommendation_paragraphs: [
        'While 380 is technically within the 264-916 reference range, "normal" varies a lot by age and individual baseline. Many clinicians consider levels below 400 in younger men worth investigating further, especially if you have symptoms like fatigue, low motivation, or poor recovery.',
        'Before drawing conclusions from one reading, a second morning fasting draw (ideally before 9am) would confirm whether this is your true baseline or a one-off dip.',
      ],
      timeline_notes: [
        'Retest in 4-6 weeks for confirmation',
        'Request free testosterone and SHBG if not already tested',
      ],
      watch_for: [
        'Symptoms: persistent fatigue, low libido, difficulty recovering from workouts',
        'Sleep quality — poor sleep directly suppresses testosterone',
        'Stress and overtraining can transiently lower levels',
      ],
      caveat:
        'A single lab value in isolation is not diagnostic — trends and symptoms matter more than any one number.',
    },
  },

  // ── 7. Education question ──
  {
    label: 'education_mechanism',
    user_message: 'How does BPC-157 actually work?',
    context_summary: 'Active: BPC-157 500mcg daily. Has been on it 2 weeks.',
    response: {
      acknowledgment:
        'Great question — understanding the mechanism helps you set realistic expectations for your protocol.',
      assumptions: [],
      questions: [],
      recommendation_paragraphs: [
        'BPC-157 is a synthetic peptide derived from a protective protein found in gastric juice. It works primarily through upregulating growth factors like VEGF (which promotes blood vessel formation) and FAK-paxillin (which supports cell migration to injury sites). This is why it is studied for tendon, ligament, muscle, and gut healing.',
        'It also modulates the nitric oxide system, which influences inflammation and blood flow. The practical effect is accelerated tissue repair and reduced inflammation at both the injection site and systemically.',
        'At 2 weeks into your protocol, you are past the initial signaling phase. The repair cascades BPC-157 initiates take time to produce visible results — most users report noticeable improvement between weeks 3-6.',
      ],
      timeline_notes: [],
      watch_for: [
        'Gradual improvement, not sudden — tissue repair is incremental',
        'Your adherence is key — consistent daily dosing maintains growth factor upregulation',
      ],
      caveat:
        'Most BPC-157 evidence comes from animal studies — human clinical trial data is still limited.',
    },
  },

  // ── 8. Low adherence encouragement ──
  {
    label: 'adherence_low',
    user_message: 'I keep forgetting my evening dose.',
    context_summary:
      'Active: Magnesium glycinate 400mg evening. 30-day adherence: 45%. Mostly skipped evening doses.',
    response: {
      acknowledgment:
        'At 45% adherence, your evening magnesium is not getting a fair shot at working for you.',
      assumptions: [
        'The missed doses are evening timing, not the supplement itself',
      ],
      questions: [
        'Would shifting to a bedtime routine trigger work better — like placing it next to your toothbrush?',
      ],
      recommendation_paragraphs: [
        'The good news: magnesium glycinate for sleep works best when taken consistently, and even getting back to 80%+ adherence should show you results within a week. The bad news: at 45%, you are below the threshold where most people notice a difference.',
        'Two practical fixes that work for most people: anchor it to an existing habit (brush teeth, then take magnesium) or set the notification 30 minutes before your target bedtime so it hits the right window.',
      ],
      timeline_notes: [
        'At 80%+ adherence: expect sleep improvements within 5-7 days',
      ],
      watch_for: [
        'Track your sleep quality on nights you take it vs nights you skip',
        'If you genuinely cannot stick to evenings, morning dosing still helps — just less for sleep specifically',
      ],
      caveat:
        'Consistency matters more than perfection — aim for most nights rather than every night.',
    },
  },

  // ── 9. Stack interaction question ──
  {
    label: 'stack_interaction',
    user_message: 'Can I take NAC with my current stack?',
    context_summary:
      'Active: BPC-157 500mcg daily, Zinc 30mg daily, Vitamin D 5000IU daily. Goal: recovery.',
    response: {
      acknowledgment:
        'NAC pairs well with your current recovery-focused stack — no concerning interactions.',
      assumptions: [
        'Standard NAC dosing (600-1200mg/day)',
        'Oral form',
      ],
      questions: [],
      recommendation_paragraphs: [
        'NAC (N-Acetyl Cysteine) is a glutathione precursor that supports antioxidant defense and detoxification. With your recovery focus, it complements BPC-157 nicely — BPC-157 handles tissue repair signaling while NAC supports the cellular environment that allows repair to happen efficiently.',
        'Take NAC on an empty stomach for best absorption, ideally 30 minutes before a meal. It can be taken at a different time than your other supplements. A common dose is 600mg once or twice daily.',
      ],
      timeline_notes: [
        'Antioxidant effects within days',
        'Full glutathione optimization at 2-4 weeks',
      ],
      watch_for: [
        'GI discomfort — take with water if this occurs',
        'Sulfur smell in urine is normal and harmless',
        'If you are on any medications, check with your pharmacist — NAC can interact with nitroglycerin and some blood thinners',
      ],
      caveat:
        'No known negative interactions with your current stack at standard doses.',
    },
  },

  // ── 10. Vague question — needs goal clarification ──
  {
    label: 'vague_help_me',
    user_message: 'Help me optimize my protocol.',
    context_summary:
      'Active: BPC-157 500mcg daily, TB-500 2.5mg 2x/week. Adherence: 88%. No stated goal.',
    response: {
      acknowledgment:
        'Happy to help optimize — your adherence at 88% is solid, so we are building on a good foundation.',
      assumptions: [],
      questions: [
        'What is your primary goal — faster injury recovery, performance, or something else?',
        'Are you seeing results you are happy with, or is something falling short?',
        'Any upcoming events or deadlines driving the optimization?',
      ],
      recommendation_paragraphs: [
        'Your BPC-157 and TB-500 combination is a well-established recovery stack. Without knowing your specific goal, I can share that timing your BPC-157 dose 30-60 minutes before any physical therapy or training tends to maximize localized benefit, and keeping TB-500 doses spaced 3-4 days apart ensures steady systemic coverage.',
      ],
      timeline_notes: [],
      watch_for: [
        'Track which metrics matter most to you — HRV, pain levels, ROM',
        'Note any changes when adjusting timing',
      ],
      caveat:
        'Once I know your goal, I can give much more targeted timing and dose optimization advice.',
    },
  },

  // ── 11. Thermal session question ──
  {
    label: 'thermal_session_advice',
    user_message: 'Should I do cold plunge before or after my workout?',
    context_summary:
      'Recent thermal: cold plunge 3 min at 50F, 2 days ago. Goal: performance.',
    response: {
      acknowledgment:
        'This is one of the most debated timing questions in performance optimization, and the answer depends on your goal for that specific workout.',
      assumptions: [
        'You are doing resistance training (not just cardio)',
        'Performance and hypertrophy are priorities',
      ],
      questions: [],
      recommendation_paragraphs: [
        'If your session is strength or hypertrophy focused, do the cold plunge at least 4 hours after training or on a separate day. Cold exposure blunts the inflammatory response that drives muscle adaptation — the very signal your muscles need to grow. Multiple studies show reduced hypertrophy gains when cold water immersion follows resistance training.',
        'If your session is endurance, skill, or recovery focused, cold plunge after is fine and may even help with next-day readiness. The anti-inflammatory effect that hurts hypertrophy actually helps with faster recovery between endurance sessions.',
        'Your 3-minute, 50F protocol is a good duration and temperature. For performance goals, try scheduling it on rest days or mornings before an evening workout.',
      ],
      timeline_notes: [
        'Minimum 4-hour gap after strength training',
        'Morning cold + evening training is an effective split',
      ],
      watch_for: [
        'If you notice strength stalling, move cold plunge to rest days only',
        'Track your HRV the morning after cold plunge days vs non-plunge days',
        'Numbness beyond 5 minutes post-plunge — reduce duration or raise temperature',
      ],
      caveat:
        'These guidelines reflect current exercise physiology research — personal response varies.',
    },
  },

  // ── 12. Protocol with missing dose source ──
  {
    label: 'dosing_no_source',
    user_message: 'I want to start a GHK-Cu protocol. What dose should I use?',
    context_summary: 'No active GHK-Cu protocol. No clinician reference.',
    response: {
      acknowledgment:
        'GHK-Cu is an interesting copper peptide with evidence for skin, tissue repair, and anti-inflammatory effects.',
      assumptions: [],
      questions: [
        'Has a clinician prescribed or recommended GHK-Cu for you?',
        'What is your primary goal — skin/anti-aging, wound healing, or systemic recovery?',
        'Are you planning subcutaneous injection, topical, or another route?',
      ],
      recommendation_paragraphs: [
        'Dosing for GHK-Cu varies significantly by route and goal. Topical formulations (creams, serums) use very different concentrations than injectable protocols, and the evidence base differs for each. I want to give you accurate guidance rather than a generic number.',
        'Once I know your route and whether you have a clinician involved, I can share what the research and community experience suggest for your specific use case.',
      ],
      timeline_notes: [],
      watch_for: [
        'GHK-Cu is generally well-tolerated but can cause local irritation',
        'Copper peptides should not be combined with strong acids (like vitamin C serums) topically',
      ],
      caveat:
        'I can share research-backed dosing ranges, but your clinician should confirm the final protocol.',
    },
  },
]

// Build the few-shot messages array for the generator prompt
export function buildFewShotMessages(): Array<{
  role: 'user' | 'assistant'
  content: string
}> {
  const messages: Array<{ role: 'user' | 'assistant'; content: string }> = []

  // Include 4 diverse examples (balancing quality with token cost)
  const selected = [
    FEW_SHOT_EXAMPLES[0], // missing timeline
    FEW_SHOT_EXAMPLES[1], // full context
    FEW_SHOT_EXAMPLES[4], // side effects
    FEW_SHOT_EXAMPLES[9], // vague question
  ]

  for (const ex of selected) {
    messages.push({
      role: 'user',
      content: `[Context: ${ex.context_summary}]\n${ex.user_message}`,
    })
    messages.push({
      role: 'assistant',
      content: JSON.stringify(ex.response),
    })
  }

  return messages
}
