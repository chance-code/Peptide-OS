# Claude Code Guidelines for Peptide-OS

## API Calls - ALWAYS check responses

```typescript
// BAD - fire and forget, silent failures
fetch('/api/endpoint', { method: 'POST', body }).catch(console.error)

// GOOD - await and check response
try {
  const res = await fetch('/api/endpoint', { method: 'POST', body })
  if (!res.ok) {
    console.error('API error:', await res.text())
    // Handle error - revert optimistic update, show toast, etc.
  }
} catch (error) {
  console.error('Network error:', error)
  // Handle error
}
```

## Optimistic Updates

When doing optimistic updates with React Query:
1. ALWAYS await the API call
2. ALWAYS check `res.ok`
3. ALWAYS revert on failure by calling `refetch()` or `queryClient.invalidateQueries()`

## UI Spacing

- Bottom nav uses `pb-[env(safe-area-inset-bottom)]` for iOS safe area
- Never change nav height/padding without testing on iOS
- Main content areas use `pb-20` to account for bottom nav

## Testing Changes

Before committing UI changes:
1. Test on mobile viewport (375px width)
2. Check dark mode
3. Verify touch targets are at least 44px

## React Query Settings

- `staleTime` for frequently-changing data (today page): 30 seconds
- `staleTime` for stable data (protocols, inventory): 5 minutes
- AI-generated content (insights, assessments): cache in localStorage + 1hr HTTP cache

## Common Pitfalls

1. **fetch doesn't throw on 4xx/5xx** - must check `res.ok`
2. **iOS caches PWA icons aggressively** - users must delete and re-add
3. **Prisma date queries** - use `startOfDay`/`endOfDay` for date matching
4. **Optimistic updates** - always have a rollback strategy
