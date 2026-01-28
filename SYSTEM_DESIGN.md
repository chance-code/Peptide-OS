# Peptide OS - System Design

## Overview

Peptide OS is a local-first personal protocol management application designed to help users track, schedule, calculate, and adhere to peptide protocols. It supports multiple user profiles and provides comprehensive tools for daily dose management, inventory tracking, and reconstitution calculations.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Frontend                              │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │              Next.js App Router (React 19)              │ │
│  │  ┌─────────┬─────────┬──────────┬──────────┬─────────┐  │ │
│  │  │  Today  │Protocols│Inventory │Calculator│ History │  │ │
│  │  └─────────┴─────────┴──────────┴──────────┴─────────┘  │ │
│  │                                                          │ │
│  │  ┌─────────────────────────────────────────────────────┐ │ │
│  │  │        Zustand (Client State Management)            │ │ │
│  │  └─────────────────────────────────────────────────────┘ │ │
│  └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      API Layer                               │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │              Next.js API Routes                          │ │
│  │  /api/users  /api/peptides  /api/protocols              │ │
│  │  /api/inventory  /api/doses  /api/today                 │ │
│  │  /api/reconstitution                                    │ │
│  └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      Data Layer                              │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │                 Prisma ORM                               │ │
│  └─────────────────────────────────────────────────────────┘ │
│                              │                               │
│                              ▼                               │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │              SQLite Database (Local)                     │ │
│  └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

## Core Components

### 1. User Profile Management

- **Multi-profile support**: Independent protocols, inventory, and history per user
- **Profile switching**: Fast switching without logout
- **Active profile state**: Persisted in localStorage via Zustand

### 2. Protocol Management

Protocols define ongoing peptide regimens:

- **Scheduling**: Daily, weekly, or custom day patterns (Mon/Wed/Fri, etc.)
- **Duration**: Fixed cycles or indefinite protocols
- **Status tracking**: Active, paused, or completed
- **History**: All changes are logged for audit trail

### 3. Daily Execution Engine

The `/api/today` endpoint generates daily checklists by:

1. Fetching all active protocols for the current user
2. Filtering to protocols that include today based on frequency rules
3. Checking existing dose logs for completion status
4. Flagging expired inventory warnings
5. Sorting by timing preference

### 4. Adherence Tracking

- Doses can be marked: completed, skipped, or missed
- Historical views show trends over 7, 14, or 30 days
- Adherence percentage calculated per protocol

### 5. Inventory Management

- Track vials by peptide, reconstitution date, expiration
- Automatic expiration detection
- Remaining dose estimation

### 6. Reconstitution Calculator

- Input: vial amount, diluent volume, target dose
- Output: concentration, volume to draw, syringe units
- Step-by-step calculation display
- Copy/print functionality

## Key Design Decisions

### Local-First Architecture

SQLite was chosen for:
- Zero external dependencies
- Instant startup
- Offline capability
- Simple backup (copy the .db file)

### Mobile-First UI

- Bottom navigation for thumb access
- Large touch targets
- Minimal scrolling on key screens
- Safe area handling for iOS

### No Hardcoded Logic

All peptides, doses, schedules are user-defined. The system makes no assumptions about:
- What peptides exist
- Standard dosing
- Default schedules
- Storage requirements

### Audit Trail

Protocol history tracks all changes with:
- Timestamp
- Change type (created, updated, paused, resumed, completed)
- Before/after values as JSON

## Security Considerations

- All data stored locally
- No cloud sync (by design)
- No authentication (device-level access control)
- No external API calls
- No tracking or analytics

## Future Considerations

### Potential Enhancements

1. **Cloud Sync** (optional): Encrypted backup to user's chosen provider
2. **Reminders**: Push notifications for scheduled doses
3. **Charts**: Visual adherence and progress graphs
4. **Import/Export**: JSON backup and restore
5. **Multiple Devices**: Sync via file or cloud
6. **Barcode Scanning**: For inventory management

### Scalability

The current architecture supports:
- Unlimited users (practical limit: ~10)
- Unlimited peptides
- Unlimited protocols per user
- Years of dose history (SQLite can handle millions of rows)

## Technology Stack

| Component | Technology |
|-----------|------------|
| Frontend | Next.js 16 (App Router) |
| UI | React 19, Tailwind CSS 4 |
| State | Zustand |
| API | Next.js API Routes |
| Database | SQLite via Prisma |
| Icons | Lucide React |
| Dates | date-fns |

## File Structure

```
peptide-os/
├── prisma/
│   ├── schema.prisma      # Database schema
│   ├── seed.ts            # Seed data script
│   └── migrations/        # Database migrations
├── src/
│   ├── app/
│   │   ├── (app)/         # Main app routes
│   │   │   ├── today/
│   │   │   ├── protocols/
│   │   │   ├── inventory/
│   │   │   ├── reconstitution/
│   │   │   ├── history/
│   │   │   └── settings/
│   │   ├── api/           # API routes
│   │   └── layout.tsx
│   ├── components/
│   │   ├── ui/            # Reusable UI components
│   │   ├── nav.tsx
│   │   └── profile-selector.tsx
│   ├── lib/
│   │   ├── prisma.ts      # Prisma client
│   │   ├── reconstitution.ts  # Calculator logic
│   │   ├── schedule.ts    # Scheduling utilities
│   │   └── utils.ts
│   ├── store/
│   │   └── index.ts       # Zustand store
│   └── types/
│       └── index.ts       # TypeScript types
└── docs/
    ├── SYSTEM_DESIGN.md
    ├── DATA_MODEL.md
    ├── RECONSTITUTION_MATH.md
    └── RUNBOOK.md
```
