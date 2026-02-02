# Arc Protocol

Precision tracking for peptides and supplements. iOS (Capacitor) and web (Next.js PWA).

## Tech Stack

- **Framework**: Next.js 16 with App Router, TypeScript
- **Database**: PostgreSQL via Prisma ORM
- **State**: Zustand (client), React Query (server)
- **UI**: Tailwind CSS, shadcn/ui components
- **Mobile**: Capacitor for iOS native wrapper
- **AI**: OpenAI GPT-4o for insights/chat

## Project Structure

```
src/
├── app/(app)/        # Authenticated pages (today, protocols, inventory, etc.)
├── app/api/          # API routes
├── components/       # Reusable UI components
├── lib/              # Utilities, Prisma client, references
└── store/            # Zustand store
```

## Commands

```bash
npm run dev           # Start dev server
npm run build         # Production build
npm run lint          # ESLint check
npx prisma studio     # Database GUI
vercel --prod         # Deploy to production
```

## Critical Patterns

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

### iOS Safe Areas
- Bottom nav: `pb-[env(safe-area-inset-bottom)]`
- Main content: `pb-20` to clear bottom nav
- **Never change nav height without testing on iOS**

## React Query Cache Settings

| Data Type | staleTime | Why |
|-----------|-----------|-----|
| Today doses | 30s | Frequently changing |
| Protocols/Inventory | 5min | Relatively stable |
| AI insights | localStorage + 1hr HTTP | Expensive to generate |

## Do Not Modify Without Care

- `src/components/nav.tsx` - iOS spacing is finicky
- `prisma/schema.prisma` - Requires migration
- `ios/` - Native iOS project files

## Deployment Workflow (MANDATORY)

**Every code change MUST be deployed. No exceptions.**

After ANY file modification:
1. `npm run build` - Verify no errors
2. `vercel --prod` - Deploy immediately
3. Confirm deployment URL in output

**Do NOT end a task without deploying.** If build fails, fix it before moving on.

## Common Mistakes to Avoid

1. **fetch() doesn't throw on 4xx/5xx** - must check `res.ok`
2. **iOS caches PWA icons** - users must delete & re-add app
3. **Date queries** - use `startOfDay()`/`endOfDay()` from date-fns
4. **Don't over-engineer** - simple > clever
