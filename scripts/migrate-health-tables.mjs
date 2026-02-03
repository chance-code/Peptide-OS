// Migration script to add health tables to Turso database
import { createClient } from '@libsql/client'

const client = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
})

const migrations = [
  // Create HealthIntegration table
  `CREATE TABLE IF NOT EXISTS "HealthIntegration" (
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
  )`,

  // Create HealthMetric table
  `CREATE TABLE IF NOT EXISTS "HealthMetric" (
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
  )`,

  // Create HealthSyncLog table
  `CREATE TABLE IF NOT EXISTS "HealthSyncLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "metricsCount" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "startedAt" DATETIME NOT NULL,
    "completedAt" DATETIME
  )`,

  // Create indexes
  `CREATE INDEX IF NOT EXISTS "HealthIntegration_userId_idx" ON "HealthIntegration"("userId")`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "HealthIntegration_userId_provider_key" ON "HealthIntegration"("userId", "provider")`,
  `CREATE INDEX IF NOT EXISTS "HealthMetric_userId_recordedAt_idx" ON "HealthMetric"("userId", "recordedAt")`,
  `CREATE INDEX IF NOT EXISTS "HealthMetric_userId_metricType_idx" ON "HealthMetric"("userId", "metricType")`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "HealthMetric_userId_provider_metricType_recordedAt_key" ON "HealthMetric"("userId", "provider", "metricType", "recordedAt")`,
  `CREATE INDEX IF NOT EXISTS "HealthSyncLog_userId_provider_idx" ON "HealthSyncLog"("userId", "provider")`,
]

async function migrate() {
  console.log('Starting migration...')

  for (const sql of migrations) {
    try {
      await client.execute(sql)
      console.log('✓', sql.substring(0, 60) + '...')
    } catch (error) {
      console.error('✗ Error:', error.message)
      console.error('  SQL:', sql.substring(0, 100))
    }
  }

  console.log('Migration complete!')
}

migrate().catch(console.error)
