-- AlterTable
ALTER TABLE "InventoryVial" ADD COLUMN "remainingVolumeMl" REAL;

-- CreateTable
CREATE TABLE "ProtocolCycle" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "protocolId" TEXT NOT NULL,
    "onDays" INTEGER NOT NULL,
    "offDays" INTEGER NOT NULL,
    "cycleStartDate" DATETIME NOT NULL,
    "repeatCount" INTEGER NOT NULL DEFAULT -1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ProtocolCycle_protocolId_fkey" FOREIGN KEY ("protocolId") REFERENCES "Protocol" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TitrationStep" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "protocolId" TEXT NOT NULL,
    "stepIndex" INTEGER NOT NULL,
    "weekOffset" INTEGER NOT NULL,
    "doseAmount" REAL NOT NULL,
    "doseUnit" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TitrationStep_protocolId_fkey" FOREIGN KEY ("protocolId") REFERENCES "Protocol" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_DoseLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "scheduleId" TEXT,
    "protocolId" TEXT NOT NULL,
    "scheduledDate" DATETIME NOT NULL,
    "completedAt" DATETIME,
    "timing" TEXT,
    "status" TEXT NOT NULL,
    "actualDose" REAL,
    "actualUnit" TEXT,
    "vialId" TEXT,
    "volumeDrawnMl" REAL,
    "concentrationAtDose" REAL,
    "injectionSite" TEXT,
    "phase" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "DoseLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "UserProfile" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DoseLog_protocolId_fkey" FOREIGN KEY ("protocolId") REFERENCES "Protocol" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DoseLog_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "DoseSchedule" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "DoseLog_vialId_fkey" FOREIGN KEY ("vialId") REFERENCES "InventoryVial" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_DoseLog" ("actualDose", "actualUnit", "completedAt", "createdAt", "id", "notes", "protocolId", "scheduleId", "scheduledDate", "status", "timing", "updatedAt", "userId") SELECT "actualDose", "actualUnit", "completedAt", "createdAt", "id", "notes", "protocolId", "scheduleId", "scheduledDate", "status", "timing", "updatedAt", "userId" FROM "DoseLog";
DROP TABLE "DoseLog";
ALTER TABLE "new_DoseLog" RENAME TO "DoseLog";
CREATE UNIQUE INDEX "DoseLog_scheduleId_key" ON "DoseLog"("scheduleId");
CREATE INDEX "DoseLog_userId_idx" ON "DoseLog"("userId");
CREATE INDEX "DoseLog_userId_scheduledDate_idx" ON "DoseLog"("userId", "scheduledDate");
CREATE INDEX "DoseLog_protocolId_idx" ON "DoseLog"("protocolId");
CREATE INDEX "DoseLog_protocolId_scheduledDate_idx" ON "DoseLog"("protocolId", "scheduledDate");
CREATE INDEX "DoseLog_vialId_idx" ON "DoseLog"("vialId");
CREATE TABLE "new_Protocol" (
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
    "timings" TEXT,
    "vialAmount" REAL,
    "vialUnit" TEXT,
    "diluentVolume" REAL,
    "servingSize" INTEGER,
    "servingUnit" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "pausedAt" DATETIME,
    "cycleMode" TEXT NOT NULL DEFAULT 'continuous',
    "siteRotationEnabled" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Protocol_userId_fkey" FOREIGN KEY ("userId") REFERENCES "UserProfile" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Protocol_peptideId_fkey" FOREIGN KEY ("peptideId") REFERENCES "Peptide" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Protocol" ("createdAt", "customDays", "diluentVolume", "doseAmount", "doseUnit", "endDate", "frequency", "id", "notes", "pausedAt", "peptideId", "servingSize", "servingUnit", "startDate", "status", "timing", "timings", "updatedAt", "userId", "vialAmount", "vialUnit") SELECT "createdAt", "customDays", "diluentVolume", "doseAmount", "doseUnit", "endDate", "frequency", "id", "notes", "pausedAt", "peptideId", "servingSize", "servingUnit", "startDate", "status", "timing", "timings", "updatedAt", "userId", "vialAmount", "vialUnit" FROM "Protocol";
DROP TABLE "Protocol";
ALTER TABLE "new_Protocol" RENAME TO "Protocol";
CREATE INDEX "Protocol_userId_idx" ON "Protocol"("userId");
CREATE INDEX "Protocol_userId_status_idx" ON "Protocol"("userId", "status");
CREATE INDEX "Protocol_startDate_idx" ON "Protocol"("startDate");
CREATE INDEX "Protocol_userId_status_startDate_idx" ON "Protocol"("userId", "status", "startDate");
CREATE TABLE "new_Reconstitution" (
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
    "inventoryVialId" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Reconstitution_userId_fkey" FOREIGN KEY ("userId") REFERENCES "UserProfile" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Reconstitution_peptideId_fkey" FOREIGN KEY ("peptideId") REFERENCES "Peptide" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Reconstitution_inventoryVialId_fkey" FOREIGN KEY ("inventoryVialId") REFERENCES "InventoryVial" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Reconstitution" ("concentration", "concentrationUnit", "createdAt", "diluentVolume", "id", "notes", "peptideId", "targetDose", "targetUnit", "updatedAt", "userId", "vialAmount", "vialUnit", "volumePerDose") SELECT "concentration", "concentrationUnit", "createdAt", "diluentVolume", "id", "notes", "peptideId", "targetDose", "targetUnit", "updatedAt", "userId", "vialAmount", "vialUnit", "volumePerDose" FROM "Reconstitution";
DROP TABLE "Reconstitution";
ALTER TABLE "new_Reconstitution" RENAME TO "Reconstitution";
CREATE INDEX "Reconstitution_userId_idx" ON "Reconstitution"("userId");
CREATE INDEX "Reconstitution_inventoryVialId_idx" ON "Reconstitution"("inventoryVialId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "ProtocolCycle_protocolId_key" ON "ProtocolCycle"("protocolId");

-- CreateIndex
CREATE INDEX "TitrationStep_protocolId_idx" ON "TitrationStep"("protocolId");

-- CreateIndex
CREATE UNIQUE INDEX "TitrationStep_protocolId_stepIndex_key" ON "TitrationStep"("protocolId", "stepIndex");
