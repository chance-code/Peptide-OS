-- CreateTable
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

-- CreateTable
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

-- CreateTable
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

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "ProtocolLabExpectation_protocolId_biomarkerKey_key" ON "ProtocolLabExpectation"("protocolId", "biomarkerKey");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ProtocolLabExpectation_protocolId_idx" ON "ProtocolLabExpectation"("protocolId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ProtocolLabExpectation_biomarkerKey_idx" ON "ProtocolLabExpectation"("biomarkerKey");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "WeeklyHealthBrief_userId_weekStartDate_key" ON "WeeklyHealthBrief"("userId", "weekStartDate");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "WeeklyHealthBrief_userId_weekStartDate_idx" ON "WeeklyHealthBrief"("userId", "weekStartDate");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "WearableLabCorrelation_userId_wearableMetricType_biomarkerKey_key" ON "WearableLabCorrelation"("userId", "wearableMetricType", "biomarkerKey");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "WearableLabCorrelation_userId_idx" ON "WearableLabCorrelation"("userId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "WearableLabCorrelation_userId_wearableMetricType_idx" ON "WearableLabCorrelation"("userId", "wearableMetricType");
