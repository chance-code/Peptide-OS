// Compares a database against the schema produced by prisma/migrations (captured from a
// scratch DB with every migration applied) and reports missing tables / columns.
// With --apply, adds missing NULLABLE columns via ALTER TABLE ADD COLUMN (SQLite cannot add
// NOT NULL columns without a default; those are reported for manual handling). Never drops
// or rewrites anything. Safe to re-run.
//
// Usage: railway run npx tsx scripts/check-schema-drift.ts [--apply]
import 'dotenv/config'
import { createClient } from '@libsql/client'

type Col = { name: string; type: string; notnull: boolean; default: string | number | null; pk: boolean }
const EXPECTED: Record<string, Col[]> = {
"BayesianChangepoint": [
{
"name": "id",
"type": "TEXT",
"notnull": true,
"default": null,
"pk": true
},
{
"name": "userId",
"type": "TEXT",
"notnull": true,
"default": null,
"pk": false
},
{
"name": "protocolId",
"type": "TEXT",
"notnull": true,
"default": null,
"pk": false
},
{
"name": "metricType",
"type": "TEXT",
"notnull": true,
"default": null,
"pk": false
},
{
"name": "detectedDate",
"type": "DATETIME",
"notnull": true,
"default": null,
"pk": false
},
{
"name": "posteriorProb",
"type": "REAL",
"notnull": true,
"default": null,
"pk": false
},
{
"name": "credibleIntervalLo",
"type": "DATETIME",
"notnull": true,
"default": null,
"pk": false
},
{
"name": "credibleIntervalHi",
"type": "DATETIME",
"notnull": true,
"default": null,
"pk": false
},
{
"name": "effectSize",
"type": "REAL",
"notnull": false,
"default": null,
"pk": false
},
{
"name": "preMean",
"type": "REAL",
"notnull": false,
"default": null,
"pk": false
},
{
"name": "postMean",
"type": "REAL",
"notnull": false,
"default": null,
"pk": false
},
{
"name": "runLength",
"type": "INTEGER",
"notnull": false,
"default": null,
"pk": false
},
{
"name": "confidenceLevel",
"type": "TEXT",
"notnull": true,
"default": "'low'",
"pk": false
},
{
"name": "multiStreamCluster",
"type": "TEXT",
"notnull": false,
"default": null,
"pk": false
},
{
"name": "computedAt",
"type": "DATETIME",
"notnull": true,
"default": "CURRENT_TIMESTAMP",
"pk": false
}
],
"CausalAnalysis": [
{
"name": "id",
"type": "TEXT",
"notnull": true,
"default": null,
"pk": true
},
{
"name": "userId",
"type": "TEXT",
"notnull": true,
"default": null,
"pk": false
},
{
"name": "protocolId",
"type": "TEXT",
"notnull": true,
"default": null,
"pk": false
},
{
"name": "metricType",
"type": "TEXT",
"notnull": true,
"default": null,
"pk": false
},
{
"name": "unadjustedEffect",
"type": "REAL",
"notnull": true,
"default": null,
"pk": false
},
{
"name": "adjustedEffect",
"type": "REAL",
"notnull": true,
"default": null,
"pk": false
},
{
"name": "adjustmentDelta",
"type": "REAL",
"notnull": true,
"default": null,
"pk": false
},
{
"name": "confoundersJson",
"type": "TEXT",
"notnull": true,
"default": "'[]'",
"pk": false
},
{
"name": "causalDagJson",
"type": "TEXT",
"notnull": true,
"default": "'{}'",
"pk": false
},
{
"name": "confidenceLevel",
"type": "TEXT",
"notnull": true,
"default": "'low'",
"pk": false
},
{
"name": "narrativeExplanation",
"type": "TEXT",
"notnull": true,
"default": "''",
"pk": false
},
{
"name": "computedAt",
"type": "DATETIME",
"notnull": true,
"default": "CURRENT_TIMESTAMP",
"pk": false
}
],
"CohortInsight": [
{
"name": "id",
"type": "TEXT",
"notnull": true,
"default": null,
"pk": true
},
{
"name": "userId",
"type": "TEXT",
"notnull": true,
"default": null,
"pk": false
},
{
"name": "cohortKey",
"type": "TEXT",
"notnull": true,
"default": null,
"pk": false
},
{
"name": "title",
"type": "TEXT",
"notnull": true,
"default": null,
"pk": false
},
{
"name": "body",
"type": "TEXT",
"notnull": true,
"default": null,
"pk": false
},
{
"name": "sampleSize",
"type": "INTEGER",
"notnull": true,
"default": null,
"pk": false
},
{
"name": "medianEffect",
"type": "REAL",
"notnull": true,
"default": null,
"pk": false
},
{
"name": "percentileRank",
"type": "REAL",
"notnull": false,
"default": null,
"pk": false
},
{
"name": "generatedAt",
"type": "DATETIME",
"notnull": true,
"default": "CURRENT_TIMESTAMP",
"pk": false
},
{
"name": "expiresAt",
"type": "DATETIME",
"notnull": true,
"default": null,
"pk": false
}
],
"DeviceToken": [
{
"name": "id",
"type": "TEXT",
"notnull": true,
"default": null,
"pk": true
},
{
"name": "token",
"type": "TEXT",
"notnull": true,
"default": null,
"pk": false
},
{
"name": "platform",
"type": "TEXT",
"notnull": true,
"default": null,
"pk": false
},
{
"name": "userId",
"type": "TEXT",
"notnull": false,
"default": null,
"pk": false
},
{
"name": "enabled",
"type": "BOOLEAN",
"notnull": true,
"default": "true",
"pk": false
},
{
"name": "morningTime",
"type": "TEXT",
"notnull": false,
"default": null,
"pk": false
},
{
"name": "eveningTime",
"type": "TEXT",
"notnull": false,
"default": null,
"pk": false
},
{
"name": "createdAt",
"type": "DATETIME",
"notnull": true,
"default": "CURRENT_TIMESTAMP",
"pk": false
},
{
"name": "updatedAt",
"type": "DATETIME",
"notnull": true,
"default": null,
"pk": false
}
],
"DiscoveryInsight": [
{
"name": "id",
"type": "TEXT",
"notnull": true,
"default": null,
"pk": true
},
{
"name": "userId",
"type": "TEXT",
"notnull": true,
"default": null,
"pk": false
},
{
"name": "type",
"type": "TEXT",
"notnull": true,
"default": null,
"pk": false
},
{
"name": "title",
"type": "TEXT",
"notnull": true,
"default": null,
"pk": false
},
{
"name": "body",
"type": "TEXT",
"notnull": true,
"default": null,
"pk": false
},
{
"name": "domain",
"type": "TEXT",
"notnull": false,
"default": null,
"pk": false
},
{
"name": "relatedMarkers",
"type": "TEXT",
"notnull": false,
"default": null,
"pk": false
},
{
"name": "priority",
"type": "INTEGER",
"notnull": true,
"default": "5",
"pk": false
},
{
"name": "seen",
"type": "BOOLEAN",
"notnull": true,
"default": "false",
"pk": false
},
{
"name": "dismissed",
"type": "BOOLEAN",
"notnull": true,
"default": "false",
"pk": false
},
{
"name": "generatedAt",
"type": "DATETIME",
"notnull": true,
"default": "CURRENT_TIMESTAMP",
"pk": false
},
{
"name": "expiresAt",
"type": "DATETIME",
"notnull": false,
"default": null,
"pk": false
}
],
"DoseLog": [
{
"name": "id",
"type": "TEXT",
"notnull": true,
"default": null,
"pk": true
},
{
"name": "userId",
"type": "TEXT",
"notnull": true,
"default": null,
"pk": false
},
{
"name": "scheduleId",
"type": "TEXT",
"notnull": false,
"default": null,
"pk": false
},
{
"name": "protocolId",
"type": "TEXT",
"notnull": true,
"default": null,
"pk": false
},
{
"name": "scheduledDate",
"type": "DATETIME",
"notnull": true,
"default": null,
"pk": false
},
{
"name": "completedAt",
"type": "DATETIME",
"notnull": false,
"default": null,
"pk": false
},
{
"name": "timing",
"type": "TEXT",
"notnull": false,
"default": null,
"pk": false
},
{
"name": "status",
"type": "TEXT",
"notnull": true,
"default": null,
"pk": false
},
{
"name": "actualDose",
"type": "REAL",
"notnull": false,
"default": null,
"pk": false
},
{
"name": "actualUnit",
"type": "TEXT",
"notnull": false,
"default": null,
"pk": false
},
{
"name": "vialId",
"type": "TEXT",
"notnull": false,
"default": null,
"pk": false
},
{
"name": "volumeDrawnMl",
"type": "REAL",
"notnull": false,
"default": null,
"pk": false
},
{
"name": "concentrationAtDose",
"type": "REAL",
"notnull": false,
"default": null,
"pk": false
},
{
"name": "injectionSite",
"type": "TEXT",
"notnull": false,
"default": null,
"pk": false
},
{
"name": "phase",
"type": "TEXT",
"notnull": false,
"default": null,
"pk": false
},
{
"name": "notes",
"type": "TEXT",
"notnull": false,
"default": null,
"pk": false
},
{
"name": "createdAt",
"type": "DATETIME",
"notnull": true,
"default": "CURRENT_TIMESTAMP",
"pk": false
},
{
"name": "updatedAt",
"type": "DATETIME",
"notnull": true,
"default": null,
"pk": false
}
],
"DoseSchedule": [
{
"name": "id",
"type": "TEXT",
"notnull": true,
"default": null,
"pk": true
},
{
"name": "protocolId",
"type": "TEXT",
"notnull": true,
"default": null,
"pk": false
},
{
"name": "scheduledDate",
"type": "DATETIME",
"notnull": true,
"default": null,
"pk": false
},
{
"name": "doseAmount",
"type": "REAL",
"notnull": true,
"default": null,
"pk": false
},
{
"name": "doseUnit",
"type": "TEXT",
"notnull": true,
"default": null,
"pk": false
},
{
"name": "timing",
"type": "TEXT",
"notnull": false,
"default": null,
"pk": false
},
{
"name": "createdAt",
"type": "DATETIME",
"notnull": true,
"default": "CURRENT_TIMESTAMP",
"pk": false
}
],
"HealthBrainSnapshot": [
{
"name": "id",
"type": "TEXT",
"notnull": true,
"default": null,
"pk": true
},
{
"name": "userId",
"type": "TEXT",
"notnull": true,
"default": null,
"pk": false
},
{
"name": "triggerEvent",
"type": "TEXT",
"notnull": true,
"default": "'manual_refresh'",
"pk": false
},
{
"name": "evaluatedAt",
"type": "DATETIME",
"notnull": true,
"default": "CURRENT_TIMESTAMP",
"pk": false
},
{
"name": "pipelineMs",
"type": "INTEGER",
"notnull": false,
"default": null,
"pk": false
},
{
"name": "domainsJson",
"type": "TEXT",
"notnull": true,
"default": "'{}'",
"pk": false
},
{
"name": "agingVelocityJson",
"type": "TEXT",
"notnull": true,
"default": "'{}'",
"pk": false
},
{
"name": "allostasisJson",
"type": "TEXT",
"notnull": true,
"default": "'{}'",
"pk": false
},
{
"name": "riskTrajectoriesJson",
"type": "TEXT",
"notnull": true,
"default": "'{}'",
"pk": false
},
{
"name": "protocolEvidenceJson",
"type": "TEXT",
"notnull": true,
"default": "'[]'",
"pk": false
},
{
"name": "predictionsJson",
"type": "TEXT",
"notnull": true,
"default": "'[]'",
"pk": false
},
{
"name": "narrativesJson",
"type": "TEXT",
"notnull": true,
"default": "'[]'",
"pk": false
},
{
"name": "actionItemsJson",
"type": "TEXT",
"notnull": true,
"default": "'[]'",
"pk": false
},
{
"name": "unifiedScore",
"type": "REAL",
"notnull": false,
"default": null,
"pk": false
},
{
"name": "dailyStatusJson",
"type": "TEXT",
"notnull": true,
"default": "'{}'",
"pk": false
},
{
"name": "confidenceJson",
"type": "TEXT",
"notnull": true,
"default": "'{}'",
"pk": false
},
{
"name": "dataCompleteness",
"type": "REAL",
"notnull": true,
"default": "0",
"pk": false
},
{
"name": "agingVelocityPublishedJson",
"type": "TEXT",
"notnull": true,
"default": "'{}'",
"pk": false
},
{
"name": "agingVelocityPublishedAt",
"type": "DATETIME",
"notnull": false,
"default": null,
"pk": false
},
{
"name": "agingVelocityComputedAt",
"type": "DATETIME",
"notnull": false,
"default": null,
"pk": false
},
{
"name": "agingVelocityWindowDays",
"type": "INTEGER",
"notnull": true,
"default": "90",
"pk": false
},
{
"name": "agingVelocityVersion",
"type": "TEXT",
"notnull": true,
"default": "'2.0.0'",
"pk": false
},
{
"name": "createdAt",
"type": "DATETIME",
"notnull": true,
"default": "CURRENT_TIMESTAMP",
"pk": false
}
],
"HealthIntegration": [
{
"name": "id",
"type": "TEXT",
"notnull": true,
"default": null,
"pk": true
},
{
"name": "userId",
"type": "TEXT",
"notnull": true,
"default": null,
"pk": false
},
{
"name": "provider",
"type": "TEXT",
"notnull": true,
"default": null,
"pk": false
},
{
"name": "accessToken",
"type": "TEXT",
"notnull": false,
"default": null,
"pk": false
},
{
"name": "refreshToken",
"type": "TEXT",
"notnull": false,
"default": null,
"pk": false
},
{
"name": "tokenExpiry",
"type": "DATETIME",
"notnull": false,
"default": null,
"pk": false
},
{
"name": "isConnected",
"type": "BOOLEAN",
"notnull": true,
"default": "false",
"pk": false
},
{
"name": "lastSyncAt",
"type": "DATETIME",
"notnull": false,
"default": null,
"pk": false
},
{
"name": "syncError",
"type": "TEXT",
"notnull": false,
"default": null,
"pk": false
},
{
"name": "enabledMetrics",
"type": "TEXT",
"notnull": false,
"default": null,
"pk": false
},
{
"name": "createdAt",
"type": "DATETIME",
"notnull": true,
"default": "CURRENT_TIMESTAMP",
"pk": false
},
{
"name": "updatedAt",
"type": "DATETIME",
"notnull": true,
"default": null,
"pk": false
}
],
"HealthMetric": [
{
"name": "id",
"type": "TEXT",
"notnull": true,
"default": null,
"pk": true
},
{
"name": "userId",
"type": "TEXT",
"notnull": true,
"default": null,
"pk": false
},
{
"name": "provider",
"type": "TEXT",
"notnull": true,
"default": null,
"pk": false
},
{
"name": "metricType",
"type": "TEXT",
"notnull": true,
"default": null,
"pk": false
},
{
"name": "value",
"type": "REAL",
"notnull": true,
"default": null,
"pk": false
},
{
"name": "unit",
"type": "TEXT",
"notnull": true,
"default": null,
"pk": false
},
{
"name": "recordedAt",
"type": "DATETIME",
"notnull": true,
"default": null,
"pk": false
},
{
"name": "context",
"type": "TEXT",
"notnull": false,
"default": null,
"pk": false
},
{
"name": "createdAt",
"type": "DATETIME",
"notnull": true,
"default": "CURRENT_TIMESTAMP",
"pk": false
}
],
"HealthPrediction": [
{
"name": "id",
"type": "TEXT",
"notnull": true,
"default": null,
"pk": true
},
{
"name": "userId",
"type": "TEXT",
"notnull": true,
"default": null,
"pk": false
},
{
"name": "biomarkerKey",
"type": "TEXT",
"notnull": true,
"default": null,
"pk": false
},
{
"name": "currentEstimate",
"type": "REAL",
"notnull": false,
"default": null,
"pk": false
},
{
"name": "currentCI",
"type": "TEXT",
"notnull": false,
"default": null,
"pk": false
},
{
"name": "forecast3m",
"type": "REAL",
"notnull": false,
"default": null,
"pk": false
},
{
"name": "forecast3mCI",
"type": "TEXT",
"notnull": false,
"default": null,
"pk": false
},
{
"name": "forecast6m",
"type": "REAL",
"notnull": false,
"default": null,
"pk": false
},
{
"name": "forecast6mCI",
"type": "TEXT",
"notnull": false,
"default": null,
"pk": false
},
{
"name": "thresholdCrossProb",
"type": "REAL",
"notnull": false,
"default": null,
"pk": false
},
{
"name": "thresholdType",
"type": "TEXT",
"notnull": false,
"default": null,
"pk": false
},
{
"name": "dataPoints",
"type": "INTEGER",
"notnull": true,
"default": "0",
"pk": false
},
{
"name": "confidenceLevel",
"type": "TEXT",
"notnull": true,
"default": "'low'",
"pk": false
},
{
"name": "stalenessWarning",
"type": "TEXT",
"notnull": false,
"default": null,
"pk": false
},
{
"name": "protocolAdjustmentJson",
"type": "TEXT",
"notnull": false,
"default": null,
"pk": false
},
{
"name": "computedAt",
"type": "DATETIME",
"notnull": true,
"default": "CURRENT_TIMESTAMP",
"pk": false
}
],
"HealthSyncLog": [
{
"name": "id",
"type": "TEXT",
"notnull": true,
"default": null,
"pk": true
},
{
"name": "userId",
"type": "TEXT",
"notnull": true,
"default": null,
"pk": false
},
{
"name": "provider",
"type": "TEXT",
"notnull": true,
"default": null,
"pk": false
},
{
"name": "status",
"type": "TEXT",
"notnull": true,
"default": null,
"pk": false
},
{
"name": "metricsCount",
"type": "INTEGER",
"notnull": true,
"default": "0",
"pk": false
},
{
"name": "errorMessage",
"type": "TEXT",
"notnull": false,
"default": null,
"pk": false
},
{
"name": "startedAt",
"type": "DATETIME",
"notnull": true,
"default": null,
"pk": false
},
{
"name": "completedAt",
"type": "DATETIME",
"notnull": false,
"default": null,
"pk": false
}
],
"InsightEngagement": [
{
"name": "id",
"type": "TEXT",
"notnull": true,
"default": null,
"pk": true
},
{
"name": "userId",
"type": "TEXT",
"notnull": true,
"default": null,
"pk": false
},
{
"name": "insightId",
"type": "TEXT",
"notnull": true,
"default": null,
"pk": false
},
{
"name": "insightType",
"type": "TEXT",
"notnull": true,
"default": null,
"pk": false
},
{
"name": "action",
"type": "TEXT",
"notnull": true,
"default": null,
"pk": false
},
{
"name": "value",
"type": "REAL",
"notnull": false,
"default": null,
"pk": false
},
{
"name": "createdAt",
"type": "DATETIME",
"notnull": true,
"default": "CURRENT_TIMESTAMP",
"pk": false
}
],
"InventoryVial": [
{
"name": "id",
"type": "TEXT",
"notnull": true,
"default": null,
"pk": true
},
{
"name": "userId",
"type": "TEXT",
"notnull": true,
"default": null,
"pk": false
},
{
"name": "peptideId",
"type": "TEXT",
"notnull": true,
"default": null,
"pk": false
},
{
"name": "identifier",
"type": "TEXT",
"notnull": false,
"default": null,
"pk": false
},
{
"name": "totalAmount",
"type": "REAL",
"notnull": true,
"default": null,
"pk": false
},
{
"name": "totalUnit",
"type": "TEXT",
"notnull": true,
"default": null,
"pk": false
},
{
"name": "diluentVolume",
"type": "REAL",
"notnull": false,
"default": null,
"pk": false
},
{
"name": "concentration",
"type": "REAL",
"notnull": false,
"default": null,
"pk": false
},
{
"name": "concentrationUnit",
"type": "TEXT",
"notnull": false,
"default": null,
"pk": false
},
{
"name": "dateReceived",
"type": "DATETIME",
"notnull": false,
"default": null,
"pk": false
},
{
"name": "dateReconstituted",
"type": "DATETIME",
"notnull": false,
"default": null,
"pk": false
},
{
"name": "expirationDate",
"type": "DATETIME",
"notnull": false,
"default": null,
"pk": false
},
{
"name": "remainingAmount",
"type": "REAL",
"notnull": false,
"default": null,
"pk": false
},
{
"name": "isExpired",
"type": "BOOLEAN",
"notnull": true,
"default": "false",
"pk": false
},
{
"name": "isExhausted",
"type": "BOOLEAN",
"notnull": true,
"default": "false",
"pk": false
},
{
"name": "notes",
"type": "TEXT",
"notnull": false,
"default": null,
"pk": false
},
{
"name": "createdAt",
"type": "DATETIME",
"notnull": true,
"default": "CURRENT_TIMESTAMP",
"pk": false
},
{
"name": "updatedAt",
"type": "DATETIME",
"notnull": true,
"default": null,
"pk": false
},
{
"name": "itemCount",
"type": "INTEGER",
"notnull": false,
"default": null,
"pk": false
},
{
"name": "remainingCount",
"type": "INTEGER",
"notnull": false,
"default": null,
"pk": false
},
{
"name": "remainingVolumeMl",
"type": "REAL",
"notnull": false,
"default": null,
"pk": false
}
],
"LabBiomarker": [
{
"name": "id",
"type": "TEXT",
"notnull": true,
"default": null,
"pk": true
},
{
"name": "uploadId",
"type": "TEXT",
"notnull": true,
"default": null,
"pk": false
},
{
"name": "biomarkerKey",
"type": "TEXT",
"notnull": true,
"default": null,
"pk": false
},
{
"name": "rawName",
"type": "TEXT",
"notnull": false,
"default": null,
"pk": false
},
{
"name": "value",
"type": "REAL",
"notnull": true,
"default": null,
"pk": false
},
{
"name": "unit",
"type": "TEXT",
"notnull": true,
"default": null,
"pk": false
},
{
"name": "originalValue",
"type": "REAL",
"notnull": false,
"default": null,
"pk": false
},
{
"name": "originalUnit",
"type": "TEXT",
"notnull": false,
"default": null,
"pk": false
},
{
"name": "rangeLow",
"type": "REAL",
"notnull": false,
"default": null,
"pk": false
},
{
"name": "rangeHigh",
"type": "REAL",
"notnull": false,
"default": null,
"pk": false
},
{
"name": "flag",
"type": "TEXT",
"notnull": true,
"default": null,
"pk": false
},
{
"name": "confidence",
"type": "REAL",
"notnull": false,
"default": null,
"pk": false
},
{
"name": "category",
"type": "TEXT",
"notnull": false,
"default": null,
"pk": false
},
{
"name": "createdAt",
"type": "DATETIME",
"notnull": true,
"default": "CURRENT_TIMESTAMP",
"pk": false
}
],
"LabEventReview": [
{
"name": "id",
"type": "TEXT",
"notnull": true,
"default": null,
"pk": true
},
{
"name": "userId",
"type": "TEXT",
"notnull": true,
"default": null,
"pk": false
},
{
"name": "labUploadId",
"type": "TEXT",
"notnull": true,
"default": null,
"pk": false
},
{
"name": "labDate",
"type": "DATETIME",
"notnull": true,
"default": null,
"pk": false
},
{
"name": "domainSummaries",
"type": "TEXT",
"notnull": true,
"default": "'[]'",
"pk": false
},
{
"name": "markerDeltas",
"type": "TEXT",
"notnull": true,
"default": "'[]'",
"pk": false
},
{
"name": "predictions",
"type": "TEXT",
"notnull": true,
"default": "'[]'",
"pk": false
},
{
"name": "protocolScores",
"type": "TEXT",
"notnull": true,
"default": "'[]'",
"pk": false
},
{
"name": "evidenceLedger",
"type": "TEXT",
"notnull": true,
"default": "'[]'",
"pk": false
},
{
"name": "trialCyclePhase",
"type": "TEXT",
"notnull": true,
"default": "'plan'",
"pk": false
},
{
"name": "verdictHeadline",
"type": "TEXT",
"notnull": true,
"default": "''",
"pk": false
},
{
"name": "verdictTakeaways",
"type": "TEXT",
"notnull": true,
"default": "'[]'",
"pk": false
},
{
"name": "verdictFocus",
"type": "TEXT",
"notnull": true,
"default": "''",
"pk": false
},
{
"name": "verdictConfidence",
"type": "TEXT",
"notnull": true,
"default": "'low'",
"pk": false
},
{
"name": "computedAt",
"type": "DATETIME",
"notnull": true,
"default": "CURRENT_TIMESTAMP",
"pk": false
},
{
"name": "updatedAt",
"type": "DATETIME",
"notnull": true,
"default": null,
"pk": false
}
],
"LabPriorResetEvent": [
{
"name": "id",
"type": "TEXT",
"notnull": true,
"default": null,
"pk": true
},
{
"name": "userId",
"type": "TEXT",
"notnull": true,
"default": null,
"pk": false
},
{
"name": "labUploadId",
"type": "TEXT",
"notnull": true,
"default": null,
"pk": false
},
{
"name": "baselinesUpdated",
"type": "INTEGER",
"notnull": true,
"default": "0",
"pk": false
},
{
"name": "hypothesesResolved",
"type": "INTEGER",
"notnull": true,
"default": "0",
"pk": false
},
{
"name": "domainsReweighted",
"type": "INTEGER",
"notnull": true,
"default": "0",
"pk": false
},
{
"name": "protocolsReassessed",
"type": "INTEGER",
"notnull": true,
"default": "0",
"pk": false
},
{
"name": "wearableSignalsQuieted",
"type": "INTEGER",
"notnull": true,
"default": "0",
"pk": false
},
{
"name": "summaryNarrative",
"type": "TEXT",
"notnull": false,
"default": null,
"pk": false
},
{
"name": "createdAt",
"type": "DATETIME",
"notnull": true,
"default": "CURRENT_TIMESTAMP",
"pk": false
}
],
"LabResult": [
{
"name": "id",
"type": "TEXT",
"notnull": true,
"default": null,
"pk": true
},
{
"name": "userId",
"type": "TEXT",
"notnull": true,
"default": null,
"pk": false
},
{
"name": "testDate",
"type": "DATETIME",
"notnull": true,
"default": null,
"pk": false
},
{
"name": "labName",
"type": "TEXT",
"notnull": false,
"default": null,
"pk": false
},
{
"name": "notes",
"type": "TEXT",
"notnull": false,
"default": null,
"pk": false
},
{
"name": "markers",
"type": "TEXT",
"notnull": true,
"default": "'[]'",
"pk": false
},
{
"name": "createdAt",
"type": "DATETIME",
"notnull": true,
"default": "CURRENT_TIMESTAMP",
"pk": false
},
{
"name": "updatedAt",
"type": "DATETIME",
"notnull": true,
"default": null,
"pk": false
}
],
"LabUpload": [
{
"name": "id",
"type": "TEXT",
"notnull": true,
"default": null,
"pk": true
},
{
"name": "userId",
"type": "TEXT",
"notnull": true,
"default": null,
"pk": false
},
{
"name": "testDate",
"type": "DATETIME",
"notnull": true,
"default": null,
"pk": false
},
{
"name": "labName",
"type": "TEXT",
"notnull": false,
"default": null,
"pk": false
},
{
"name": "source",
"type": "TEXT",
"notnull": true,
"default": "'manual'",
"pk": false
},
{
"name": "notes",
"type": "TEXT",
"notnull": false,
"default": null,
"pk": false
},
{
"name": "rawText",
"type": "TEXT",
"notnull": false,
"default": null,
"pk": false
},
{
"name": "confidence",
"type": "REAL",
"notnull": false,
"default": null,
"pk": false
},
{
"name": "fileName",
"type": "TEXT",
"notnull": false,
"default": null,
"pk": false
},
{
"name": "createdAt",
"type": "DATETIME",
"notnull": true,
"default": "CURRENT_TIMESTAMP",
"pk": false
},
{
"name": "updatedAt",
"type": "DATETIME",
"notnull": true,
"default": null,
"pk": false
}
],
"Note": [
{
"name": "id",
"type": "TEXT",
"notnull": true,
"default": null,
"pk": true
},
{
"name": "entityType",
"type": "TEXT",
"notnull": true,
"default": null,
"pk": false
},
{
"name": "entityId",
"type": "TEXT",
"notnull": true,
"default": null,
"pk": false
},
{
"name": "content",
"type": "TEXT",
"notnull": true,
"default": null,
"pk": false
},
{
"name": "createdAt",
"type": "DATETIME",
"notnull": true,
"default": "CURRENT_TIMESTAMP",
"pk": false
},
{
"name": "updatedAt",
"type": "DATETIME",
"notnull": true,
"default": null,
"pk": false
}
],
"Peptide": [
{
"name": "id",
"type": "TEXT",
"notnull": true,
"default": null,
"pk": true
},
{
"name": "name",
"type": "TEXT",
"notnull": true,
"default": null,
"pk": false
},
{
"name": "type",
"type": "TEXT",
"notnull": true,
"default": "'peptide'",
"pk": false
},
{
"name": "category",
"type": "TEXT",
"notnull": false,
"default": null,
"pk": false
},
{
"name": "description",
"type": "TEXT",
"notnull": false,
"default": null,
"pk": false
},
{
"name": "storageNotes",
"type": "TEXT",
"notnull": false,
"default": null,
"pk": false
},
{
"name": "createdAt",
"type": "DATETIME",
"notnull": true,
"default": "CURRENT_TIMESTAMP",
"pk": false
},
{
"name": "updatedAt",
"type": "DATETIME",
"notnull": true,
"default": null,
"pk": false
},
{
"name": "canonicalName",
"type": "TEXT",
"notnull": false,
"default": null,
"pk": false
}
],
"PersonalBaseline": [
{
"name": "id",
"type": "TEXT",
"notnull": true,
"default": null,
"pk": true
},
{
"name": "userId",
"type": "TEXT",
"notnull": true,
"default": null,
"pk": false
},
{
"name": "biomarkerKey",
"type": "TEXT",
"notnull": true,
"default": null,
"pk": false
},
{
"name": "personalMean",
"type": "REAL",
"notnull": true,
"default": null,
"pk": false
},
{
"name": "personalSD",
"type": "REAL",
"notnull": true,
"default": null,
"pk": false
},
{
"name": "drawCount",
"type": "INTEGER",
"notnull": true,
"default": "0",
"pk": false
},
{
"name": "populationPercentile",
"type": "REAL",
"notnull": false,
"default": null,
"pk": false
},
{
"name": "trend",
"type": "TEXT",
"notnull": true,
"default": "'stable'",
"pk": false
},
{
"name": "trendConfidence",
"type": "REAL",
"notnull": true,
"default": "0",
"pk": false
},
{
"name": "lastLabValue",
"type": "REAL",
"notnull": false,
"default": null,
"pk": false
},
{
"name": "lastLabDate",
"type": "DATETIME",
"notnull": false,
"default": null,
"pk": false
},
{
"name": "updatedAt",
"type": "DATETIME",
"notnull": true,
"default": null,
"pk": false
},
{
"name": "createdAt",
"type": "DATETIME",
"notnull": true,
"default": "CURRENT_TIMESTAMP",
"pk": false
}
],
"PreDrawContext": [
{
"name": "id",
"type": "TEXT",
"notnull": true,
"default": null,
"pk": true
},
{
"name": "labUploadId",
"type": "TEXT",
"notnull": true,
"default": null,
"pk": false
},
{
"name": "exercisedWithin24h",
"type": "BOOLEAN",
"notnull": true,
"default": "false",
"pk": false
},
{
"name": "fastingHours",
"type": "INTEGER",
"notnull": false,
"default": null,
"pk": false
},
{
"name": "recentIllness",
"type": "BOOLEAN",
"notnull": true,
"default": "false",
"pk": false
},
{
"name": "illnessType",
"type": "TEXT",
"notnull": false,
"default": null,
"pk": false
},
{
"name": "drawTime",
"type": "TEXT",
"notnull": false,
"default": null,
"pk": false
},
{
"name": "newSupplements",
"type": "TEXT",
"notnull": false,
"default": null,
"pk": false
},
{
"name": "unusualStress",
"type": "BOOLEAN",
"notnull": true,
"default": "false",
"pk": false
},
{
"name": "notes",
"type": "TEXT",
"notnull": false,
"default": null,
"pk": false
},
{
"name": "createdAt",
"type": "DATETIME",
"notnull": true,
"default": "CURRENT_TIMESTAMP",
"pk": false
}
],
"Protocol": [
{
"name": "id",
"type": "TEXT",
"notnull": true,
"default": null,
"pk": true
},
{
"name": "userId",
"type": "TEXT",
"notnull": true,
"default": null,
"pk": false
},
{
"name": "peptideId",
"type": "TEXT",
"notnull": true,
"default": null,
"pk": false
},
{
"name": "startDate",
"type": "DATETIME",
"notnull": true,
"default": null,
"pk": false
},
{
"name": "endDate",
"type": "DATETIME",
"notnull": false,
"default": null,
"pk": false
},
{
"name": "frequency",
"type": "TEXT",
"notnull": true,
"default": null,
"pk": false
},
{
"name": "customDays",
"type": "TEXT",
"notnull": false,
"default": null,
"pk": false
},
{
"name": "doseAmount",
"type": "REAL",
"notnull": true,
"default": null,
"pk": false
},
{
"name": "doseUnit",
"type": "TEXT",
"notnull": true,
"default": null,
"pk": false
},
{
"name": "timing",
"type": "TEXT",
"notnull": false,
"default": null,
"pk": false
},
{
"name": "timings",
"type": "TEXT",
"notnull": false,
"default": null,
"pk": false
},
{
"name": "vialAmount",
"type": "REAL",
"notnull": false,
"default": null,
"pk": false
},
{
"name": "vialUnit",
"type": "TEXT",
"notnull": false,
"default": null,
"pk": false
},
{
"name": "diluentVolume",
"type": "REAL",
"notnull": false,
"default": null,
"pk": false
},
{
"name": "servingSize",
"type": "INTEGER",
"notnull": false,
"default": null,
"pk": false
},
{
"name": "servingUnit",
"type": "TEXT",
"notnull": false,
"default": null,
"pk": false
},
{
"name": "status",
"type": "TEXT",
"notnull": true,
"default": "'active'",
"pk": false
},
{
"name": "pausedAt",
"type": "DATETIME",
"notnull": false,
"default": null,
"pk": false
},
{
"name": "cycleMode",
"type": "TEXT",
"notnull": true,
"default": "'continuous'",
"pk": false
},
{
"name": "siteRotationEnabled",
"type": "BOOLEAN",
"notnull": true,
"default": "false",
"pk": false
},
{
"name": "notes",
"type": "TEXT",
"notnull": false,
"default": null,
"pk": false
},
{
"name": "createdAt",
"type": "DATETIME",
"notnull": true,
"default": "CURRENT_TIMESTAMP",
"pk": false
},
{
"name": "updatedAt",
"type": "DATETIME",
"notnull": true,
"default": null,
"pk": false
}
],
"ProtocolCycle": [
{
"name": "id",
"type": "TEXT",
"notnull": true,
"default": null,
"pk": true
},
{
"name": "protocolId",
"type": "TEXT",
"notnull": true,
"default": null,
"pk": false
},
{
"name": "onDays",
"type": "INTEGER",
"notnull": true,
"default": null,
"pk": false
},
{
"name": "offDays",
"type": "INTEGER",
"notnull": true,
"default": null,
"pk": false
},
{
"name": "cycleStartDate",
"type": "DATETIME",
"notnull": true,
"default": null,
"pk": false
},
{
"name": "repeatCount",
"type": "INTEGER",
"notnull": true,
"default": "-1",
"pk": false
},
{
"name": "createdAt",
"type": "DATETIME",
"notnull": true,
"default": "CURRENT_TIMESTAMP",
"pk": false
},
{
"name": "updatedAt",
"type": "DATETIME",
"notnull": true,
"default": null,
"pk": false
}
],
"ProtocolHistory": [
{
"name": "id",
"type": "TEXT",
"notnull": true,
"default": null,
"pk": true
},
{
"name": "protocolId",
"type": "TEXT",
"notnull": true,
"default": null,
"pk": false
},
{
"name": "changeType",
"type": "TEXT",
"notnull": true,
"default": null,
"pk": false
},
{
"name": "changeData",
"type": "TEXT",
"notnull": true,
"default": null,
"pk": false
},
{
"name": "createdAt",
"type": "DATETIME",
"notnull": true,
"default": "CURRENT_TIMESTAMP",
"pk": false
}
],
"ProtocolInsightCache": [
{
"name": "id",
"type": "TEXT",
"notnull": true,
"default": null,
"pk": true
},
{
"name": "protocolId",
"type": "TEXT",
"notnull": true,
"default": null,
"pk": false
},
{
"name": "insightJson",
"type": "TEXT",
"notnull": true,
"default": null,
"pk": false
},
{
"name": "protocolHash",
"type": "TEXT",
"notnull": true,
"default": null,
"pk": false
},
{
"name": "computedAt",
"type": "DATETIME",
"notnull": true,
"default": "CURRENT_TIMESTAMP",
"pk": false
}
],
"ProtocolLabExpectation": [
{
"name": "id",
"type": "TEXT",
"notnull": true,
"default": null,
"pk": true
},
{
"name": "protocolId",
"type": "TEXT",
"notnull": true,
"default": null,
"pk": false
},
{
"name": "biomarkerKey",
"type": "TEXT",
"notnull": true,
"default": null,
"pk": false
},
{
"name": "expectedDirection",
"type": "TEXT",
"notnull": true,
"default": null,
"pk": false
},
{
"name": "expectedMagnitudeRange",
"type": "TEXT",
"notnull": true,
"default": null,
"pk": false
},
{
"name": "onsetWeeks",
"type": "TEXT",
"notnull": true,
"default": null,
"pk": false
},
{
"name": "peakWeeks",
"type": "TEXT",
"notnull": true,
"default": null,
"pk": false
},
{
"name": "evidenceLevel",
"type": "TEXT",
"notnull": true,
"default": null,
"pk": false
},
{
"name": "mechanism",
"type": "TEXT",
"notnull": false,
"default": null,
"pk": false
},
{
"name": "createdAt",
"type": "DATETIME",
"notnull": true,
"default": "CURRENT_TIMESTAMP",
"pk": false
},
{
"name": "updatedAt",
"type": "DATETIME",
"notnull": true,
"default": null,
"pk": false
}
],
"PushSubscription": [
{
"name": "id",
"type": "TEXT",
"notnull": true,
"default": null,
"pk": true
},
{
"name": "endpoint",
"type": "TEXT",
"notnull": true,
"default": null,
"pk": false
},
{
"name": "p256dh",
"type": "TEXT",
"notnull": true,
"default": null,
"pk": false
},
{
"name": "auth",
"type": "TEXT",
"notnull": true,
"default": null,
"pk": false
},
{
"name": "userId",
"type": "TEXT",
"notnull": false,
"default": null,
"pk": false
},
{
"name": "enabled",
"type": "BOOLEAN",
"notnull": true,
"default": "true",
"pk": false
},
{
"name": "morningTime",
"type": "TEXT",
"notnull": false,
"default": null,
"pk": false
},
{
"name": "eveningTime",
"type": "TEXT",
"notnull": false,
"default": null,
"pk": false
},
{
"name": "createdAt",
"type": "DATETIME",
"notnull": true,
"default": "CURRENT_TIMESTAMP",
"pk": false
},
{
"name": "updatedAt",
"type": "DATETIME",
"notnull": true,
"default": null,
"pk": false
}
],
"Reconstitution": [
{
"name": "id",
"type": "TEXT",
"notnull": true,
"default": null,
"pk": true
},
{
"name": "userId",
"type": "TEXT",
"notnull": true,
"default": null,
"pk": false
},
{
"name": "peptideId",
"type": "TEXT",
"notnull": true,
"default": null,
"pk": false
},
{
"name": "vialAmount",
"type": "REAL",
"notnull": true,
"default": null,
"pk": false
},
{
"name": "vialUnit",
"type": "TEXT",
"notnull": true,
"default": null,
"pk": false
},
{
"name": "diluentVolume",
"type": "REAL",
"notnull": true,
"default": null,
"pk": false
},
{
"name": "concentration",
"type": "REAL",
"notnull": true,
"default": null,
"pk": false
},
{
"name": "concentrationUnit",
"type": "TEXT",
"notnull": true,
"default": null,
"pk": false
},
{
"name": "targetDose",
"type": "REAL",
"notnull": false,
"default": null,
"pk": false
},
{
"name": "targetUnit",
"type": "TEXT",
"notnull": false,
"default": null,
"pk": false
},
{
"name": "volumePerDose",
"type": "REAL",
"notnull": false,
"default": null,
"pk": false
},
{
"name": "inventoryVialId",
"type": "TEXT",
"notnull": false,
"default": null,
"pk": false
},
{
"name": "notes",
"type": "TEXT",
"notnull": false,
"default": null,
"pk": false
},
{
"name": "createdAt",
"type": "DATETIME",
"notnull": true,
"default": "CURRENT_TIMESTAMP",
"pk": false
},
{
"name": "updatedAt",
"type": "DATETIME",
"notnull": true,
"default": null,
"pk": false
}
],
"TitrationStep": [
{
"name": "id",
"type": "TEXT",
"notnull": true,
"default": null,
"pk": true
},
{
"name": "protocolId",
"type": "TEXT",
"notnull": true,
"default": null,
"pk": false
},
{
"name": "stepIndex",
"type": "INTEGER",
"notnull": true,
"default": null,
"pk": false
},
{
"name": "weekOffset",
"type": "INTEGER",
"notnull": true,
"default": null,
"pk": false
},
{
"name": "doseAmount",
"type": "REAL",
"notnull": true,
"default": null,
"pk": false
},
{
"name": "doseUnit",
"type": "TEXT",
"notnull": true,
"default": null,
"pk": false
},
{
"name": "notes",
"type": "TEXT",
"notnull": false,
"default": null,
"pk": false
},
{
"name": "createdAt",
"type": "DATETIME",
"notnull": true,
"default": "CURRENT_TIMESTAMP",
"pk": false
},
{
"name": "updatedAt",
"type": "DATETIME",
"notnull": true,
"default": null,
"pk": false
}
],
"UserBiologicalLiteracy": [
{
"name": "id",
"type": "TEXT",
"notnull": true,
"default": null,
"pk": true
},
{
"name": "userId",
"type": "TEXT",
"notnull": true,
"default": null,
"pk": false
},
{
"name": "level",
"type": "TEXT",
"notnull": true,
"default": "'explorer'",
"pk": false
},
{
"name": "selfSelected",
"type": "BOOLEAN",
"notnull": true,
"default": "false",
"pk": false
},
{
"name": "detailTaps",
"type": "INTEGER",
"notnull": true,
"default": "0",
"pk": false
},
{
"name": "labViewCount",
"type": "INTEGER",
"notnull": true,
"default": "0",
"pk": false
},
{
"name": "insightViews",
"type": "INTEGER",
"notnull": true,
"default": "0",
"pk": false
},
{
"name": "lastLevelChange",
"type": "DATETIME",
"notnull": false,
"default": null,
"pk": false
},
{
"name": "createdAt",
"type": "DATETIME",
"notnull": true,
"default": "CURRENT_TIMESTAMP",
"pk": false
},
{
"name": "updatedAt",
"type": "DATETIME",
"notnull": true,
"default": null,
"pk": false
}
],
"UserHypothesis": [
{
"name": "id",
"type": "TEXT",
"notnull": true,
"default": null,
"pk": true
},
{
"name": "userId",
"type": "TEXT",
"notnull": true,
"default": null,
"pk": false
},
{
"name": "title",
"type": "TEXT",
"notnull": true,
"default": null,
"pk": false
},
{
"name": "description",
"type": "TEXT",
"notnull": false,
"default": null,
"pk": false
},
{
"name": "interventionType",
"type": "TEXT",
"notnull": true,
"default": null,
"pk": false
},
{
"name": "interventionId",
"type": "TEXT",
"notnull": false,
"default": null,
"pk": false
},
{
"name": "metricType",
"type": "TEXT",
"notnull": true,
"default": null,
"pk": false
},
{
"name": "expectedDirection",
"type": "TEXT",
"notnull": true,
"default": null,
"pk": false
},
{
"name": "status",
"type": "TEXT",
"notnull": true,
"default": "'active'",
"pk": false
},
{
"name": "resultSummary",
"type": "TEXT",
"notnull": false,
"default": null,
"pk": false
},
{
"name": "createdAt",
"type": "DATETIME",
"notnull": true,
"default": "CURRENT_TIMESTAMP",
"pk": false
},
{
"name": "completedAt",
"type": "DATETIME",
"notnull": false,
"default": null,
"pk": false
}
],
"UserProfile": [
{
"name": "id",
"type": "TEXT",
"notnull": true,
"default": null,
"pk": true
},
{
"name": "name",
"type": "TEXT",
"notnull": true,
"default": null,
"pk": false
},
{
"name": "notes",
"type": "TEXT",
"notnull": false,
"default": null,
"pk": false
},
{
"name": "isActive",
"type": "BOOLEAN",
"notnull": true,
"default": "false",
"pk": false
},
{
"name": "cohortOptIn",
"type": "BOOLEAN",
"notnull": true,
"default": "false",
"pk": false
},
{
"name": "createdAt",
"type": "DATETIME",
"notnull": true,
"default": "CURRENT_TIMESTAMP",
"pk": false
},
{
"name": "updatedAt",
"type": "DATETIME",
"notnull": true,
"default": null,
"pk": false
}
],
"WearableLabCorrelation": [
{
"name": "id",
"type": "TEXT",
"notnull": true,
"default": null,
"pk": true
},
{
"name": "userId",
"type": "TEXT",
"notnull": true,
"default": null,
"pk": false
},
{
"name": "wearableMetricType",
"type": "TEXT",
"notnull": true,
"default": null,
"pk": false
},
{
"name": "biomarkerKey",
"type": "TEXT",
"notnull": true,
"default": null,
"pk": false
},
{
"name": "correlationCoefficient",
"type": "REAL",
"notnull": true,
"default": null,
"pk": false
},
{
"name": "sampleSize",
"type": "INTEGER",
"notnull": true,
"default": null,
"pk": false
},
{
"name": "directionality",
"type": "TEXT",
"notnull": true,
"default": null,
"pk": false
},
{
"name": "lastUpdated",
"type": "DATETIME",
"notnull": true,
"default": "CURRENT_TIMESTAMP",
"pk": false
},
{
"name": "createdAt",
"type": "DATETIME",
"notnull": true,
"default": "CURRENT_TIMESTAMP",
"pk": false
}
],
"WeeklyHealthBrief": [
{
"name": "id",
"type": "TEXT",
"notnull": true,
"default": null,
"pk": true
},
{
"name": "userId",
"type": "TEXT",
"notnull": true,
"default": null,
"pk": false
},
{
"name": "weekStartDate",
"type": "DATETIME",
"notnull": true,
"default": null,
"pk": false
},
{
"name": "headline",
"type": "TEXT",
"notnull": true,
"default": null,
"pk": false
},
{
"name": "domainSummaries",
"type": "TEXT",
"notnull": true,
"default": null,
"pk": false
},
{
"name": "protocolUpdates",
"type": "TEXT",
"notnull": true,
"default": null,
"pk": false
},
{
"name": "actionItems",
"type": "TEXT",
"notnull": true,
"default": null,
"pk": false
},
{
"name": "labStatus",
"type": "TEXT",
"notnull": true,
"default": null,
"pk": false
},
{
"name": "lookAhead",
"type": "TEXT",
"notnull": true,
"default": null,
"pk": false
},
{
"name": "createdAt",
"type": "DATETIME",
"notnull": true,
"default": "CURRENT_TIMESTAMP",
"pk": false
},
{
"name": "updatedAt",
"type": "DATETIME",
"notnull": true,
"default": null,
"pk": false
}
]
}

async function main() {
  const apply = process.argv.includes('--apply')
  const url = process.env.TURSO_DATABASE_URL
  if (!url) throw new Error('TURSO_DATABASE_URL must be set')
  const client = createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN })
  console.log(`[drift] connecting to ${url.slice(0, 40)}... (${apply ? 'APPLY' : 'report only'})`)

  const tablesRes = await client.execute(`SELECT name FROM sqlite_master WHERE type='table'`)
  const existing = new Set(tablesRes.rows.map((r) => String(r.name)))
  const missingTables: string[] = []
  const missingCols: { table: string; col: Col }[] = []

  for (const [table, cols] of Object.entries(EXPECTED)) {
    if (!existing.has(table)) { missingTables.push(table); continue }
    const info = await client.execute(`PRAGMA table_info("${table}")`)
    const have = new Set(info.rows.map((r) => String(r.name)))
    for (const col of cols) if (!have.has(col.name)) missingCols.push({ table, col })
  }

  if (missingTables.length) console.log(`[drift] missing tables (run apply-missing-baseline-tables.ts): ${missingTables.join(', ')}`)
  if (!missingCols.length) { console.log('[drift] no missing columns'); return }

  let added = 0
  for (const { table, col } of missingCols) {
    const needsManual = col.notnull && col.default === null
    const dflt = col.default === null ? '' : ` DEFAULT ${typeof col.default === 'string' ? col.default : col.default}`
    const sql = `ALTER TABLE "${table}" ADD COLUMN "${col.name}" ${col.type}${col.notnull && col.default !== null ? ' NOT NULL' : ''}${dflt}`
    if (needsManual) { console.log(`   ! ${table}.${col.name} is NOT NULL without default — add manually: ${sql}`); continue }
    if (apply) { await client.execute(sql); added++; console.log(`   + ${sql}`) }
    else console.log(`   - missing ${table}.${col.name}  (${sql})`)
  }
  console.log(`\n[drift] ${missingCols.length} missing column(s); ${apply ? added + ' added' : 're-run with --apply to add the nullable ones'}`)
}

main().catch((e) => { console.error('[drift] FAILED:', e); process.exit(1) })
