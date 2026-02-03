# CLAUDE.md — Arc Protocol Engineering Constitution

Arc Protocol is a premium peptide + supplement tracking app with a Health Intelligence layer.

This file defines the workflow gates and defaults Claude Code must follow on every task.

---

## 0) Non-negotiable Operating Rules (Must Follow)

1) **Plan before code + wait for approval**
   - Before writing or editing any code, describe your approach (steps + files you expect to touch) and **wait for approval**.
   - If requirements are ambiguous, **ask clarifying questions before any code**.

2) **>3 files rule**
   - If a task requires changes to **more than 3 files**, STOP.
   - Break the work into smaller tasks and propose the sequence. Proceed only after approval.

3) **Post-change risk + tests**
   - After writing code, list:
     - what could break,
     - and the tests you recommend (or added) to cover it.

4) **Bugfix protocol = test first**
   - When there's a bug: start by writing a test that reproduces it.
   - Then fix until the test passes.
   - Add regression coverage where appropriate.

5) **Permanent improvement loop**
   - Every time the user corrects you, **add a new rule** to this file so that mistake never happens again.
   - Include the date + a short description of the correction.

---

## 1) How to Work in This Repo (Default Flow)

### 1.1 Standard task flow
1. Clarify requirements (ask questions if needed)
2. Present plan (steps + ≤3 files) → wait for approval
3. Implement
4. Run targeted tests / checks
5. Summarize:
   - What changed
   - What could break
   - Suggested/added tests
   - Rollback plan (if meaningful)

### 1.2 If you need context
- Prefer reading existing code and docs over guessing.
- Do not invent APIs, env vars, or endpoints—locate them in the repo or ask.

### 1.3 "Safe defaults"
- Minimal changes that solve the problem
- Avoid broad refactors unless explicitly requested
- Prefer small PR-sized increments

---

## 2) Project Map

- **Platform**: iOS (Capacitor 8), Web (Next.js PWA)
- **Framework**: Next.js 16 with App Router, TypeScript
- **Auth**: NextAuth.js (JWT strategy) — Google, Apple, Credentials providers
- **Database**: PostgreSQL via Prisma ORM
- **Health data**: Apple HealthKit (via `@flomentumsolutions/capacitor-health-extended`), Oura (OAuth2), Eight Sleep (OAuth2)
- **State management**: Zustand (client), React Query / TanStack Query (server)
- **UI**: Tailwind CSS, shadcn/ui components
- **Networking layer**: Next.js API routes, `fetch()` from client
- **AI**: OpenAI GPT-4o for insights/chat
- **Push notifications**: APNs (HTTP/2 with JWT), Web Push (VAPID)
- **Mobile wrapper**: Capacitor 8 for iOS native
- **Deployment**: Vercel (Hobby plan, daily cron only)

### Project Structure

```
src/
├── app/(app)/        # Authenticated pages (today, protocols, inventory, health, etc.)
├── app/api/          # API routes
├── components/       # Reusable UI components
│   └── health/       # Health dashboard components
├── lib/              # Utilities, Prisma client, health engines
│   └── health-providers/  # Apple Health, Oura, Eight Sleep providers
└── store/            # Zustand store

ios/App/              # iOS Capacitor project (xcodeproj, Info.plist)
brand/                # Logo SVGs (logo.svg, logo-light.svg, logo-mark.svg)
prisma/               # Schema and migrations
```

---

## 3) Commands

### Install
- `npm install`

### Run (dev)
- `npm run dev`

### Tests
- No test framework currently configured

### Lint / Typecheck
- `npm run lint` (ESLint)
- TypeScript checking runs during `npm run build`

### Build
- Web: `npm run build` (runs `prisma generate && next build`)
- iOS: `npx cap sync ios && xcodebuild -project ios/App/App.xcodeproj -scheme App -configuration Release -sdk iphoneos -destination 'generic/platform=iOS' build`
- Database: `npx prisma studio` (GUI), `npx prisma migrate dev` (migrations)

### Deploy
- `vercel --prod` (deploy to production)

---

## 4) Code Standards (Defaults)

- Prefer clarity over cleverness.
- Keep functions small and single-purpose.
- Avoid "magic" behavior; make control flow explicit.
- Handle error states and empty states intentionally.
- No dead code; remove unused imports and variables.
- Keep UI logic separate from data fetching and derivation when practical.

### API Calls - MUST await and check response
```typescript
// ALWAYS do this - never fire-and-forget
const res = await fetch('/api/endpoint', { method: 'POST', body })
if (!res.ok) {
  console.error('API error:', await res.text())
  // Revert optimistic update or show error
}
```

### Optimistic Updates
1. Update UI immediately via `queryClient.setQueryData()`
2. Await the API call
3. On failure: call `refetch()` to revert

### When touching UI
- Respect safe areas and notches
- Bottom nav: `pb-[env(safe-area-inset-bottom)]`
- Main content: `pb-20` to clear bottom nav
- **Never change nav height without testing on iOS**
- Ensure light/dark mode parity
- Verify tap targets and scroll performance

### When touching health data
- Be explicit about:
  - permissions requested
  - what metrics are read
  - when last sync occurred
  - and how stale data is shown

### React Query Cache Settings

| Data Type | staleTime | Why |
|-----------|-----------|-----|
| Today doses | 30s | Frequently changing |
| Protocols/Inventory | 5min | Relatively stable |
| Health metrics | 5min | Moderate refresh |
| AI insights | localStorage + 1hr HTTP | Expensive to generate |

---

## 5) Performance & Quality Bar

- Avoid unnecessary re-renders (memoize where needed).
- Use list virtualization for long lists.
- Cache health queries and derived metrics; don't recompute on every render.
- Never block the main/UI thread with heavy aggregation.

---

## 6) Testing Expectations

### 6.1 Bugfix = test first (non-negotiable)
- Add a failing test that reproduces the bug.
- Fix until green.
- Keep the test minimal and targeted.

### 6.2 After changes
- Add/adjust tests proportional to risk:
  - auth changes → auth flow tests
  - health insights → deterministic insight unit tests
  - sync UI → stale/last-sync state tests
  - navigation → "single transition" tests where possible

### 6.3 "What could break" checklist (always include after coding)
- Auth redirects / deep links
- Token persistence / logout
- Permission flows
- Health sync staleness or missing metrics
- UI safe-area regressions
- Performance regressions on large data sets

---

## 7) Auth & Navigation Guardrails

- There must be **exactly one** post-auth navigation transition.
- Avoid double-triggering navigation from:
  - auth state listeners,
  - effect hooks,
  - and async profile fetch completion.
- Ensure redirect URIs and bundle identifiers are correct and environment-specific.
- Prefer idempotent handlers for callbacks/deep links.
- iOS OAuth uses SFSafariViewController (via `@capacitor/browser`) to avoid Google's WKWebView block.
- Custom URL scheme: `arcprotocol://` registered in Info.plist.
- Transfer token flow: SFSafariViewController → `/api/auth/mobile-token` (HTML redirect) → `arcprotocol://auth-callback?token=X` → `/api/auth/mobile-exchange` (cookie exchange).

---

## 8) Health Insights Guardrails

Insights must not be generic.
They should:
- combine multiple signals (sleep + HR/HRV + activity + body comp when available),
- explain "why," not just "what,"
- show confidence/limitations when data is missing,
- and link to the underlying metrics used.

The app must clearly show:
- connection status,
- permission status,
- last successful sync time,
- and which metrics are enabled.

---

## 9) Do Not Modify Without Care

- `src/components/nav.tsx` - iOS spacing is finicky
- `prisma/schema.prisma` - Requires migration
- `ios/` - Native iOS project files
- `capacitor.config.ts` - Affects all native behavior

---

## 10) Deployment Workflow (MANDATORY)

**Every code change MUST be deployed. No exceptions.**

After ANY file modification:
1. `npm run build` - Verify no errors
2. `vercel --prod` - Deploy immediately
3. Confirm deployment URL in output
4. If iOS changes: `npx cap sync ios` + xcodebuild

**Do NOT end a task without deploying.** If build fails, fix it before moving on.

---

## 11) Common Mistakes to Avoid

1. **fetch() doesn't throw on 4xx/5xx** - must check `res.ok`
2. **iOS caches PWA icons** - users must delete & re-add app
3. **Date queries** - use `startOfDay()`/`endOfDay()` from date-fns
4. **Don't over-engineer** - simple > clever
5. **NextResponse.redirect() doesn't work with custom URL schemes** - use HTML page with `window.location.href` instead
6. **Vercel Hobby plan** - cron limited to daily, no `*/15` schedules
7. **`.vercelignore`** - Must exclude `ios/`, `android/`, `brand/`, `.claude/` to avoid 4000+ file uploads

---

## 12) Documentation & Living Rules

This file is a living document. Update it when:
- a new recurring mistake is identified,
- a workflow step is repeatedly skipped,
- or a repo-specific gotcha is discovered.

### Corrections Log (append-only)
- 2026-02-03 — Added rule: NextResponse.redirect() fails with custom URL schemes; use HTML page redirect instead
- 2026-02-03 — Added rule: .vercelignore must exclude ios/android/brand/.claude directories
- 2026-02-03 — Added rule: Vercel Hobby plan limits cron to daily frequency
