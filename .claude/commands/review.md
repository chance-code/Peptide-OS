# Code Review

Review the code changes for this project. Check for:

## Security
- [ ] API routes verify user authentication (use `verifyUserAccess()` from `@/lib/api-auth`)
- [ ] No SQL injection (Prisma handles this, but check raw queries)
- [ ] No XSS (user input properly escaped)
- [ ] No secrets in code or logs

## Error Handling
- [ ] All `fetch()` calls await and check `res.ok`
- [ ] Optimistic updates have rollback on failure
- [ ] API errors return proper status codes
- [ ] OpenAI calls have timeouts

## Performance
- [ ] No N+1 queries (check Prisma includes)
- [ ] Queries have limits where appropriate
- [ ] Heavy computations are memoized
- [ ] React Query cache settings are appropriate

## React Patterns
- [ ] useEffect dependencies are complete
- [ ] No setState in effects without cleanup
- [ ] Components handle loading/error states

## iOS/Mobile UI
- [ ] Bottom nav spacing uses `pb-[env(safe-area-inset-bottom)]`
- [ ] Touch targets are at least 44px
- [ ] Tested on mobile viewport (375px width)
- [ ] Text is readable (sufficient contrast, appropriate size)
- [ ] Containers have `overflow-hidden` where needed to prevent bleed
- [ ] Flex/grid children use `flex-shrink-0` or `min-w-0` to prevent overflow
- [ ] Dynamic content (lists, dots, badges) is limited or truncated
- [ ] No horizontal scroll on mobile unless intentional

## Visual/Brand
- [ ] Colors use CSS variables (`var(--foreground)`, `var(--muted)`, etc.)
- [ ] No hardcoded colors that break dark mode
- [ ] Spacing is consistent (use Tailwind scale)
- [ ] Rounded corners are consistent (`rounded-xl`, `rounded-2xl`)

If reviewing specific files: $ARGUMENTS

Run `npm run lint` and `npm run build` to catch additional issues.
