-- ============================================================================
-- BASELINE MIGRATION (2026-04-23)
-- ============================================================================
-- This migration replaces 4 prior migrations whose history had drifted from
-- reality. Several tables (HealthBrainSnapshot, HealthMetric, LabUpload,
-- DiscoveryInsight, etc.) were added to schema.prisma via `db push` but never
-- captured as proper CREATE TABLE migrations — breaking shadow-DB replay.
--
-- This baseline captures the exact schema state of the dev.db as of the
-- refocus start, reconstructed from `sqlite3 dev.db .schema`. It is marked
-- as already-applied (`prisma migrate resolve --applied`) so existing DBs
-- (local dev + production Turso) are NOT re-run against it — they already
-- have this schema from the `db push` era.
--
-- All CREATE statements use IF NOT EXISTS so accidental re-application on an
-- already-populated DB is a safe no-op.
--
-- Archived old migrations: git tag `pre-refocus`, /tmp/old_migrations.tar.
-- Archived pre-reset dev.db: /tmp/dev.db.backup_2026-04-23_pre-reset.
-- ============================================================================

CREATE TABLE IF NOT EXISTS "Protocol" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "peptideId" TEXT NOT NULL,
    "startDate" DATETIME NOT NULL,
    "endDate" DATETIME,
    "frequency" TEXT NOT NULL,
    "customDays" TEXT,
    "doseAmount" REAL NOT NULL,
    "doseUnit" TEXT NOT NULL,
    "timing" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "pausedAt" DATETIME,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL, "diluentVolume" REAL, "vialAmount" REAL, "vialUnit" TEXT, "servingSize" INTEGER, "servingUnit" TEXT, "timings" TEXT,
    CONSTRAINT "Protocol_userId_fkey" FOREIGN KEY ("userId") REFERENCES "UserProfile" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Protocol_peptideId_fkey" FOREIGN KEY ("peptideId") REFERENCES "Peptide" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE TABLE IF NOT EXISTS "DoseSchedule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "protocolId" TEXT NOT NULL,
    "scheduledDate" DATETIME NOT NULL,
    "doseAmount" REAL NOT NULL,
    "doseUnit" TEXT NOT NULL,
    "timing" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DoseSchedule_protocolId_fkey" FOREIGN KEY ("protocolId") REFERENCES "Protocol" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE TABLE IF NOT EXISTS "DoseLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "scheduleId" TEXT,
    "protocolId" TEXT NOT NULL,
    "scheduledDate" DATETIME NOT NULL,
    "completedAt" DATETIME,
    "status" TEXT NOT NULL,
    "actualDose" REAL,
    "actualUnit" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL, "timing" TEXT,
    CONSTRAINT "DoseLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "UserProfile" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DoseLog_protocolId_fkey" FOREIGN KEY ("protocolId") REFERENCES "Protocol" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DoseLog_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "DoseSchedule" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE TABLE IF NOT EXISTS "InventoryVial" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "peptideId" TEXT NOT NULL,
    "identifier" TEXT,
    "totalAmount" REAL NOT NULL,
    "totalUnit" TEXT NOT NULL,
    "diluentVolume" REAL,
    "concentration" REAL,
    "concentrationUnit" TEXT,
    "dateReceived" DATETIME,
    "dateReconstituted" DATETIME,
    "expirationDate" DATETIME,
    "remainingAmount" REAL,
    "isExpired" BOOLEAN NOT NULL DEFAULT false,
    "isExhausted" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL, "itemCount" INTEGER, "remainingCount" INTEGER,
    CONSTRAINT "InventoryVial_userId_fkey" FOREIGN KEY ("userId") REFERENCES "UserProfile" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "InventoryVial_peptideId_fkey" FOREIGN KEY ("peptideId") REFERENCES "Peptide" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE TABLE IF NOT EXISTS "Reconstitution" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "peptideId" TEXT NOT NULL,
    "vialAmount" REAL NOT NULL,
    "vialUnit" TEXT NOT NULL,
    "diluentVolume" REAL NOT NULL,
    "concentration" REAL NOT NULL,
    "concentrationUnit" TEXT NOT NULL,
    "targetDose" REAL,
    "targetUnit" TEXT,
    "volumePerDose" REAL,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Reconstitution_userId_fkey" FOREIGN KEY ("userId") REFERENCES "UserProfile" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Reconstitution_peptideId_fkey" FOREIGN KEY ("peptideId") REFERENCES "Peptide" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE TABLE IF NOT EXISTS "ProtocolHistory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "protocolId" TEXT NOT NULL,
    "changeType" TEXT NOT NULL,
    "changeData" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProtocolHistory_protocolId_fkey" FOREIGN KEY ("protocolId") REFERENCES "Protocol" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE TABLE IF NOT EXISTS "Note" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "DoseSchedule_protocolId_scheduledDate_key" ON "DoseSchedule"("protocolId", "scheduledDate");
CREATE UNIQUE INDEX IF NOT EXISTS "DoseLog_scheduleId_key" ON "DoseLog"("scheduleId");
CREATE INDEX IF NOT EXISTS "Note_entityType_entityId_idx" ON "Note"("entityType", "entityId");
CREATE TABLE IF NOT EXISTS "PushSubscription" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "userId" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "morningTime" TEXT,
    "eveningTime" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "PushSubscription_endpoint_key" ON "PushSubscription"("endpoint");
CREATE INDEX IF NOT EXISTS "PushSubscription_userId_idx" ON "PushSubscription"("userId");
CREATE TABLE IF NOT EXISTS "Peptide" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'peptide',
    "category" TEXT,
    "description" TEXT,
    "storageNotes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
, "canonicalName" TEXT);
CREATE UNIQUE INDEX IF NOT EXISTS "Peptide_name_key" ON "Peptide"("name");
CREATE INDEX IF NOT EXISTS "DoseLog_userId_idx" ON "DoseLog"("userId");
CREATE INDEX IF NOT EXISTS "DoseLog_userId_scheduledDate_idx" ON "DoseLog"("userId", "scheduledDate");
CREATE INDEX IF NOT EXISTS "DoseLog_protocolId_idx" ON "DoseLog"("protocolId");
CREATE INDEX IF NOT EXISTS "InventoryVial_userId_idx" ON "InventoryVial"("userId");
CREATE INDEX IF NOT EXISTS "InventoryVial_userId_isExhausted_idx" ON "InventoryVial"("userId", "isExhausted");
CREATE INDEX IF NOT EXISTS "InventoryVial_expirationDate_idx" ON "InventoryVial"("expirationDate");
CREATE INDEX IF NOT EXISTS "Protocol_userId_idx" ON "Protocol"("userId");
CREATE INDEX IF NOT EXISTS "Protocol_userId_status_idx" ON "Protocol"("userId", "status");
CREATE INDEX IF NOT EXISTS "Protocol_startDate_idx" ON "Protocol"("startDate");
CREATE INDEX IF NOT EXISTS "ProtocolHistory_protocolId_idx" ON "ProtocolHistory"("protocolId");
CREATE INDEX IF NOT EXISTS "Reconstitution_userId_idx" ON "Reconstitution"("userId");
CREATE TABLE IF NOT EXISTS "HealthIntegration" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "tokenExpiry" DATETIME,
    "isConnected" BOOLEAN NOT NULL DEFAULT false,
    "lastSyncAt" DATETIME,
    "syncError" TEXT,
    "enabledMetrics" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "HealthIntegration_userId_fkey" FOREIGN KEY ("userId") REFERENCES "UserProfile" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE TABLE IF NOT EXISTS "HealthMetric" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "metricType" TEXT NOT NULL,
    "value" REAL NOT NULL,
    "unit" TEXT NOT NULL,
    "recordedAt" DATETIME NOT NULL,
    "context" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "HealthMetric_userId_fkey" FOREIGN KEY ("userId") REFERENCES "UserProfile" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE TABLE IF NOT EXISTS "HealthSyncLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "metricsCount" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "startedAt" DATETIME NOT NULL,
    "completedAt" DATETIME
);
CREATE INDEX IF NOT EXISTS "HealthIntegration_userId_idx" ON "HealthIntegration"("userId");
CREATE UNIQUE INDEX IF NOT EXISTS "HealthIntegration_userId_provider_key" ON "HealthIntegration"("userId", "provider");
CREATE INDEX IF NOT EXISTS "HealthMetric_userId_recordedAt_idx" ON "HealthMetric"("userId", "recordedAt");
CREATE INDEX IF NOT EXISTS "HealthMetric_userId_metricType_idx" ON "HealthMetric"("userId", "metricType");
CREATE UNIQUE INDEX IF NOT EXISTS "HealthMetric_userId_provider_metricType_recordedAt_key" ON "HealthMetric"("userId", "provider", "metricType", "recordedAt");
CREATE INDEX IF NOT EXISTS "HealthSyncLog_userId_provider_idx" ON "HealthSyncLog"("userId", "provider");
CREATE INDEX IF NOT EXISTS "DoseLog_protocolId_scheduledDate_idx" ON "DoseLog"("protocolId", "scheduledDate");
CREATE INDEX IF NOT EXISTS "DoseSchedule_scheduledDate_idx" ON "DoseSchedule"("scheduledDate");
CREATE INDEX IF NOT EXISTS "InventoryVial_userId_isExpired_isExhausted_idx" ON "InventoryVial"("userId", "isExpired", "isExhausted");
CREATE INDEX IF NOT EXISTS "Protocol_userId_status_startDate_idx" ON "Protocol"("userId", "status", "startDate");
CREATE TABLE IF NOT EXISTS "DeviceToken" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "token" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "userId" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "morningTime" TEXT,
    "eveningTime" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "DeviceToken_token_key" ON "DeviceToken"("token");
CREATE INDEX IF NOT EXISTS "DeviceToken_userId_idx" ON "DeviceToken"("userId");
CREATE TABLE IF NOT EXISTS "LabResult" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "testDate" DATETIME NOT NULL,
    "labName" TEXT,
    "notes" TEXT,
    "markers" TEXT NOT NULL DEFAULT '[]',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "LabResult_userId_fkey" FOREIGN KEY ("userId") REFERENCES "UserProfile" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "LabResult_userId_testDate_idx" ON "LabResult"("userId", "testDate");
CREATE TABLE IF NOT EXISTS "LabUpload" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "testDate" DATETIME NOT NULL,
    "labName" TEXT,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "notes" TEXT,
    "rawText" TEXT,
    "confidence" REAL,
    "fileName" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "LabUpload_userId_fkey" FOREIGN KEY ("userId") REFERENCES "UserProfile" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE TABLE IF NOT EXISTS "LabBiomarker" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "uploadId" TEXT NOT NULL,
    "biomarkerKey" TEXT NOT NULL,
    "rawName" TEXT,
    "value" REAL NOT NULL,
    "unit" TEXT NOT NULL,
    "originalValue" REAL,
    "originalUnit" TEXT,
    "rangeLow" REAL,
    "rangeHigh" REAL,
    "flag" TEXT NOT NULL,
    "confidence" REAL,
    "category" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LabBiomarker_uploadId_fkey" FOREIGN KEY ("uploadId") REFERENCES "LabUpload" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "LabUpload_userId_testDate_idx" ON "LabUpload"("userId", "testDate");
CREATE INDEX IF NOT EXISTS "LabUpload_userId_idx" ON "LabUpload"("userId");
CREATE INDEX IF NOT EXISTS "LabBiomarker_uploadId_idx" ON "LabBiomarker"("uploadId");
CREATE INDEX IF NOT EXISTS "LabBiomarker_biomarkerKey_idx" ON "LabBiomarker"("biomarkerKey");
CREATE UNIQUE INDEX IF NOT EXISTS "LabBiomarker_uploadId_biomarkerKey_key" ON "LabBiomarker"("uploadId", "biomarkerKey");
CREATE TABLE IF NOT EXISTS "LabEventReview" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "labUploadId" TEXT NOT NULL,
    "labDate" DATETIME NOT NULL,
    "domainSummaries" TEXT NOT NULL DEFAULT '[]',
    "markerDeltas" TEXT NOT NULL DEFAULT '[]',
    "predictions" TEXT NOT NULL DEFAULT '[]',
    "protocolScores" TEXT NOT NULL DEFAULT '[]',
    "evidenceLedger" TEXT NOT NULL DEFAULT '[]',
    "trialCyclePhase" TEXT NOT NULL DEFAULT 'plan',
    "verdictHeadline" TEXT NOT NULL DEFAULT '',
    "verdictTakeaways" TEXT NOT NULL DEFAULT '[]',
    "verdictFocus" TEXT NOT NULL DEFAULT '',
    "verdictConfidence" TEXT NOT NULL DEFAULT 'low',
    "computedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "LabEventReview_labUploadId_fkey" FOREIGN KEY ("labUploadId") REFERENCES "LabUpload" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "LabEventReview_labUploadId_key" ON "LabEventReview"("labUploadId");
CREATE INDEX IF NOT EXISTS "LabEventReview_userId_labDate_idx" ON "LabEventReview"("userId", "labDate");
CREATE INDEX IF NOT EXISTS "LabEventReview_userId_idx" ON "LabEventReview"("userId");
CREATE TABLE IF NOT EXISTS "PreDrawContext" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "labUploadId" TEXT NOT NULL,
    "exercisedWithin24h" BOOLEAN NOT NULL DEFAULT false,
    "fastingHours" INTEGER,
    "recentIllness" BOOLEAN NOT NULL DEFAULT false,
    "illnessType" TEXT,
    "drawTime" TEXT,
    "newSupplements" TEXT,
    "unusualStress" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PreDrawContext_labUploadId_fkey" FOREIGN KEY ("labUploadId") REFERENCES "LabUpload" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE TABLE IF NOT EXISTS "UserBiologicalLiteracy" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "level" TEXT NOT NULL DEFAULT 'explorer',
    "selfSelected" BOOLEAN NOT NULL DEFAULT false,
    "detailTaps" INTEGER NOT NULL DEFAULT 0,
    "labViewCount" INTEGER NOT NULL DEFAULT 0,
    "insightViews" INTEGER NOT NULL DEFAULT 0,
    "lastLevelChange" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "UserBiologicalLiteracy_userId_fkey" FOREIGN KEY ("userId") REFERENCES "UserProfile" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE TABLE IF NOT EXISTS "DiscoveryInsight" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "domain" TEXT,
    "relatedMarkers" TEXT,
    "priority" INTEGER NOT NULL DEFAULT 5,
    "seen" BOOLEAN NOT NULL DEFAULT false,
    "dismissed" BOOLEAN NOT NULL DEFAULT false,
    "generatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" DATETIME,
    CONSTRAINT "DiscoveryInsight_userId_fkey" FOREIGN KEY ("userId") REFERENCES "UserProfile" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "PreDrawContext_labUploadId_key" ON "PreDrawContext"("labUploadId");
CREATE UNIQUE INDEX IF NOT EXISTS "UserBiologicalLiteracy_userId_key" ON "UserBiologicalLiteracy"("userId");
CREATE INDEX IF NOT EXISTS "DiscoveryInsight_userId_generatedAt_idx" ON "DiscoveryInsight"("userId", "generatedAt");
CREATE INDEX IF NOT EXISTS "DiscoveryInsight_userId_seen_idx" ON "DiscoveryInsight"("userId", "seen");
CREATE TABLE IF NOT EXISTS "PersonalBaseline" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "biomarkerKey" TEXT NOT NULL,
    "personalMean" REAL NOT NULL,
    "personalSD" REAL NOT NULL,
    "drawCount" INTEGER NOT NULL DEFAULT 0,
    "populationPercentile" REAL,
    "trend" TEXT NOT NULL DEFAULT 'stable',
    "trendConfidence" REAL NOT NULL DEFAULT 0,
    "lastLabValue" REAL,
    "lastLabDate" DATETIME,
    "updatedAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PersonalBaseline_userId_fkey" FOREIGN KEY ("userId") REFERENCES "UserProfile" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE TABLE IF NOT EXISTS "LabPriorResetEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "labUploadId" TEXT NOT NULL,
    "baselinesUpdated" INTEGER NOT NULL DEFAULT 0,
    "hypothesesResolved" INTEGER NOT NULL DEFAULT 0,
    "domainsReweighted" INTEGER NOT NULL DEFAULT 0,
    "protocolsReassessed" INTEGER NOT NULL DEFAULT 0,
    "wearableSignalsQuieted" INTEGER NOT NULL DEFAULT 0,
    "summaryNarrative" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LabPriorResetEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "UserProfile" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "PersonalBaseline_userId_biomarkerKey_key" ON "PersonalBaseline"("userId", "biomarkerKey");
CREATE INDEX IF NOT EXISTS "LabPriorResetEvent_userId_createdAt_idx" ON "LabPriorResetEvent"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "LabPriorResetEvent_labUploadId_idx" ON "LabPriorResetEvent"("labUploadId");
CREATE TABLE IF NOT EXISTS "ProtocolLabExpectation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "protocolId" TEXT NOT NULL,
    "biomarkerKey" TEXT NOT NULL,
    "expectedDirection" TEXT NOT NULL,
    "expectedMagnitudeRange" TEXT NOT NULL,
    "onsetWeeks" TEXT NOT NULL,
    "peakWeeks" TEXT NOT NULL,
    "evidenceLevel" TEXT NOT NULL,
    "mechanism" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ProtocolLabExpectation_protocolId_fkey" FOREIGN KEY ("protocolId") REFERENCES "Protocol" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE TABLE IF NOT EXISTS "WeeklyHealthBrief" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "weekStartDate" DATETIME NOT NULL,
    "headline" TEXT NOT NULL,
    "domainSummaries" TEXT NOT NULL,
    "protocolUpdates" TEXT NOT NULL,
    "actionItems" TEXT NOT NULL,
    "labStatus" TEXT NOT NULL,
    "lookAhead" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "WeeklyHealthBrief_userId_fkey" FOREIGN KEY ("userId") REFERENCES "UserProfile" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE TABLE IF NOT EXISTS "WearableLabCorrelation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "wearableMetricType" TEXT NOT NULL,
    "biomarkerKey" TEXT NOT NULL,
    "correlationCoefficient" REAL NOT NULL,
    "sampleSize" INTEGER NOT NULL,
    "directionality" TEXT NOT NULL,
    "lastUpdated" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WearableLabCorrelation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "UserProfile" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "ProtocolLabExpectation_protocolId_idx" ON "ProtocolLabExpectation"("protocolId");
CREATE INDEX IF NOT EXISTS "ProtocolLabExpectation_biomarkerKey_idx" ON "ProtocolLabExpectation"("biomarkerKey");
CREATE UNIQUE INDEX IF NOT EXISTS "ProtocolLabExpectation_protocolId_biomarkerKey_key" ON "ProtocolLabExpectation"("protocolId", "biomarkerKey");
CREATE INDEX IF NOT EXISTS "WeeklyHealthBrief_userId_weekStartDate_idx" ON "WeeklyHealthBrief"("userId", "weekStartDate");
CREATE UNIQUE INDEX IF NOT EXISTS "WeeklyHealthBrief_userId_weekStartDate_key" ON "WeeklyHealthBrief"("userId", "weekStartDate");
CREATE INDEX IF NOT EXISTS "WearableLabCorrelation_userId_idx" ON "WearableLabCorrelation"("userId");
CREATE INDEX IF NOT EXISTS "WearableLabCorrelation_userId_wearableMetricType_idx" ON "WearableLabCorrelation"("userId", "wearableMetricType");
CREATE UNIQUE INDEX IF NOT EXISTS "WearableLabCorrelation_userId_wearableMetricType_biomarkerKey_key" ON "WearableLabCorrelation"("userId", "wearableMetricType", "biomarkerKey");
CREATE TABLE IF NOT EXISTS "BayesianChangepoint" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "protocolId" TEXT NOT NULL,
    "metricType" TEXT NOT NULL,
    "detectedDate" DATETIME NOT NULL,
    "posteriorProb" REAL NOT NULL,
    "credibleIntervalLo" DATETIME NOT NULL,
    "credibleIntervalHi" DATETIME NOT NULL,
    "effectSize" REAL,
    "preMean" REAL,
    "postMean" REAL,
    "runLength" INTEGER,
    "confidenceLevel" TEXT NOT NULL DEFAULT 'low',
    "multiStreamCluster" TEXT,
    "computedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BayesianChangepoint_userId_fkey" FOREIGN KEY ("userId") REFERENCES "UserProfile" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE TABLE IF NOT EXISTS "CausalAnalysis" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "protocolId" TEXT NOT NULL,
    "metricType" TEXT NOT NULL,
    "unadjustedEffect" REAL NOT NULL,
    "adjustedEffect" REAL NOT NULL,
    "adjustmentDelta" REAL NOT NULL,
    "confoundersJson" TEXT NOT NULL DEFAULT '[]',
    "causalDagJson" TEXT NOT NULL DEFAULT '{}',
    "confidenceLevel" TEXT NOT NULL DEFAULT 'low',
    "narrativeExplanation" TEXT NOT NULL DEFAULT '',
    "computedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CausalAnalysis_userId_fkey" FOREIGN KEY ("userId") REFERENCES "UserProfile" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE TABLE IF NOT EXISTS "HealthPrediction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "biomarkerKey" TEXT NOT NULL,
    "currentEstimate" REAL,
    "currentCI" TEXT,
    "forecast3m" REAL,
    "forecast3mCI" TEXT,
    "forecast6m" REAL,
    "forecast6mCI" TEXT,
    "thresholdCrossProb" REAL,
    "thresholdType" TEXT,
    "dataPoints" INTEGER NOT NULL DEFAULT 0,
    "confidenceLevel" TEXT NOT NULL DEFAULT 'low',
    "stalenessWarning" TEXT,
    "protocolAdjustmentJson" TEXT,
    "computedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "HealthPrediction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "UserProfile" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "BayesianChangepoint_userId_protocolId_idx" ON "BayesianChangepoint"("userId", "protocolId");
CREATE INDEX IF NOT EXISTS "BayesianChangepoint_userId_metricType_idx" ON "BayesianChangepoint"("userId", "metricType");
CREATE INDEX IF NOT EXISTS "CausalAnalysis_userId_protocolId_idx" ON "CausalAnalysis"("userId", "protocolId");
CREATE UNIQUE INDEX IF NOT EXISTS "CausalAnalysis_userId_protocolId_metricType_key" ON "CausalAnalysis"("userId", "protocolId", "metricType");
CREATE INDEX IF NOT EXISTS "HealthPrediction_userId_idx" ON "HealthPrediction"("userId");
CREATE UNIQUE INDEX IF NOT EXISTS "HealthPrediction_userId_biomarkerKey_key" ON "HealthPrediction"("userId", "biomarkerKey");
CREATE TABLE IF NOT EXISTS "CohortInsight" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "cohortKey" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "sampleSize" INTEGER NOT NULL,
    "medianEffect" REAL NOT NULL,
    "percentileRank" REAL,
    "generatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" DATETIME NOT NULL,
    CONSTRAINT "CohortInsight_userId_fkey" FOREIGN KEY ("userId") REFERENCES "UserProfile" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE TABLE IF NOT EXISTS "UserHypothesis" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "interventionType" TEXT NOT NULL,
    "interventionId" TEXT,
    "metricType" TEXT NOT NULL,
    "expectedDirection" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "resultSummary" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME,
    CONSTRAINT "UserHypothesis_userId_fkey" FOREIGN KEY ("userId") REFERENCES "UserProfile" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE TABLE IF NOT EXISTS "InsightEngagement" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "insightId" TEXT NOT NULL,
    "insightType" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "value" REAL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InsightEngagement_userId_fkey" FOREIGN KEY ("userId") REFERENCES "UserProfile" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE TABLE IF NOT EXISTS "UserProfile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "cohortOptIn" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
CREATE INDEX IF NOT EXISTS "CohortInsight_userId_generatedAt_idx" ON "CohortInsight"("userId", "generatedAt");
CREATE INDEX IF NOT EXISTS "CohortInsight_cohortKey_idx" ON "CohortInsight"("cohortKey");
CREATE INDEX IF NOT EXISTS "UserHypothesis_userId_status_idx" ON "UserHypothesis"("userId", "status");
CREATE INDEX IF NOT EXISTS "InsightEngagement_userId_insightId_idx" ON "InsightEngagement"("userId", "insightId");
CREATE INDEX IF NOT EXISTS "InsightEngagement_insightType_action_idx" ON "InsightEngagement"("insightType", "action");
CREATE TABLE IF NOT EXISTS "ProtocolInsightCache" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "protocolId" TEXT NOT NULL,
    "insightJson" TEXT NOT NULL,
    "protocolHash" TEXT NOT NULL,
    "computedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS "HealthBrainSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "triggerEvent" TEXT NOT NULL DEFAULT 'manual_refresh',
    "evaluatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "pipelineMs" INTEGER,
    "domainsJson" TEXT NOT NULL DEFAULT '{}',
    "agingVelocityJson" TEXT NOT NULL DEFAULT '{}',
    "allostasisJson" TEXT NOT NULL DEFAULT '{}',
    "riskTrajectoriesJson" TEXT NOT NULL DEFAULT '{}',
    "protocolEvidenceJson" TEXT NOT NULL DEFAULT '[]',
    "predictionsJson" TEXT NOT NULL DEFAULT '[]',
    "narrativesJson" TEXT NOT NULL DEFAULT '[]',
    "actionItemsJson" TEXT NOT NULL DEFAULT '[]',
    "unifiedScore" REAL,
    "dailyStatusJson" TEXT NOT NULL DEFAULT '{}',
    "confidenceJson" TEXT NOT NULL DEFAULT '{}',
    "dataCompleteness" REAL NOT NULL DEFAULT 0,
    "agingVelocityPublishedJson" TEXT NOT NULL DEFAULT '{}',
    "agingVelocityPublishedAt" DATETIME,
    "agingVelocityComputedAt" DATETIME,
    "agingVelocityWindowDays" INTEGER NOT NULL DEFAULT 90,
    "agingVelocityVersion" TEXT NOT NULL DEFAULT '2.0.0',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "HealthBrainSnapshot_userId_fkey" FOREIGN KEY ("userId") REFERENCES "UserProfile" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "HealthBrainSnapshot_userId_evaluatedAt_idx" ON "HealthBrainSnapshot"("userId", "evaluatedAt");
CREATE UNIQUE INDEX IF NOT EXISTS "ProtocolInsightCache_protocolId_key" ON "ProtocolInsightCache"("protocolId");
CREATE INDEX IF NOT EXISTS "ProtocolInsightCache_protocolId_idx" ON "ProtocolInsightCache"("protocolId");

