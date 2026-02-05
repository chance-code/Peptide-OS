// Protocol Mechanisms Database
// Evidence-based mechanism data for peptides and supplements
// Used for generating contextual health insights
// Last updated: 2026-02-04 with comprehensive research

import { normalizeProtocolName } from './supplement-normalization'

export interface ProtocolMechanism {
  name: string
  category: 'peptide' | 'supplement' | 'medication'
  mechanisms: string[]
  expectedEffects: Record<string, {
    direction: 'improve' | 'decline' | 'stable'
    metrics: string[]
    timelineWeeks: [number, number] // [min, max] weeks to see effect
    timelineDays?: [number, number] // More precise timing when available
    confidence: 'high' | 'medium' | 'low'
    mechanismDetail?: string // Brief explanation of why this effect occurs
  }>
  monitorMetrics: string[]
  secondaryMetrics?: string[] // Additional metrics worth tracking
  insightTemplates: {
    earlyImproving: string
    improving: string
    stable: string
    declining: string
    noData: string
    onTrack?: string // When progress matches expected timeline
  }
  contraindications?: string[]
  synergyWith?: string[]
  evidenceLevel?: 'clinical_trials' | 'preclinical' | 'anecdotal' | 'theoretical'
  researchNotes?: string[]
  confounds?: string[] // Factors that may affect results
}

export const PROTOCOL_MECHANISMS: Record<string, ProtocolMechanism> = {
  'BPC-157': {
    name: 'BPC-157',
    category: 'peptide',
    mechanisms: [
      'Angiogenesis promotion via VEGFR2 and nitric oxide synthesis (Akt-eNOS axis)',
      'Fibroblast activation and proliferation',
      'Tendon and ligament outgrowth stimulation',
      'Gastric and intestinal cytoprotection',
      'ERK1/2 signaling for endothelial and muscle repair',
      'Growth hormone receptor gene expression upregulation',
      'FAK/PAXILLIN pathway activation for cell adhesion'
    ],
    expectedEffects: {
      recovery: {
        direction: 'improve',
        metrics: ['hrv', 'resting_heart_rate', 'sleep_efficiency'],
        timelineWeeks: [2, 6],
        timelineDays: [14, 42],
        confidence: 'medium',
        mechanismDetail: 'Improved tissue repair and reduced inflammation enhance autonomic balance'
      },
      sleep: {
        direction: 'improve',
        metrics: ['deep_sleep', 'sleep_duration', 'sleep_efficiency'],
        timelineWeeks: [2, 4],
        timelineDays: [14, 28],
        confidence: 'low',
        mechanismDetail: 'Reduced pain and inflammation may improve sleep comfort'
      },
      inflammation: {
        direction: 'improve',
        metrics: ['hrv', 'resting_heart_rate'],
        timelineWeeks: [1, 3],
        timelineDays: [7, 21],
        confidence: 'medium',
        mechanismDetail: 'Direct anti-inflammatory pathway modulation and accelerated tissue repair'
      }
    },
    monitorMetrics: ['hrv', 'deep_sleep', 'resting_heart_rate', 'sleep_efficiency'],
    secondaryMetrics: ['recovery_score', 'sleep_latency'],
    insightTemplates: {
      earlyImproving: "Early positive signals with BPC-157. {metric} is trending up—this aligns with BPC-157's tissue repair timeline (typically 2-6 weeks for full effects).",
      improving: "BPC-157's angiogenic and tissue repair properties are contributing to your {metric} improvement ({change}). The peptide promotes blood vessel formation via VEGFR2 and nitric oxide pathways.",
      stable: "BPC-157 effects on {metric} are stable. This peptide works through gradual tissue repair mechanisms—continue monitoring.",
      declining: "{metric} is down while on BPC-157. BPC-157 supports recovery but can't overcome excessive stress. Consider training load and sleep quality.",
      noData: "Start tracking {metric} to measure BPC-157's recovery effects.",
      onTrack: "Your {metric} improvement aligns with BPC-157's expected 2-4 week timeline for healing mechanisms to take effect."
    },
    synergyWith: ['TB-500', 'GHK-Cu'],
    evidenceLevel: 'preclinical',
    researchNotes: [
      'Extensive animal model evidence but limited human clinical trials',
      '2025 systematic review found strong preclinical support across 36 studies',
      'Primary evidence in tendon, ligament, and GI healing models'
    ],
    confounds: ['Training intensity changes', 'Sleep schedule changes', 'Dietary changes']
  },

  'TB-500': {
    name: 'TB-500 (Thymosin Beta-4)',
    category: 'peptide',
    mechanisms: [
      'Actin sequestration - binds G-actin monomers to regulate cytoskeletal dynamics',
      'Cell migration enhancement (keratinocytes, fibroblasts)',
      'Collagen synthesis stimulation',
      'Angiogenesis in wound beds',
      'Anti-inflammatory via NF-kB pathway inhibition',
      'Reduced IL-6 and IL-8 production',
      'NLRP3 inflammasome dampening (JNK/p38 MAPK signaling)',
      'Akt activation for cell survival'
    ],
    expectedEffects: {
      recovery: {
        direction: 'improve',
        metrics: ['hrv', 'resting_heart_rate'],
        timelineWeeks: [1, 6],
        timelineDays: [7, 42],
        confidence: 'medium',
        mechanismDetail: 'Anti-inflammatory effects and tissue repair improve autonomic regulation'
      },
      tissueRepair: {
        direction: 'improve',
        metrics: ['recovery_score'],
        timelineWeeks: [1, 2],
        timelineDays: [7, 14],
        confidence: 'high',
        mechanismDetail: 'Direct enhancement of cell migration and tissue remodeling'
      },
      activity: {
        direction: 'improve',
        metrics: ['active_calories', 'exercise_minutes', 'steps'],
        timelineWeeks: [3, 8],
        timelineDays: [21, 56],
        confidence: 'low',
        mechanismDetail: 'Improved tissue health may enable increased activity capacity'
      }
    },
    monitorMetrics: ['hrv', 'resting_heart_rate', 'recovery_score'],
    secondaryMetrics: ['active_calories', 'sleep_quality'],
    insightTemplates: {
      earlyImproving: "TB-500 may be starting to work—{metric} is improving. Full tissue repair effects typically take 4-8 weeks.",
      improving: "TB-500's tissue repair and anti-inflammatory properties are enhancing your {metric} ({change}). Its action on cell migration and collagen synthesis supports faster healing.",
      stable: "TB-500 effects building gradually. Tissue regeneration through actin regulation and collagen synthesis is a slow process—stay consistent.",
      declining: "{metric} declining despite TB-500. Ensure adequate rest—the peptide supports but doesn't replace recovery time.",
      noData: "Track {metric} to assess TB-500's regenerative effects.",
      onTrack: "Your {metric} improvement is consistent with TB-500's expected timeline for tissue remodeling effects."
    },
    synergyWith: ['BPC-157'],
    evidenceLevel: 'preclinical',
    researchNotes: [
      'Thymosin Beta-4 fragment with established wound healing research',
      'Murine models showed 42-61% improved re-epithelialization vs controls',
      'Not FDA approved; on WADA prohibited list'
    ],
    confounds: ['Physical therapy', 'Training load', 'Other healing interventions']
  },

  'Ipamorelin': {
    name: 'Ipamorelin',
    category: 'peptide',
    mechanisms: [
      'Selective ghrelin receptor (GHSR) agonist',
      'Growth hormone pulse amplification',
      'IGF-1 elevation (downstream)',
      'Slow-wave sleep enhancement',
      'Selective GH release without cortisol/prolactin spike'
    ],
    expectedEffects: {
      sleep: {
        direction: 'improve',
        metrics: ['deep_sleep', 'sleep_duration', 'sleep_efficiency', 'sleep_quality'],
        timelineWeeks: [1, 2],
        timelineDays: [3, 14],
        confidence: 'high',
        mechanismDetail: 'GH secretagogues directly enhance slow-wave sleep architecture'
      },
      bodyComp: {
        direction: 'improve',
        metrics: ['body_fat', 'lean_body_mass', 'body_fat_percentage'],
        timelineWeeks: [4, 12],
        timelineDays: [28, 84],
        confidence: 'low',
        mechanismDetail: 'GH promotes lipolysis; IGF-1 supports muscle protein synthesis over time'
      },
      recovery: {
        direction: 'improve',
        metrics: ['hrv', 'recovery_score'],
        timelineWeeks: [2, 4],
        timelineDays: [14, 28],
        confidence: 'medium',
        mechanismDetail: 'Elevated GH and IGF-1 support tissue repair and recovery'
      }
    },
    monitorMetrics: ['deep_sleep', 'sleep_quality', 'hrv', 'recovery_score'],
    secondaryMetrics: ['body_fat_percentage', 'lean_body_mass', 'resting_heart_rate'],
    insightTemplates: {
      earlyImproving: "Ipamorelin is boosting your {metric}. GH secretagogues often show sleep benefits within 1-2 weeks, with body comp changes taking 2-3 months.",
      improving: "Ipamorelin's GH-releasing effects are enhancing your {metric} ({change}). Its selective action promotes restorative sleep and recovery without affecting cortisol.",
      stable: "{metric} stable on Ipamorelin. Body composition changes are gradual—track body fat and lean mass monthly.",
      declining: "{metric} down on Ipamorelin. Check your injection timing—best results come from dosing before bed on an empty stomach.",
      noData: "Track {metric} to measure Ipamorelin's GH-boosting effects.",
      onTrack: "Your {metric} improvement aligns with expected Ipamorelin timeline. Continue to optimize sleep timing for maximum benefit."
    },
    synergyWith: ['CJC-1295', 'Tesamorelin'],
    evidenceLevel: 'clinical_trials',
    researchNotes: [
      'Selective GH secretagogue with minimal cortisol/prolactin effects',
      'Often combined with CJC-1295 for synergistic effect',
      'Best dosed before bed for sleep benefit'
    ],
    confounds: ['Sleep hygiene changes', 'Training intensity', 'Caloric intake', 'Fasting state']
  },

  'CJC-1295': {
    name: 'CJC-1295',
    category: 'peptide',
    mechanisms: [
      'GHRH analog - stimulates pituitary somatotrophs',
      'Prolongs GH pulse duration (DAC version has 8-day half-life)',
      'IGF-1 elevation',
      'Synergistic with ghrelin receptor agonists (e.g., Ipamorelin)'
    ],
    expectedEffects: {
      sleep: {
        direction: 'improve',
        metrics: ['deep_sleep', 'sleep_duration', 'sleep_quality'],
        timelineWeeks: [1, 2],
        timelineDays: [3, 14],
        confidence: 'high',
        mechanismDetail: 'GHRH promotes slow-wave sleep via GH pathway'
      },
      bodyComp: {
        direction: 'improve',
        metrics: ['body_fat', 'lean_body_mass', 'muscle_mass', 'body_fat_percentage'],
        timelineWeeks: [4, 12],
        timelineDays: [28, 84],
        confidence: 'medium',
        mechanismDetail: 'GH-mediated lipolysis and IGF-1 anabolic effects on muscle tissue'
      },
      recovery: {
        direction: 'improve',
        metrics: ['hrv', 'recovery_score'],
        timelineWeeks: [2, 4],
        timelineDays: [14, 28],
        confidence: 'medium',
        mechanismDetail: 'Better sleep and elevated GH/IGF-1 axis supports tissue repair'
      }
    },
    monitorMetrics: ['deep_sleep', 'sleep_quality', 'hrv'],
    secondaryMetrics: ['body_fat_percentage', 'lean_body_mass', 'recovery_score'],
    insightTemplates: {
      earlyImproving: "CJC-1295 appears active—{metric} improving. Its extended half-life provides sustained GH elevation.",
      improving: "CJC-1295's GHRH activity is prolonging your GH pulses, reflected in {metric} improvement ({change}). This sustained elevation supports deeper sleep and enhanced recovery.",
      stable: "{metric} holding steady. CJC-1295 body comp effects emerge over 2-4 months—patience is key.",
      declining: "{metric} declining on CJC-1295. Consider timing and ensure you're not eating within 2 hours of injection.",
      noData: "Add {metric} tracking to measure CJC-1295 effectiveness.",
      onTrack: "Your {metric} trajectory aligns with expected CJC-1295 effects on the GH/IGF-1 axis."
    },
    synergyWith: ['Ipamorelin'],
    evidenceLevel: 'clinical_trials',
    researchNotes: [
      'Published human PK/PD data showing sustained GH/IGF-1 elevation',
      'DAC version provides extended half-life for less frequent dosing',
      'Often stacked with Ipamorelin for synergy'
    ],
    confounds: ['Sleep timing', 'Fasting state', 'Training load']
  },

  'Ipamorelin + CJC-1295': {
    name: 'Ipamorelin + CJC-1295 Combination',
    category: 'peptide',
    mechanisms: [
      'Dual pathway GH stimulation (GHRH + ghrelin receptor)',
      'Synergistic pulse amplitude and duration enhancement',
      'IGF-1 elevation',
      'Enhanced slow-wave sleep',
      'Selective GH release without cortisol spike'
    ],
    expectedEffects: {
      sleep: {
        direction: 'improve',
        metrics: ['deep_sleep', 'sleep_quality', 'sleep_duration'],
        timelineWeeks: [0.5, 1],
        timelineDays: [3, 7],
        confidence: 'high',
        mechanismDetail: 'Combined GHRH + ghrelin agonism produces robust sleep improvement'
      },
      recovery: {
        direction: 'improve',
        metrics: ['hrv', 'recovery_score'],
        timelineWeeks: [1, 3],
        timelineDays: [7, 21],
        confidence: 'high',
        mechanismDetail: 'Enhanced GH/IGF-1 axis accelerates tissue repair'
      },
      bodyComp: {
        direction: 'improve',
        metrics: ['body_fat_percentage', 'lean_body_mass'],
        timelineWeeks: [4, 10],
        timelineDays: [28, 70],
        confidence: 'medium',
        mechanismDetail: 'Combined anabolic stimulus supports muscle protein synthesis and lipolysis'
      }
    },
    monitorMetrics: ['deep_sleep', 'sleep_quality', 'hrv', 'recovery_score'],
    secondaryMetrics: ['body_fat_percentage', 'lean_body_mass', 'resting_heart_rate'],
    insightTemplates: {
      earlyImproving: "The Ipamorelin + CJC-1295 combination showing early results on {metric}. Synergistic effects often appear within days.",
      improving: "The Ipamorelin + CJC-1295 combination is showing synergistic effects on your {metric} ({change}). Dual GH pathway stimulation produces more robust results than either peptide alone.",
      stable: "{metric} stable on the combination. Body composition changes require 4-10 weeks of consistent use.",
      declining: "{metric} down despite the combination. Verify dosing timing (before bed, fasted) and consider training load.",
      noData: "Track {metric} to measure the synergistic effects of this combination.",
      onTrack: "Your {metric} improvement demonstrates the expected synergy between Ipamorelin and CJC-1295."
    },
    synergyWith: [],
    evidenceLevel: 'clinical_trials',
    researchNotes: [
      'Commonly prescribed combination for GH optimization',
      'Synergistic effect greater than sum of individual components',
      'Best dosed together before bed'
    ],
    confounds: ['Sleep timing', 'Meal timing relative to dose', 'Training intensity']
  },

  'Semaglutide': {
    name: 'Semaglutide',
    category: 'medication',
    mechanisms: [
      'GLP-1 receptor agonist',
      'Delayed gastric emptying',
      'Central appetite suppression (hypothalamic action)',
      'Glucagon inhibition',
      'Enhanced insulin sensitivity',
      'Cardiovascular protective effects'
    ],
    expectedEffects: {
      bodyComp: {
        direction: 'improve',
        metrics: ['weight', 'body_fat', 'bmi', 'body_fat_percentage'],
        timelineWeeks: [2, 12],
        timelineDays: [14, 84],
        confidence: 'high',
        mechanismDetail: 'Appetite suppression and delayed gastric emptying reduce caloric intake'
      },
      metabolic: {
        direction: 'improve',
        metrics: ['resting_heart_rate', 'hrv'],
        timelineWeeks: [6, 12],
        timelineDays: [42, 84],
        confidence: 'medium',
        mechanismDetail: 'Weight loss and improved metabolic state reduce cardiovascular load'
      },
      sleep: {
        direction: 'improve',
        metrics: ['sleep_quality', 'sleep_efficiency'],
        timelineWeeks: [4, 8],
        timelineDays: [28, 56],
        confidence: 'medium',
        mechanismDetail: 'Weight loss may reduce sleep apnea and improve sleep quality'
      }
    },
    monitorMetrics: ['weight', 'body_fat_percentage', 'bmi', 'resting_heart_rate'],
    secondaryMetrics: ['hrv', 'sleep_quality', 'lean_body_mass'],
    insightTemplates: {
      earlyImproving: "Semaglutide working as expected—{metric} improving. Most see 5-10% body weight reduction by month 2, with significant changes continuing through week 12.",
      improving: "Semaglutide's GLP-1 receptor activation is producing expected improvements in {metric} ({change}). Appetite regulation and metabolic benefits compound over time.",
      stable: "{metric} plateaued on Semaglutide. This can be normal during dose titration—discuss with your provider if needed.",
      declining: "{metric} moving opposite direction. Ensure consistent weekly dosing and discuss with your provider.",
      noData: "Track {metric} weekly to monitor Semaglutide progress.",
      onTrack: "Your {metric} progress aligns with clinical trial outcomes for semaglutide at this stage."
    },
    evidenceLevel: 'clinical_trials',
    researchNotes: [
      'FDA approved for weight management and type 2 diabetes',
      'Clinical trials show ~13% body weight reduction vs placebo',
      'Cardiovascular outcome benefits demonstrated in SELECT trial',
      'GI side effects (nausea, constipation) common initially'
    ],
    confounds: ['Dietary changes', 'Exercise habits', 'Hydration status', 'GI side effects']
  },

  'Tirzepatide': {
    name: 'Tirzepatide',
    category: 'medication',
    mechanisms: [
      'Dual GLP-1 and GIP receptor agonist',
      'Enhanced appetite suppression vs GLP-1 alone',
      'Improved insulin sensitivity',
      'Lipid metabolism modulation',
      'Greater metabolic flexibility'
    ],
    expectedEffects: {
      bodyComp: {
        direction: 'improve',
        metrics: ['weight', 'body_fat', 'bmi', 'body_fat_percentage'],
        timelineWeeks: [2, 12],
        timelineDays: [14, 84],
        confidence: 'high',
        mechanismDetail: 'Dual incretin action produces robust appetite suppression (up to 18% body weight reduction)'
      },
      metabolic: {
        direction: 'improve',
        metrics: ['resting_heart_rate', 'hrv'],
        timelineWeeks: [4, 12],
        timelineDays: [28, 84],
        confidence: 'high',
        mechanismDetail: 'Weight loss and metabolic improvements reduce cardiac workload'
      },
      sleep: {
        direction: 'improve',
        metrics: ['sleep_quality'],
        timelineWeeks: [4, 8],
        timelineDays: [28, 56],
        confidence: 'medium',
        mechanismDetail: 'Weight loss often improves sleep quality and reduces apnea'
      }
    },
    monitorMetrics: ['weight', 'body_fat_percentage', 'bmi', 'resting_heart_rate'],
    secondaryMetrics: ['hrv', 'sleep_quality', 'lean_body_mass'],
    insightTemplates: {
      earlyImproving: "Tirzepatide showing early results on {metric}. Dual-agonist action often produces faster response than single GLP-1s.",
      improving: "Tirzepatide's dual GLP-1/GIP action is driving strong improvement in {metric} ({change}). Clinical data shows it outperforms single-target approaches.",
      stable: "{metric} stable—Tirzepatide effects may require dose titration. Consult your provider.",
      declining: "Unexpected {metric} change on Tirzepatide. Review diet and dosing consistency.",
      noData: "Start tracking {metric} to measure Tirzepatide effectiveness.",
      onTrack: "Your {metric} trajectory matches or exceeds typical tirzepatide response curves from clinical trials."
    },
    evidenceLevel: 'clinical_trials',
    researchNotes: [
      'FDA approved; outperforms semaglutide in head-to-head trials',
      'Up to 18% body weight reduction vs placebo',
      'Benefits in heart failure, NASH, and knee osteoarthritis also demonstrated',
      'GI side effects similar to GLP-1 agonists'
    ],
    confounds: ['Dietary changes', 'Exercise routine', 'Hydration', 'GI tolerance']
  },

  'GHK-Cu': {
    name: 'GHK-Cu (Copper Peptide)',
    category: 'peptide',
    mechanisms: [
      'Copper delivery for lysyl oxidase and lysyl hydroxylase (collagen cross-linking)',
      'Fibroblast activation and proliferation',
      'Collagen and elastin synthesis (up to 70% increase in vitro)',
      'Glycosaminoglycan synthesis stimulation',
      'Angiogenesis, anticoagulation, and vasodilation',
      'DNA repair gene upregulation (47+ genes stimulated)',
      'Antioxidant response enhancement',
      'Nerve outgrowth support'
    ],
    expectedEffects: {
      recovery: {
        direction: 'improve',
        metrics: ['hrv', 'recovery_score'],
        timelineWeeks: [4, 8],
        timelineDays: [28, 56],
        confidence: 'medium',
        mechanismDetail: 'Enhanced collagen synthesis and tissue repair support recovery'
      },
      tissueQuality: {
        direction: 'improve',
        metrics: ['sleep_quality'],
        timelineWeeks: [4, 12],
        timelineDays: [28, 84],
        confidence: 'low',
        mechanismDetail: 'Improved tissue health and reduced inflammation may support sleep'
      }
    },
    monitorMetrics: ['hrv', 'recovery_score'],
    secondaryMetrics: ['sleep_quality'],
    insightTemplates: {
      earlyImproving: "GHK-Cu may be supporting recovery—{metric} trending up. Collagen synthesis effects typically emerge over 4-8 weeks.",
      improving: "GHK-Cu's regenerative properties, including enhanced collagen synthesis and DNA repair gene activation, are contributing to your {metric} improvement ({change}).",
      stable: "GHK-Cu effects on systemic metrics are subtle. Primary benefits are often skin/tissue quality (not easily measured via standard metrics).",
      declining: "{metric} down—GHK-Cu is mild and unlikely the cause. Look at other factors.",
      noData: "GHK-Cu benefits are often visible (skin quality) rather than metric-based. Track recovery if using systemically.",
      onTrack: "Your {metric} change aligns with GHK-Cu's timeline for collagen production and tissue regeneration effects."
    },
    evidenceLevel: 'preclinical',
    researchNotes: [
      'Naturally present in human plasma; declines with age',
      'Clinical studies show 31-56% wrinkle reduction in 12 weeks (topical)',
      'Short half-life (<30 min) affects systemic delivery'
    ],
    confounds: ['Skincare routine changes', 'Sun exposure', 'Hydration status']
  },

  'PT-141': {
    name: 'PT-141 (Bremelanotide)',
    category: 'peptide',
    mechanisms: [
      'Melanocortin receptor agonist (MC3R, MC4R)',
      'Hypothalamic dopamine release in medial preoptic area',
      'Central nervous system sexual arousal pathway activation',
      'Non-vascular mechanism (unlike PDE5 inhibitors)'
    ],
    expectedEffects: {
      // PT-141 primarily affects subjective measures not tracked by typical health metrics
      cardiovascular: {
        direction: 'stable',
        metrics: ['resting_heart_rate', 'hrv'],
        timelineWeeks: [0, 1],
        confidence: 'medium',
        mechanismDetail: 'May cause transient BP increase (~6mmHg systolic) within hours of dose'
      }
    },
    monitorMetrics: [],
    secondaryMetrics: ['resting_heart_rate', 'hrv'],
    insightTemplates: {
      earlyImproving: "PT-141 works through central nervous system pathways. Effects are primarily subjective and onset typically within 45-60 minutes of dosing.",
      improving: "PT-141 effects are dose-dependent and occur within hours rather than days. Subjective improvements suggest it's working as expected.",
      stable: "PT-141 is an as-needed medication with effects within 45-60 minutes. Unlike daily protocols, it doesn't build up over time.",
      declining: "PT-141 effects are acute, not cumulative. If ineffective, dosing adjustment may be needed. Discuss with your provider.",
      noData: "PT-141 effects are primarily subjective. Standard health metrics may not capture its benefits."
    },
    evidenceLevel: 'clinical_trials',
    researchNotes: [
      'FDA approved as Vyleesi for hypoactive sexual desire disorder',
      'Works centrally through melanocortin receptors, not through blood flow',
      'May cause transient BP increase (~6mmHg systolic)',
      'Contraindicated with uncontrolled hypertension'
    ],
    confounds: ['Blood pressure medications', 'Cardiovascular conditions', 'Timing of dose'],
    contraindications: ['Uncontrolled hypertension', 'Cardiovascular disease']
  },

  'Semax': {
    name: 'Semax',
    category: 'peptide',
    mechanisms: [
      'ACTH(4-10) derivative with neurotrophic properties',
      'BDNF upregulation',
      'Dopamine and serotonin modulation',
      'Enkephalinase inhibition (potential)',
      'Melanocortin receptor interaction (possible)',
      'Neuroprotective gene expression'
    ],
    expectedEffects: {
      stress: {
        direction: 'improve',
        metrics: ['hrv'],
        timelineWeeks: [2, 4],
        timelineDays: [14, 28],
        confidence: 'low',
        mechanismDetail: 'Reduced stress and improved cognitive function may enhance parasympathetic tone'
      }
    },
    monitorMetrics: ['hrv'],
    secondaryMetrics: ['sleep_quality', 'resting_heart_rate'],
    insightTemplates: {
      earlyImproving: "Semax's neurotrophic effects may be starting—{metric} trending positively. Cognitive effects (attention, focus) are often noticed quickly.",
      improving: "Semax's neurotrophic effects, including BDNF upregulation, may be contributing to improved stress resilience reflected in your {metric} ({change}).",
      stable: "Semax effects are primarily cognitive. {metric} stability while using suggests no negative autonomic impact.",
      declining: "{metric} declining—Semax is unlikely the cause. Consider whether sleep timing or stress levels have changed.",
      noData: "Semax benefits are primarily cognitive (focus, attention) and may not show in standard health metrics."
    },
    evidenceLevel: 'preclinical',
    researchNotes: [
      'Approved in Russia for stroke recovery and cognitive enhancement',
      'Not FDA approved in US',
      'Studies show improved attention and memory in healthy subjects',
      'Intranasal administration for direct CNS access'
    ],
    confounds: ['Caffeine intake', 'Sleep quality', 'Stress levels', 'Other nootropics']
  },

  'Selank': {
    name: 'Selank',
    category: 'peptide',
    mechanisms: [
      'Tuftsin analog with anxiolytic properties',
      'GABAergic modulation (GABA-A receptor allosteric regulation)',
      'Serotonin and dopamine stabilization',
      'Reduced IL-6 and inflammatory cytokines',
      'BDNF expression support',
      'Immune modulation (immunoglobulin G fragment origin)'
    ],
    expectedEffects: {
      stress: {
        direction: 'improve',
        metrics: ['hrv', 'resting_heart_rate'],
        timelineWeeks: [1, 2],
        timelineDays: [7, 14],
        confidence: 'medium',
        mechanismDetail: 'Anxiolytic effects enhance parasympathetic function via GABA modulation'
      },
      sleep: {
        direction: 'improve',
        metrics: ['sleep_quality', 'sleep_latency'],
        timelineWeeks: [1, 2],
        timelineDays: [7, 14],
        confidence: 'medium',
        mechanismDetail: 'GABAergic enhancement promotes relaxation and sleep onset'
      }
    },
    monitorMetrics: ['hrv', 'sleep_quality'],
    secondaryMetrics: ['resting_heart_rate', 'sleep_latency', 'deep_sleep'],
    insightTemplates: {
      earlyImproving: "Selank's anxiolytic effects may be emerging—{metric} improving. GABAergic modulation typically shows effects within 1-2 weeks.",
      improving: "Selank's anxiolytic and GABAergic effects appear to be enhancing your {metric} ({change}). Its action on inhibitory neurotransmission promotes calm and recovery.",
      stable: "Selank maintaining {metric}. If stress or anxiety was not elevated, effects may be subtle.",
      declining: "{metric} declining—assess whether stress levels or sleep hygiene have changed. Selank is supportive, not a primary driver.",
      noData: "Track {metric} to assess Selank's calming effects on your autonomic nervous system.",
      onTrack: "Your {metric} improvement suggests Selank's calming mechanisms are taking effect as expected."
    },
    evidenceLevel: 'preclinical',
    researchNotes: [
      'Approved in Russia as anxiolytic',
      'Not FDA approved in US',
      'Stable synthetic analog of endogenous tuftsin',
      'Intranasal administration common'
    ],
    confounds: ['Caffeine', 'Alcohol', 'Other anxiolytics', 'Stress exposure']
  },

  'NAD+': {
    name: 'NAD+ / NMN / NR',
    category: 'supplement',
    mechanisms: [
      'NAD+ precursor replenishment',
      'Mitochondrial function enhancement',
      'SIRT1 and SIRT3 activation (downstream)',
      'DNA repair support',
      'Cellular energy (ATP) production',
      'Mitophagy improvement',
      'UPRmt (mitochondrial unfolded protein response) activation',
      'Antioxidant response gene expression'
    ],
    expectedEffects: {
      energy: {
        direction: 'improve',
        metrics: ['active_calories', 'steps', 'exercise_minutes'],
        timelineWeeks: [2, 6],
        timelineDays: [14, 42],
        confidence: 'medium',
        mechanismDetail: 'Enhanced mitochondrial function and ATP production support energy levels'
      },
      recovery: {
        direction: 'improve',
        metrics: ['hrv', 'sleep_efficiency', 'recovery_score'],
        timelineWeeks: [2, 4],
        timelineDays: [14, 28],
        confidence: 'medium',
        mechanismDetail: 'NAD+ supports cellular repair pathways and sirtuin activation'
      },
      sleep: {
        direction: 'improve',
        metrics: ['sleep_quality'],
        timelineWeeks: [2, 4],
        timelineDays: [14, 28],
        confidence: 'low',
        mechanismDetail: 'Sirtuin activation may influence circadian rhythm regulation'
      }
    },
    monitorMetrics: ['hrv', 'recovery_score', 'active_calories'],
    secondaryMetrics: ['sleep_quality', 'resting_heart_rate', 'vo2_max'],
    insightTemplates: {
      earlyImproving: "NAD+ precursors may be boosting cellular energy—{metric} improving. Effects typically build over 2-4 weeks as cellular NAD+ pools rebuild.",
      improving: "NMN/NR is replenishing cellular NAD+ levels, enhancing mitochondrial function reflected in your {metric} improvement ({change}).",
      stable: "NAD+ effects on {metric} are subtle. Benefits often manifest as subjective energy before metric changes appear.",
      declining: "{metric} down—NAD+ is supportive, not a primary driver. Examine sleep, stress, and training load.",
      noData: "Track activity and recovery metrics to assess NAD+ precursor benefits.",
      onTrack: "Your {metric} trajectory suggests NAD+ precursors are supporting mitochondrial and cellular health as expected."
    },
    evidenceLevel: 'clinical_trials',
    researchNotes: [
      'Ongoing human clinical trials for aging and metabolic health',
      'Animal studies show improved mitochondrial function and longevity',
      'NAD+ levels naturally decline with age',
      'Bioavailability and optimal dosing still under investigation'
    ],
    confounds: ['Fasting state', 'Exercise intensity', 'Other supplements affecting NAD+ pathway']
  },

  'NMN': {
    name: 'NMN (Nicotinamide Mononucleotide)',
    category: 'supplement',
    mechanisms: [
      'NAD+ precursor (converted via NMNAT enzymes)',
      'Mitochondrial function enhancement',
      'SIRT1 activation (downstream)',
      'DNA repair support',
      'Cellular energy (ATP) production',
      'Mitophagy improvement',
      'Antioxidant response gene expression'
    ],
    expectedEffects: {
      recovery: {
        direction: 'improve',
        metrics: ['hrv', 'recovery_score'],
        timelineWeeks: [2, 4],
        timelineDays: [14, 28],
        confidence: 'medium',
        mechanismDetail: 'Enhanced mitochondrial function improves cellular energy and autonomic regulation'
      },
      energy: {
        direction: 'improve',
        metrics: ['active_calories', 'steps'],
        timelineWeeks: [2, 6],
        timelineDays: [14, 42],
        confidence: 'medium',
        mechanismDetail: 'NAD+ supports cellular energy production'
      }
    },
    monitorMetrics: ['hrv', 'recovery_score'],
    secondaryMetrics: ['sleep_quality', 'resting_heart_rate', 'active_calories'],
    insightTemplates: {
      earlyImproving: "NMN may be rebuilding cellular NAD+ pools—{metric} improving. Effects typically emerge over 2-4 weeks.",
      improving: "NMN is replenishing cellular NAD+ levels, potentially enhancing mitochondrial function reflected in your {metric} improvement ({change}).",
      stable: "NMN effects on {metric} are subtle. Subjective energy improvements may precede measurable metric changes.",
      declining: "{metric} down—NMN is supportive, not a primary driver. Examine sleep, stress, and training load.",
      noData: "Track recovery metrics to assess NMN's effects on cellular energy."
    },
    evidenceLevel: 'clinical_trials',
    researchNotes: [
      'Human trials ongoing for aging and metabolic health',
      'Animal studies show improved mitochondrial function',
      'Requires conversion to NAD+ via NMNAT pathway'
    ],
    confounds: ['Fasting state', 'Exercise', 'Other NAD+ precursors']
  },

  'NR': {
    name: 'NR (Nicotinamide Riboside)',
    category: 'supplement',
    mechanisms: [
      'NAD+ precursor (converted via NRK pathway)',
      'Mitochondrial biogenesis support',
      'SIRT1 and SIRT3 activation',
      'UPRmt activation',
      'Antioxidant response enhancement',
      'Cellular stress resilience'
    ],
    expectedEffects: {
      recovery: {
        direction: 'improve',
        metrics: ['hrv', 'recovery_score'],
        timelineWeeks: [2, 4],
        timelineDays: [14, 28],
        confidence: 'medium',
        mechanismDetail: 'Enhanced mitochondrial function improves autonomic regulation'
      },
      energy: {
        direction: 'improve',
        metrics: ['active_calories', 'steps'],
        timelineWeeks: [2, 6],
        timelineDays: [14, 42],
        confidence: 'medium',
        mechanismDetail: 'NAD+ supports cellular repair pathways'
      }
    },
    monitorMetrics: ['hrv', 'recovery_score'],
    secondaryMetrics: ['sleep_quality', 'resting_heart_rate'],
    insightTemplates: {
      earlyImproving: "Nicotinamide Riboside may be boosting NAD+ levels—{metric} improving. Cellular energy benefits typically follow.",
      improving: "NR is boosting NAD+ levels, supporting the mitochondrial function reflected in your {metric} improvement ({change}).",
      stable: "NR effects on {metric} may be subtle. Energy and recovery benefits often precede metric changes.",
      declining: "{metric} down—NR is supportive. Examine sleep, stress, and training load.",
      noData: "Track recovery and energy metrics to assess NR benefits."
    },
    evidenceLevel: 'clinical_trials',
    researchNotes: [
      'Human trials show NAD+ level increases',
      'Marketed as Niagen and TruNiagen',
      'Generally well-tolerated'
    ],
    confounds: ['Fasting state', 'Exercise', 'Other NAD+ precursors']
  },

  'Creatine': {
    name: 'Creatine Monohydrate',
    category: 'supplement',
    mechanisms: [
      'ATP resynthesis via phosphocreatine system',
      'Cellular energy buffer (mitochondria to cytosol transfer)',
      'Brain phosphocreatine elevation',
      'Neurotransmitter synthesis support (acetylcholine)',
      'Neuromodulation and synaptic plasticity effects',
      'Muscle cell volumization'
    ],
    expectedEffects: {
      performance: {
        direction: 'improve',
        metrics: ['active_calories', 'exercise_minutes'],
        timelineWeeks: [1, 2],
        timelineDays: [7, 14],
        confidence: 'high',
        mechanismDetail: 'Enhanced ATP availability supports faster recovery between efforts'
      },
      bodyComp: {
        direction: 'improve',
        metrics: ['lean_body_mass', 'muscle_mass'],
        timelineWeeks: [4, 8],
        timelineDays: [28, 56],
        confidence: 'high',
        mechanismDetail: 'Supports training capacity and muscle protein synthesis'
      },
      recovery: {
        direction: 'improve',
        metrics: ['recovery_score', 'hrv'],
        timelineWeeks: [2, 4],
        timelineDays: [14, 28],
        confidence: 'low',
        mechanismDetail: 'Improved recovery capacity may enhance autonomic balance'
      }
    },
    monitorMetrics: ['lean_body_mass', 'recovery_score', 'active_calories'],
    secondaryMetrics: ['hrv', 'weight', 'muscle_mass'],
    insightTemplates: {
      earlyImproving: "Creatine loading phase complete—{metric} responding. Initial weight gain is normal (muscle cell hydration).",
      improving: "Creatine is enhancing your cellular energy systems, reflected in improved {metric} ({change}). Its role in ATP resynthesis supports both physical and cognitive performance.",
      stable: "{metric} stable—creatine provides a foundation for energy, but progressive training drives further gains.",
      declining: "{metric} down despite creatine. Check training consistency and protein intake.",
      noData: "Track {metric} to measure creatine's performance benefits.",
      onTrack: "Your {metric} improvement reflects creatine's well-established effects on energy metabolism and recovery."
    },
    evidenceLevel: 'clinical_trials',
    researchNotes: [
      'One of the most researched sports supplements',
      'Strong evidence for strength and power output',
      'Emerging evidence for cognitive benefits, especially under stress or sleep deprivation',
      'Safe for long-term use at 3-5g daily'
    ],
    confounds: ['Training intensity', 'Protein intake', 'Hydration status']
  },

  'Magnesium': {
    name: 'Magnesium',
    category: 'supplement',
    mechanisms: [
      'GABA-A receptor potentiation (inhibitory neurotransmission)',
      'NMDA receptor modulation',
      'Melatonin production support',
      'Cortisol regulation',
      'ATP cofactor (over 300 enzymatic reactions)',
      'Muscle and nerve function',
      'Parasympathetic nervous system support'
    ],
    expectedEffects: {
      sleep: {
        direction: 'improve',
        metrics: ['sleep_duration', 'sleep_efficiency', 'deep_sleep', 'sleep_quality'],
        timelineWeeks: [1, 2],
        timelineDays: [7, 14],
        confidence: 'high',
        mechanismDetail: 'GABA potentiation and melatonin support enhance sleep'
      },
      recovery: {
        direction: 'improve',
        metrics: ['hrv', 'resting_heart_rate', 'recovery_score'],
        timelineWeeks: [2, 4],
        timelineDays: [14, 28],
        confidence: 'high',
        mechanismDetail: 'Parasympathetic support and reduced cortisol enhance HRV'
      }
    },
    monitorMetrics: ['sleep_quality', 'hrv', 'deep_sleep'],
    secondaryMetrics: ['resting_heart_rate', 'recovery_score', 'sleep_latency'],
    insightTemplates: {
      earlyImproving: "Magnesium supporting {metric}. Its calming effect via GABA modulation often shows in sleep metrics first.",
      improving: "Magnesium's effects on GABA receptors and parasympathetic function are enhancing your {metric} ({change}). Its role in 300+ enzymatic reactions supports relaxation and recovery.",
      stable: "Magnesium maintaining {metric}. If already replete, you may not see dramatic changes—that's a good baseline.",
      declining: "{metric} down despite magnesium. This mineral is supportive—look at stress, caffeine, and sleep hygiene.",
      noData: "Track sleep and HRV metrics to assess magnesium benefits.",
      onTrack: "Your {metric} improvement reflects magnesium's well-documented effects on sleep and autonomic function."
    },
    evidenceLevel: 'clinical_trials',
    researchNotes: [
      'Many adults are magnesium deficient',
      '90-day study showed clear HRV improvements with 400mg daily',
      'Different forms have varying absorption (glycinate, threonate better for CNS)',
      'Threonate form (Magtein) shows cognitive benefits in trials'
    ],
    confounds: ['Caffeine intake', 'Stress levels', 'Other supplements', 'Medication interactions']
  },

  'Vitamin D': {
    name: 'Vitamin D3',
    category: 'supplement',
    mechanisms: [
      'VDR (vitamin D receptor) activation across tissues',
      'Serotonin and melatonin synthesis regulation',
      'Circadian rhythm modulation (SCN expression)',
      'Immune function regulation (innate and adaptive)',
      'Inflammatory cytokine modulation (IL-6, TNF-alpha)',
      'Calcium homeostasis',
      'Gene expression regulation (over 1,000 genes)'
    ],
    expectedEffects: {
      sleep: {
        direction: 'improve',
        metrics: ['sleep_quality', 'sleep_duration'],
        timelineWeeks: [4, 8],
        timelineDays: [28, 56],
        confidence: 'medium',
        mechanismDetail: 'VDR in SCN regulates circadian rhythm; supports melatonin synthesis'
      },
      recovery: {
        direction: 'improve',
        metrics: ['hrv', 'recovery_score'],
        timelineWeeks: [4, 8],
        timelineDays: [28, 56],
        confidence: 'medium',
        mechanismDetail: 'Immune and inflammatory modulation support recovery'
      },
      general: {
        direction: 'improve',
        metrics: ['resting_heart_rate'],
        timelineWeeks: [4, 12],
        timelineDays: [28, 84],
        confidence: 'low',
        mechanismDetail: 'Broad systemic effects on inflammation and immune function'
      }
    },
    monitorMetrics: ['sleep_quality', 'recovery_score', 'hrv'],
    secondaryMetrics: ['resting_heart_rate', 'sleep_duration'],
    insightTemplates: {
      earlyImproving: "Vitamin D levels building—{metric} may be responding. Full effects take 2-3 months as stores replenish.",
      improving: "Vitamin D is supporting circadian regulation and immune function, reflected in your {metric} improvement ({change}). Its effects are wide-ranging through VDR activation.",
      stable: "Vitamin D maintains foundational health—{metric} stability is a positive sign.",
      declining: "{metric} down—vitamin D is unlikely the cause. It's a slow-acting nutrient that supports, not drives, performance.",
      noData: "Consider blood testing to confirm vitamin D levels (optimal 40-60 ng/mL) alongside metric tracking.",
      onTrack: "Your {metric} improvement aligns with vitamin D's effects on circadian rhythm and inflammatory regulation."
    },
    evidenceLevel: 'clinical_trials',
    researchNotes: [
      'Widespread deficiency, especially in northern latitudes',
      'Optimal blood levels typically 40-60 ng/mL',
      'Effects on mood, sleep, and immunity well-documented',
      'Fat-soluble; take with fatty meal for absorption'
    ],
    confounds: ['Sun exposure', 'Season', 'Skin tone', 'Body fat percentage']
  },

  'Omega-3': {
    name: 'Omega-3 (EPA/DHA)',
    category: 'supplement',
    mechanisms: [
      'Cell membrane fluidity enhancement',
      'EPA conversion to anti-inflammatory eicosanoids',
      'DHA brain structure support',
      'Specialized pro-resolving mediators (SPMs) production',
      'NF-kB pathway modulation',
      'Triglyceride reduction',
      'Ion channel effects (anti-arrhythmic)',
      'Vagal tone enhancement'
    ],
    expectedEffects: {
      cardiovascular: {
        direction: 'improve',
        metrics: ['resting_heart_rate', 'hrv'],
        timelineWeeks: [4, 8],
        timelineDays: [28, 56],
        confidence: 'high',
        mechanismDetail: 'Omega-3s improve HRV through vagal tone and ion channel effects'
      },
      inflammation: {
        direction: 'improve',
        metrics: ['hrv', 'recovery_score'],
        timelineWeeks: [4, 8],
        timelineDays: [28, 56],
        confidence: 'medium',
        mechanismDetail: 'Anti-inflammatory eicosanoids and SPMs reduce systemic inflammation'
      },
      sleep: {
        direction: 'improve',
        metrics: ['sleep_quality'],
        timelineWeeks: [4, 8],
        timelineDays: [28, 56],
        confidence: 'low',
        mechanismDetail: 'DHA supports brain health; reduced inflammation may improve sleep'
      }
    },
    monitorMetrics: ['hrv', 'resting_heart_rate'],
    secondaryMetrics: ['recovery_score', 'sleep_quality'],
    insightTemplates: {
      earlyImproving: "Omega-3s beginning to show in {metric}. Anti-inflammatory and cardiovascular effects build gradually over 4-8 weeks.",
      improving: "Omega-3 fatty acids are enhancing cardiovascular and autonomic function, reflected in your {metric} improvement ({change}). EPA and DHA work synergistically for heart and brain health.",
      stable: "Omega-3s working in the background—{metric} stability with maintained cardiovascular function is the goal.",
      declining: "{metric} down—omega-3s are supportive but can't overcome major stressors. Check training load and sleep.",
      noData: "Track HRV and resting heart rate to assess omega-3 cardiovascular benefits.",
      onTrack: "Your {metric} improvement reflects the well-established cardiovascular benefits of omega-3 fatty acids."
    },
    evidenceLevel: 'clinical_trials',
    researchNotes: [
      'Strong evidence for cardiovascular outcomes',
      'EPA may be more important for CV benefits than DHA',
      'Anti-arrhythmic effects reduce sudden cardiac death risk',
      'Look for 2:1 or 3:1 EPA:DHA ratio for CV focus',
      'Effective dose typically 2-4g combined EPA+DHA'
    ],
    confounds: ['Dietary fish intake', 'Overall fat intake', 'Medication interactions (blood thinners)']
  }
}

// Common aliases for protocol names
const PROTOCOL_ALIASES: Record<string, string> = {
  'bpc157': 'BPC-157',
  'body protection compound': 'BPC-157',
  'tb500': 'TB-500',
  'thymosin beta-4': 'TB-500',
  'thymosin beta 4': 'TB-500',
  'ghk': 'GHK-Cu',
  'copper peptide': 'GHK-Cu',
  'ozempic': 'Semaglutide',
  'wegovy': 'Semaglutide',
  'rybelsus': 'Semaglutide',
  'mounjaro': 'Tirzepatide',
  'zepbound': 'Tirzepatide',
  'vyleesi': 'PT-141',
  'bremelanotide': 'PT-141',
  'cjc 1295': 'CJC-1295',
  'cjc1295': 'CJC-1295',
  'modified grf 1-29': 'CJC-1295',
  'mod grf': 'CJC-1295',
  'nicotinamide mononucleotide': 'NMN',
  'nicotinamide riboside': 'NR',
  'niagen': 'NR',
  'truniagen': 'NR',
  'fish oil': 'Omega-3',
  'epa': 'Omega-3',
  'dha': 'Omega-3',
  'epa/dha': 'Omega-3',
  'omegad3': 'Omega-3',
  'omega d3': 'Omega-3',
  'omega d3 sport': 'Omega-3',
  'ultimate omega': 'Omega-3',
  'ultimate omega d3': 'Omega-3',
  'vitamin d3': 'Vitamin D',
  'd3': 'Vitamin D',
  'cholecalciferol': 'Vitamin D',
  'mag': 'Magnesium',
  'magnesium glycinate': 'Magnesium',
  'magnesium threonate': 'Magnesium',
  'magtein': 'Magnesium',
  'creatine monohydrate': 'Creatine',
  'nmn': 'NMN',
  'nr': 'NR',
  'nad': 'NAD+',
  'nad+': 'NAD+',
  'nad+ precursor': 'NAD+',
  'ipamorelin cjc': 'Ipamorelin + CJC-1295',
  'ipamorelin/cjc': 'Ipamorelin + CJC-1295',
  'cjc/ipamorelin': 'Ipamorelin + CJC-1295',
  'cjc ipamorelin': 'Ipamorelin + CJC-1295'
}

// Helper function to find mechanism by peptide name (fuzzy match)
export function findProtocolMechanism(protocolName: string): ProtocolMechanism | null {
  const normalized = protocolName.toLowerCase().replace(/[^a-z0-9+\/\- ]/g, '').trim()

  // Check direct key match first
  if (PROTOCOL_MECHANISMS[protocolName]) {
    return PROTOCOL_MECHANISMS[protocolName]
  }

  // Check alias lookup
  const aliasKey = normalized.replace(/[^a-z0-9+ ]/g, '')
  const aliasMatch = PROTOCOL_ALIASES[aliasKey] || PROTOCOL_ALIASES[normalized]
  if (aliasMatch && PROTOCOL_MECHANISMS[aliasMatch]) {
    return PROTOCOL_MECHANISMS[aliasMatch]
  }

  // Extended normalization — catches misspellings, abbreviations, brand names
  const { canonical } = normalizeProtocolName(protocolName)
  if (canonical !== protocolName && PROTOCOL_MECHANISMS[canonical]) {
    return PROTOCOL_MECHANISMS[canonical]
  }

  // Fuzzy match on keys and names — prefer longest (most specific) match
  let bestFuzzy: { mechanism: ProtocolMechanism; length: number } | null = null
  const searchNormalized = normalized.replace(/[^a-z0-9+]/g, '')

  for (const [key, mechanism] of Object.entries(PROTOCOL_MECHANISMS)) {
    const keyNormalized = key.toLowerCase().replace(/[^a-z0-9+]/g, '')
    const nameNormalized = mechanism.name.toLowerCase().replace(/[^a-z0-9+]/g, '')

    const matchLength = Math.max(
      searchNormalized.includes(keyNormalized) ? keyNormalized.length : 0,
      keyNormalized.includes(searchNormalized) ? searchNormalized.length : 0,
      searchNormalized.includes(nameNormalized) ? nameNormalized.length : 0,
      nameNormalized.includes(searchNormalized) ? searchNormalized.length : 0,
    )

    if (matchLength > 0 && (!bestFuzzy || matchLength > bestFuzzy.length)) {
      bestFuzzy = { mechanism, length: matchLength }
    }
  }

  return bestFuzzy?.mechanism ?? null
}

// Get insight template for a protocol and metric status
export function getProtocolInsight(
  protocolName: string,
  metricType: string,
  status: 'earlyImproving' | 'improving' | 'stable' | 'declining' | 'noData',
  change?: number
): string | null {
  const mechanism = findProtocolMechanism(protocolName)
  if (!mechanism) return null

  const template = mechanism.insightTemplates[status]
  if (!template) return null

  return template
    .replace('{metric}', metricType.replace(/_/g, ' '))
    .replace('{change}', change ? `${change > 0 ? '+' : ''}${change.toFixed(1)}%` : '')
}

// Check if a metric change aligns with expected effects
export function isChangeExpected(
  protocolName: string,
  metricType: string,
  direction: 'improving' | 'declining',
  weeksOnProtocol: number
): { expected: boolean; confidence: 'high' | 'medium' | 'low'; explanation: string } {
  const mechanism = findProtocolMechanism(protocolName)
  if (!mechanism) {
    return { expected: false, confidence: 'low', explanation: 'Unknown protocol' }
  }

  // Find if this metric is in any expected effect category
  for (const [category, effect] of Object.entries(mechanism.expectedEffects)) {
    if (effect.metrics.includes(metricType)) {
      const [minWeeks, maxWeeks] = effect.timelineWeeks
      const withinTimeline = weeksOnProtocol >= minWeeks && weeksOnProtocol <= maxWeeks * 1.5
      const directionMatches = (direction === 'improving' && effect.direction === 'improve') ||
                               (direction === 'declining' && effect.direction === 'decline')

      if (directionMatches && withinTimeline) {
        return {
          expected: true,
          confidence: effect.confidence,
          explanation: `${mechanism.name} typically affects ${category} within ${minWeeks}-${maxWeeks} weeks`
        }
      } else if (directionMatches && weeksOnProtocol < minWeeks) {
        return {
          expected: true,
          confidence: 'low',
          explanation: `Early signal—${mechanism.name} ${category} effects usually emerge around week ${minWeeks}`
        }
      }
    }
  }

  return {
    expected: false,
    confidence: 'low',
    explanation: `${metricType.replace(/_/g, ' ')} is not a primary expected effect of ${mechanism.name}`
  }
}

// Helper to convert confidence level to numeric score for sorting
export function confidenceScore(confidence: 'high' | 'medium' | 'low'): number {
  return { high: 3, medium: 2, low: 1 }[confidence]
}

// Get all metrics that a protocol is expected to affect
export function getAffectedMetrics(protocolName: string): string[] {
  const mechanism = findProtocolMechanism(protocolName)
  if (!mechanism) return []

  const allMetrics = new Set<string>()

  // Add primary monitor metrics
  mechanism.monitorMetrics.forEach(m => allMetrics.add(m))

  // Add secondary metrics if defined
  mechanism.secondaryMetrics?.forEach(m => allMetrics.add(m))

  // Add all metrics from expected effects
  Object.values(mechanism.expectedEffects).forEach(effect => {
    effect.metrics.forEach(m => allMetrics.add(m))
  })

  return Array.from(allMetrics)
}

// Get expected timeline for a specific metric effect
export function getExpectedTimeline(
  protocolName: string,
  metricType: string
): { minDays: number; maxDays: number; minWeeks: number; maxWeeks: number; confidence: 'high' | 'medium' | 'low' } | null {
  const mechanism = findProtocolMechanism(protocolName)
  if (!mechanism) return null

  for (const effect of Object.values(mechanism.expectedEffects)) {
    if (effect.metrics.includes(metricType)) {
      return {
        minDays: effect.timelineDays?.[0] ?? effect.timelineWeeks[0] * 7,
        maxDays: effect.timelineDays?.[1] ?? effect.timelineWeeks[1] * 7,
        minWeeks: effect.timelineWeeks[0],
        maxWeeks: effect.timelineWeeks[1],
        confidence: effect.confidence
      }
    }
  }

  return null
}

// Check if we're within expected timeline for effects
export function isWithinExpectedTimeline(
  protocolName: string,
  metricType: string,
  daysOnProtocol: number
): 'before' | 'within' | 'after' | null {
  const timeline = getExpectedTimeline(protocolName, metricType)
  if (!timeline) return null

  if (daysOnProtocol < timeline.minDays) return 'before'
  if (daysOnProtocol <= timeline.maxDays * 1.5) return 'within' // Allow 50% buffer
  return 'after'
}

// Get mechanism detail for why a protocol affects a metric
export function getMechanismDetail(
  protocolName: string,
  metricType: string
): string | null {
  const mechanism = findProtocolMechanism(protocolName)
  if (!mechanism) return null

  for (const effect of Object.values(mechanism.expectedEffects)) {
    if (effect.metrics.includes(metricType) && effect.mechanismDetail) {
      return effect.mechanismDetail
    }
  }

  return null
}

// Get research notes for a protocol
export function getResearchNotes(protocolName: string): string[] {
  const mechanism = findProtocolMechanism(protocolName)
  return mechanism?.researchNotes || []
}

// Get evidence level for a protocol
export function getEvidenceLevel(protocolName: string): 'clinical_trials' | 'preclinical' | 'anecdotal' | 'theoretical' | null {
  const mechanism = findProtocolMechanism(protocolName)
  return mechanism?.evidenceLevel || null
}

// Get potential confounds to consider
export function getConfounds(protocolName: string): string[] {
  const mechanism = findProtocolMechanism(protocolName)
  return mechanism?.confounds || []
}

// Get synergistic protocols
export function getSynergyProtocols(protocolName: string): string[] {
  const mechanism = findProtocolMechanism(protocolName)
  return mechanism?.synergyWith || []
}

// Get all protocols in the database
export function getAllProtocols(): string[] {
  return Object.keys(PROTOCOL_MECHANISMS)
}

// Get protocols by category
export function getProtocolsByCategory(category: 'peptide' | 'supplement' | 'medication'): string[] {
  return Object.entries(PROTOCOL_MECHANISMS)
    .filter(([, mechanism]) => mechanism.category === category)
    .map(([key]) => key)
}

// Get protocols by evidence level
export function getProtocolsByEvidenceLevel(level: 'clinical_trials' | 'preclinical' | 'anecdotal' | 'theoretical'): string[] {
  return Object.entries(PROTOCOL_MECHANISMS)
    .filter(([, mechanism]) => mechanism.evidenceLevel === level)
    .map(([key]) => key)
}
