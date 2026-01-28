import 'dotenv/config'
import { createClient } from '@libsql/client'

const client = createClient({
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN!,
})

const schema = `
-- UserProfile
CREATE TABLE IF NOT EXISTS UserProfile (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  notes TEXT,
  isActive INTEGER NOT NULL DEFAULT 0,
  createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Peptide
CREATE TABLE IF NOT EXISTS Peptide (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  category TEXT,
  description TEXT,
  storageNotes TEXT,
  createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Protocol
CREATE TABLE IF NOT EXISTS Protocol (
  id TEXT PRIMARY KEY,
  userId TEXT NOT NULL,
  peptideId TEXT NOT NULL,
  startDate TEXT NOT NULL,
  endDate TEXT,
  frequency TEXT NOT NULL,
  customDays TEXT,
  doseAmount REAL NOT NULL,
  doseUnit TEXT NOT NULL,
  timing TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  pausedAt TEXT,
  notes TEXT,
  createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (userId) REFERENCES UserProfile(id) ON DELETE CASCADE,
  FOREIGN KEY (peptideId) REFERENCES Peptide(id)
);

-- DoseSchedule
CREATE TABLE IF NOT EXISTS DoseSchedule (
  id TEXT PRIMARY KEY,
  protocolId TEXT NOT NULL,
  scheduledDate TEXT NOT NULL,
  doseAmount REAL NOT NULL,
  doseUnit TEXT NOT NULL,
  timing TEXT,
  createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (protocolId) REFERENCES Protocol(id) ON DELETE CASCADE,
  UNIQUE(protocolId, scheduledDate)
);

-- DoseLog
CREATE TABLE IF NOT EXISTS DoseLog (
  id TEXT PRIMARY KEY,
  userId TEXT NOT NULL,
  scheduleId TEXT UNIQUE,
  protocolId TEXT NOT NULL,
  scheduledDate TEXT NOT NULL,
  completedAt TEXT,
  status TEXT NOT NULL,
  actualDose REAL,
  actualUnit TEXT,
  notes TEXT,
  createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (userId) REFERENCES UserProfile(id) ON DELETE CASCADE,
  FOREIGN KEY (protocolId) REFERENCES Protocol(id) ON DELETE CASCADE,
  FOREIGN KEY (scheduleId) REFERENCES DoseSchedule(id) ON DELETE SET NULL
);

-- InventoryVial
CREATE TABLE IF NOT EXISTS InventoryVial (
  id TEXT PRIMARY KEY,
  userId TEXT NOT NULL,
  peptideId TEXT NOT NULL,
  identifier TEXT,
  totalAmount REAL NOT NULL,
  totalUnit TEXT NOT NULL,
  diluentVolume REAL,
  concentration REAL,
  concentrationUnit TEXT,
  dateReceived TEXT,
  dateReconstituted TEXT,
  expirationDate TEXT,
  remainingAmount REAL,
  isExpired INTEGER NOT NULL DEFAULT 0,
  isExhausted INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (userId) REFERENCES UserProfile(id) ON DELETE CASCADE,
  FOREIGN KEY (peptideId) REFERENCES Peptide(id)
);

-- Reconstitution
CREATE TABLE IF NOT EXISTS Reconstitution (
  id TEXT PRIMARY KEY,
  userId TEXT NOT NULL,
  peptideId TEXT NOT NULL,
  vialAmount REAL NOT NULL,
  vialUnit TEXT NOT NULL,
  diluentVolume REAL NOT NULL,
  concentration REAL NOT NULL,
  concentrationUnit TEXT NOT NULL,
  targetDose REAL,
  targetUnit TEXT,
  volumePerDose REAL,
  notes TEXT,
  createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (userId) REFERENCES UserProfile(id) ON DELETE CASCADE,
  FOREIGN KEY (peptideId) REFERENCES Peptide(id)
);

-- ProtocolHistory
CREATE TABLE IF NOT EXISTS ProtocolHistory (
  id TEXT PRIMARY KEY,
  protocolId TEXT NOT NULL,
  changeType TEXT NOT NULL,
  changeData TEXT NOT NULL,
  createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (protocolId) REFERENCES Protocol(id) ON DELETE CASCADE
);

-- Note
CREATE TABLE IF NOT EXISTS Note (
  id TEXT PRIMARY KEY,
  entityType TEXT NOT NULL,
  entityId TEXT NOT NULL,
  content TEXT NOT NULL,
  createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS Note_entityType_entityId_idx ON Note(entityType, entityId);

-- PushSubscription
CREATE TABLE IF NOT EXISTS PushSubscription (
  id TEXT PRIMARY KEY,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  userId TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  morningTime TEXT,
  eveningTime TEXT,
  createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS PushSubscription_userId_idx ON PushSubscription(userId);
`

async function main() {
  console.log('Migrating schema to Turso...')

  const statements = schema
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0)

  for (const statement of statements) {
    try {
      await client.execute(statement)
      console.log('✓', statement.substring(0, 50) + '...')
    } catch (error) {
      console.error('Error executing:', statement.substring(0, 50))
      console.error(error)
    }
  }

  console.log('\n✅ Schema migration complete!')
}

main().catch(console.error)
