# `refocus_cycle_titration` — Backfill Notes (2026-04-23)

## Context

This migration (`20260423191806_refocus_cycle_titration`) landed as part of the refocus Phase 1. It sits on top of a baseline reset (`00000000000000_baseline`) that collapsed four older, drifted migrations into a single source-of-truth snapshot of the dev.db schema.

The refocus migration is additive — no dropped columns, no type changes — and is non-destructive to existing data. One of its new columns, `InventoryVial.remainingVolumeMl`, requires a one-time backfill so existing vials render correctly in the new peptide-forward Today flow.

## Backfill script

`scripts/backfill-vial-volume.ts` — safe to re-run; only updates rows where `remainingVolumeMl IS NULL`.

**Formula:**
```
if diluentVolume is null or 0:         null        (supplement or never reconstituted)
elif isExhausted or isExpired:         0
elif remainingAmount / totalAmount:    diluentVolume × (remainingAmount / totalAmount)   (clamped 0..1)
else:                                  diluentVolume       (full vial fallback)
```

Rounded to 3 decimals (1 μL resolution) to avoid floating-point noise.

## Local run (2026-04-23)

```
[backfill-vial-volume] 4 vial(s) with remainingVolumeMl=NULL
  ✓ BPC-157 Current:    remainingVolumeMl=2 mL   (diluent=2, remaining=10/10 mg, expired=false, exhausted=false)
  ✓ Tirzepatide Current: remainingVolumeMl=1 mL   (diluent=1, remaining=10/10 mg, expired=false, exhausted=false)
  ✓ Ipamorelin Current:  remainingVolumeMl=2 mL   (diluent=2, remaining=10/10 mg, expired=false, exhausted=false)
  ✓ GHK-Cu Current:      remainingVolumeMl=3.4 mL (diluent=3.4, remaining=50/50 mg, expired=false, exhausted=false)
[backfill-vial-volume] done  updated=4  skipped=0
```

## Sanity check (Phase 1 exit criterion)

| vial | diluent (mL) | remaining (×unit) | expected mL | actual mL | status |
|---|---|---|---|---|---|
| BPC-157 Current | 2.0 | 10/10 mg | 2.0 | 2.0 | OK |
| Tirzepatide Current | 1.0 | 10/10 mg | 1.0 | 1.0 | OK |
| Ipamorelin Current | 2.0 | 10/10 mg | 2.0 | 2.0 | OK |
| GHK-Cu Current | 3.4 | 50/50 mg | 3.4 | 3.4 | OK |

All 4 active vials backfilled. Zero nulls remaining for peptide vials. Zero drift.

## Production (Turso) rollout steps

When this refocus ships to Turso, run in this order:

1. `prisma migrate resolve --applied 00000000000000_baseline`
   (Turso already has all these tables from the `db push` era — we only need Prisma to record the baseline as applied, not to re-run it.)
2. `prisma migrate deploy`
   (Applies `20260423191806_refocus_cycle_titration` — adds new tables + columns, preserves data via SQLite table-rebuild.)
3. `DATABASE_URL=<turso-libsql-url> TURSO_AUTH_TOKEN=<token> npx tsx scripts/backfill-vial-volume.ts`
   (Backfills `remainingVolumeMl` for production vials.)
4. Spot-check via `prisma studio` or direct SQL: verify `remainingVolumeMl` is non-null for active peptide vials and within tolerance of `diluentVolume × (remainingAmount/totalAmount)`.

Hold until Phase 2 verification is complete per `~/.claude/plans/enumerated-beaming-emerson.md`.
