-- CreateTable
CREATE TABLE "UserProfile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Peptide" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "description" TEXT,
    "storageNotes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Protocol" (
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
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Protocol_userId_fkey" FOREIGN KEY ("userId") REFERENCES "UserProfile" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Protocol_peptideId_fkey" FOREIGN KEY ("peptideId") REFERENCES "Peptide" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DoseSchedule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "protocolId" TEXT NOT NULL,
    "scheduledDate" DATETIME NOT NULL,
    "doseAmount" REAL NOT NULL,
    "doseUnit" TEXT NOT NULL,
    "timing" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DoseSchedule_protocolId_fkey" FOREIGN KEY ("protocolId") REFERENCES "Protocol" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DoseLog" (
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
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "DoseLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "UserProfile" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DoseLog_protocolId_fkey" FOREIGN KEY ("protocolId") REFERENCES "Protocol" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DoseLog_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "DoseSchedule" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "InventoryVial" (
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
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "InventoryVial_userId_fkey" FOREIGN KEY ("userId") REFERENCES "UserProfile" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "InventoryVial_peptideId_fkey" FOREIGN KEY ("peptideId") REFERENCES "Peptide" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Reconstitution" (
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

-- CreateTable
CREATE TABLE "ProtocolHistory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "protocolId" TEXT NOT NULL,
    "changeType" TEXT NOT NULL,
    "changeData" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProtocolHistory_protocolId_fkey" FOREIGN KEY ("protocolId") REFERENCES "Protocol" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Note" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "Peptide_name_key" ON "Peptide"("name");

-- CreateIndex
CREATE UNIQUE INDEX "DoseSchedule_protocolId_scheduledDate_key" ON "DoseSchedule"("protocolId", "scheduledDate");

-- CreateIndex
CREATE UNIQUE INDEX "DoseLog_scheduleId_key" ON "DoseLog"("scheduleId");

-- CreateIndex
CREATE INDEX "Note_entityType_entityId_idx" ON "Note"("entityType", "entityId");
