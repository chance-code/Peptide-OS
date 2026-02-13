# Peptide OS - Data Model

## Entity Relationship Diagram

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  UserProfile │────<│   Protocol   │>────│   Peptide    │
└──────────────┘     └──────────────┘     └──────────────┘
       │                    │                    │
       │                    │                    │
       ▼                    ▼                    │
┌──────────────┐     ┌──────────────┐           │
│   DoseLog    │────<│ DoseSchedule │           │
└──────────────┘     └──────────────┘           │
       │                    │                    │
       │                    ▼                    │
       │            ┌──────────────┐            │
       │            │ ProtocolHist │            │
       │            └──────────────┘            │
       │                                        │
       ▼                                        │
┌──────────────┐                               │
│InventoryVial│>───────────────────────────────┘
└──────────────┘
       │
       ▼
┌──────────────┐
│Reconstitution│
└──────────────┘
```

## Entities

### UserProfile

The central entity representing a person using the system.

| Field | Type | Description |
|-------|------|-------------|
| id | String (CUID) | Primary key |
| name | String | Display name |
| notes | String? | Optional notes |
| isActive | Boolean | Currently selected profile |
| createdAt | DateTime | Creation timestamp |
| updatedAt | DateTime | Last update timestamp |

**Relations:**
- Has many Protocols
- Has many InventoryVials
- Has many DoseLogs
- Has many Reconstitutions

---

### Peptide

Defines a peptide compound that can be used in protocols.

| Field | Type | Description |
|-------|------|-------------|
| id | String (CUID) | Primary key |
| name | String | Unique peptide name |
| category | String? | Category (e.g., "Healing", "Metabolic") |
| description | String? | Usage description |
| storageNotes | String? | Storage instructions |
| createdAt | DateTime | Creation timestamp |
| updatedAt | DateTime | Last update timestamp |

**Relations:**
- Has many Protocols
- Has many InventoryVials
- Has many Reconstitutions

---

### Protocol

Defines an active dosing regimen for a user.

| Field | Type | Description |
|-------|------|-------------|
| id | String (CUID) | Primary key |
| userId | String | Foreign key to UserProfile |
| peptideId | String | Foreign key to Peptide |
| startDate | DateTime | When the protocol begins |
| endDate | DateTime? | When it ends (null = indefinite) |
| frequency | String | 'daily', 'weekly', 'custom' |
| customDays | String? | JSON array: ["mon","wed","fri"] |
| doseAmount | Float | Amount per administration |
| doseUnit | String | 'mcg', 'mg', 'IU' |
| timing | String? | e.g., 'morning', 'before bed' |
| status | String | 'active', 'paused', 'completed' |
| pausedAt | DateTime? | When paused (if applicable) |
| notes | String? | Protocol notes |
| createdAt | DateTime | Creation timestamp |
| updatedAt | DateTime | Last update timestamp |

**Relations:**
- Belongs to UserProfile
- Belongs to Peptide
- Has many DoseLogs
- Has many DoseSchedules
- Has many ProtocolHistories

---

### DoseSchedule

Pre-generated scheduled doses (optional, for future batch generation).

| Field | Type | Description |
|-------|------|-------------|
| id | String (CUID) | Primary key |
| protocolId | String | Foreign key to Protocol |
| scheduledDate | DateTime | The date this dose is scheduled |
| doseAmount | Float | Amount to take |
| doseUnit | String | Unit of measure |
| timing | String? | Time of day |
| createdAt | DateTime | Creation timestamp |

**Relations:**
- Belongs to Protocol
- Has one DoseLog (optional)

**Constraints:**
- Unique on (protocolId, scheduledDate)

---

### DoseLog

Records actual dose administration and adherence.

| Field | Type | Description |
|-------|------|-------------|
| id | String (CUID) | Primary key |
| userId | String | Foreign key to UserProfile |
| scheduleId | String? | Foreign key to DoseSchedule |
| protocolId | String | Foreign key to Protocol |
| scheduledDate | DateTime | When dose was scheduled |
| completedAt | DateTime? | When actually completed |
| status | String | 'pending', 'completed', 'skipped', 'missed' |
| actualDose | Float? | If different from scheduled |
| actualUnit | String? | Unit if different |
| notes | String? | User notes |
| createdAt | DateTime | Creation timestamp |
| updatedAt | DateTime | Last update timestamp |

**Relations:**
- Belongs to UserProfile
- Belongs to Protocol
- Belongs to DoseSchedule (optional)

---

### InventoryVial

Tracks individual vials in the user's inventory.

| Field | Type | Description |
|-------|------|-------------|
| id | String (CUID) | Primary key |
| userId | String | Foreign key to UserProfile |
| peptideId | String | Foreign key to Peptide |
| identifier | String? | User-defined label |
| totalAmount | Float | Total peptide in vial |
| totalUnit | String | 'mg', 'mcg', 'IU' |
| diluentVolume | Float? | ml of BAC water added |
| concentration | Float? | Calculated amount per ml |
| concentrationUnit | String? | e.g., 'mg/ml' |
| dateReceived | DateTime? | When vial was received |
| dateReconstituted | DateTime? | When reconstituted |
| expirationDate | DateTime? | When it expires |
| remainingAmount | Float? | Estimated remaining |
| isExpired | Boolean | Expiration flag |
| isExhausted | Boolean | All doses used flag |
| notes | String? | Storage notes |
| createdAt | DateTime | Creation timestamp |
| updatedAt | DateTime | Last update timestamp |

**Relations:**
- Belongs to UserProfile
- Belongs to Peptide

---

### Reconstitution

Saved reconstitution calculations for reference.

| Field | Type | Description |
|-------|------|-------------|
| id | String (CUID) | Primary key |
| userId | String | Foreign key to UserProfile |
| peptideId | String | Foreign key to Peptide |
| vialAmount | Float | Total peptide in vial |
| vialUnit | String | 'mg', 'mcg', 'IU' |
| diluentVolume | Float | ml of diluent added |
| concentration | Float | Calculated concentration |
| concentrationUnit | String | e.g., 'mcg/ml' |
| targetDose | Float? | Desired dose per injection |
| targetUnit | String? | Unit for target dose |
| volumePerDose | Float? | ml to draw |
| notes | String? | Notes |
| createdAt | DateTime | Creation timestamp |
| updatedAt | DateTime | Last update timestamp |

**Relations:**
- Belongs to UserProfile
- Belongs to Peptide

---

### ProtocolHistory

Audit trail for protocol changes.

| Field | Type | Description |
|-------|------|-------------|
| id | String (CUID) | Primary key |
| protocolId | String | Foreign key to Protocol |
| changeType | String | 'created', 'updated', 'paused', 'resumed', 'completed' |
| changeData | String | JSON of what changed |
| createdAt | DateTime | When change occurred |

**Relations:**
- Belongs to Protocol

---

### Note

General-purpose notes attached to any entity.

| Field | Type | Description |
|-------|------|-------------|
| id | String (CUID) | Primary key |
| entityType | String | 'protocol', 'inventory', 'dose' |
| entityId | String | ID of the related entity |
| content | String | Note content |
| createdAt | DateTime | Creation timestamp |
| updatedAt | DateTime | Last update timestamp |

**Indexes:**
- Composite index on (entityType, entityId)

---

## Frequency Patterns

The `frequency` field in Protocol supports:

| Value | Behavior |
|-------|----------|
| `daily` | Every day |
| `weekly` | Same day each week (matches start date) |
| `custom` | Specific days defined in `customDays` |

### Custom Days Format

The `customDays` field stores a JSON array of day abbreviations:

```json
["mon", "wed", "fri"]
```

Valid values: `mon`, `tue`, `wed`, `thu`, `fri`, `sat`, `sun`

---

## Status Transitions

### Protocol Status

```
pending → active → paused → active → completed
                      ↘       ↗
                        resumed
```

| Status | Description |
|--------|-------------|
| active | Currently running |
| paused | Temporarily stopped |
| completed | Finished (manual or end date reached) |

### DoseLog Status

| Status | Description |
|--------|-------------|
| pending | Scheduled, not yet acted upon |
| completed | User marked as done |
| skipped | User intentionally skipped |
| missed | Past due, not completed |

---

## Example Queries

### Get Today's Checklist

```sql
SELECT
  p.id,
  pep.name as peptide_name,
  p.doseAmount,
  p.doseUnit,
  p.timing,
  dl.status
FROM Protocol p
JOIN Peptide pep ON p.peptideId = pep.id
LEFT JOIN DoseLog dl ON dl.protocolId = p.id
  AND date(dl.scheduledDate) = date('now')
WHERE p.userId = ?
  AND p.status = 'active'
  AND date(p.startDate) <= date('now')
  AND (p.endDate IS NULL OR date(p.endDate) >= date('now'))
```

### Calculate Adherence

```sql
SELECT
  COUNT(*) as total,
  SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
  ROUND(
    100.0 * SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) / COUNT(*),
    1
  ) as adherence_pct
FROM DoseLog
WHERE userId = ?
  AND scheduledDate >= date('now', '-30 days')
```

### Get Expiring Inventory

```sql
SELECT *
FROM InventoryVial
WHERE userId = ?
  AND isExpired = false
  AND isExhausted = false
  AND expirationDate <= date('now', '+7 days')
ORDER BY expirationDate ASC
```
