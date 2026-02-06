// Migration script to add LabResult table to Turso database
import { createClient } from '@libsql/client'
import { config } from 'dotenv'

// Load environment variables from .env file
config()

const client = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
})

const migrations = [
  // Create LabResult table
  `CREATE TABLE IF NOT EXISTS "LabResult" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "testDate" DATETIME NOT NULL,
    "labName" TEXT,
    "notes" TEXT,
    "markers" TEXT NOT NULL DEFAULT '[]',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "LabResult_userId_fkey" FOREIGN KEY ("userId") REFERENCES "UserProfile" ("id") ON DELETE CASCADE ON UPDATE CASCADE
  )`,

  // Create index for efficient queries by user and date
  `CREATE INDEX IF NOT EXISTS "LabResult_userId_testDate_idx" ON "LabResult"("userId", "testDate")`,
]

async function migrate() {
  console.log('Starting LabResult table migration...')

  for (const sql of migrations) {
    try {
      await client.execute(sql)
      console.log('✓', sql.substring(0, 60) + '...')
    } catch (error) {
      console.error('✗ Error:', error.message)
      console.error('  SQL:', sql.substring(0, 100))
      process.exit(1)
    }
  }

  console.log('\nMigration complete!')
}

migrate().catch((error) => {
  console.error('Migration failed:', error)
  process.exit(1)
})
