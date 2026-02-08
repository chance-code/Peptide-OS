-- AddColumn
ALTER TABLE "HealthBrainSnapshot" ADD COLUMN "agingVelocityPublishedJson" TEXT NOT NULL DEFAULT '{}';

-- AddColumn
ALTER TABLE "HealthBrainSnapshot" ADD COLUMN "agingVelocityPublishedAt" DATETIME;

-- AddColumn
ALTER TABLE "HealthBrainSnapshot" ADD COLUMN "agingVelocityComputedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AddColumn
ALTER TABLE "HealthBrainSnapshot" ADD COLUMN "agingVelocityWindowDays" INTEGER NOT NULL DEFAULT 90;

-- AddColumn
ALTER TABLE "HealthBrainSnapshot" ADD COLUMN "agingVelocityVersion" TEXT NOT NULL DEFAULT '2.0.0';
