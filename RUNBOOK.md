# Peptide OS - Runbook

## Quick Start

```bash
# Clone and enter directory
cd peptide-os

# Install dependencies
npm install

# Set up database and seed with example data
npx prisma migrate dev

# Start development server
npm run dev
```

Open http://localhost:3000 in your browser.

---

## Complete Setup Instructions

### Prerequisites

- Node.js 18+ (recommended: 20 LTS)
- npm 9+

### 1. Install Dependencies

```bash
npm install
```

This will:
- Install all npm packages
- Generate Prisma Client (via postinstall hook)

### 2. Configure Environment

The `.env` file should already exist with:

```env
DATABASE_URL="file:./dev.db"
```

This stores the SQLite database in `prisma/dev.db`.

### 3. Initialize Database

```bash
# Run migrations and seed data
npx prisma migrate dev
```

This will:
- Create the SQLite database
- Apply all migrations
- Run the seed script with example data

### 4. Start Development Server

```bash
npm run dev
```

The app will be available at http://localhost:3000

---

## Available Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Build for production |
| `npm run start` | Start production server |
| `npm run lint` | Run ESLint |
| `npm run db:migrate` | Run Prisma migrations |
| `npm run db:seed` | Seed database with example data |
| `npm run db:studio` | Open Prisma Studio (database GUI) |
| `npm run db:reset` | Reset database (destructive!) |

---

## Database Management

### View/Edit Data with Prisma Studio

```bash
npm run db:studio
```

Opens a web-based database browser at http://localhost:5555

### Reset Database

```bash
npm run db:reset
```

⚠️ **Warning:** This deletes all data and reseeds with examples.

### Create New Migration

After modifying `prisma/schema.prisma`:

```bash
npx prisma migrate dev --name describe_your_changes
```

### Generate Prisma Client

If you modify the schema but don't need a migration:

```bash
npx prisma generate
```

---

## Production Deployment

### Build

```bash
npm run build
```

### Start Production Server

```bash
npm run start
```

### Environment Variables

For production, ensure `DATABASE_URL` points to your SQLite file location:

```env
DATABASE_URL="file:/var/data/peptide-os.db"
```

### Vercel Deployment

1. Push to GitHub
2. Connect repo to Vercel
3. Set environment variable:
   - `DATABASE_URL`: `file:./prisma/prod.db`
4. Deploy

Note: SQLite on Vercel has limitations (ephemeral filesystem). For persistent data, consider:
- Turso (SQLite-compatible)
- PlanetScale
- Self-hosted solution

---

## Backup & Restore

### Backup

The entire database is a single file. To backup:

```bash
cp prisma/dev.db backups/peptide-os-$(date +%Y%m%d).db
```

### Restore

```bash
cp backups/peptide-os-YYYYMMDD.db prisma/dev.db
```

---

## Troubleshooting

### "Cannot find module '@prisma/client'"

Run:
```bash
npx prisma generate
```

### "Database does not exist"

Run:
```bash
npx prisma migrate dev
```

### Port 3000 already in use

Use a different port:
```bash
npm run dev -- -p 3001
```

### Reset everything

```bash
rm -rf node_modules prisma/dev.db
npm install
npx prisma migrate dev
```

---

## Daily Usage Checklist

### Morning Routine

1. Open Peptide OS
2. Check **Today** screen for scheduled doses
3. Mark each dose as completed after administration
4. Note any skipped doses

### Weekly Tasks

- Review **Protocols** for any paused protocols
- Check **Inventory** for expiring vials
- Review **History** for adherence trends

### When Adding New Vials

1. Go to **Inventory** → **Add**
2. Enter peptide, amount, and reconstitution details
3. Set expiration date (typically 28 days from reconstitution)

### When Starting New Protocol

1. Go to **Protocols** → **Add**
2. Select peptide (or create new)
3. Set dose, frequency, and start date
4. Add notes for reference

### Reconstitution

1. Go to **Calculator**
2. Enter vial amount and diluent volume
3. Optionally enter target dose
4. Use the calculated volume for accurate dosing
5. Copy or print results for reference

---

## Architecture Notes

- **Local-first**: All data stored in SQLite, no cloud dependency
- **Mobile-friendly**: Designed for phone use
- **Multi-profile**: Supports multiple users
- **No tracking**: Zero analytics or external calls

---

## File Locations

| File | Purpose |
|------|---------|
| `prisma/dev.db` | SQLite database |
| `prisma/schema.prisma` | Database schema |
| `prisma/seed.ts` | Seed data script |
| `.env` | Environment variables |
| `src/app/(app)/` | Main app pages |
| `src/app/api/` | API routes |

---

## Getting Help

- **Documentation**: See `SYSTEM_DESIGN.md`, `DATA_MODEL.md`, `RECONSTITUTION_MATH.md`
- **Database Schema**: See `prisma/schema.prisma`
- **API Routes**: See `src/app/api/` directory
