# Arc Protocol UI/UX Redesign Plan

## Executive Summary

This plan addresses four key areas:
1. **Top Header Cleanup** - Remove persistent title/avatar, add contextual headers
2. **Dual Theme System** - Light and dark modes as intentional peers
3. **Bottom Navigation** - Restore Library with scalable architecture
4. **Information Hierarchy** - Premium, spacious, calm layouts

---

## 1. Top Header Architecture

### Current Issues
- Static "Arc Protocol" title wastes vertical space
- Avatar-only settings access is not discoverable
- Header competes with content for attention

### Recommended Solution: **Contextual Header + Settings in Navigation**

```
┌─────────────────────────────────────────┐
│ [Page Title]               [⚙️ Settings] │  ← Only when needed
├─────────────────────────────────────────┤
│                                         │
│            Full-bleed content           │
│                                         │
└─────────────────────────────────────────┘
```

#### Implementation

**TopHeader Component (Revised)**
```typescript
export function TopHeader({
  title,           // Optional - omit for full-bleed pages
  showSettings = true,
  rightAction,     // Optional custom action
  transparent = false
}: TopHeaderProps)
```

**Per-Tab Behavior:**
| Tab | Header Style |
|-----|-------------|
| Today | "Today, Jan 15" (date context) + Settings gear |
| Calendar | "Calendar" + Settings gear |
| Protocols | "Protocols" + Settings gear |
| Health | No header (immersive) - gear in integrations panel |
| Library | "Library" + Settings gear |

**Settings Entry:**
- Gear icon (Settings2 from lucide) in top-right when header visible
- On Health tab: accessible via integrations panel gear
- Settings page remains at `/settings`

---

## 2. Dual Theme System

### Design Philosophy
- Light and dark modes are **equal peers**, not afterthoughts
- Structural layout remains **identical** across themes
- Differentiation via: surfaces, elevation, contrast, accent emphasis

### Theme Token System

```css
:root {
  /* === SURFACES === */
  --surface-primary: #FFFFFF;      /* Main content background */
  --surface-secondary: #F8FAFC;    /* Page background */
  --surface-tertiary: #F1F5F9;     /* Subtle cards/sections */
  --surface-elevated: #FFFFFF;     /* Modals, sheets */

  /* === TEXT === */
  --text-primary: #111827;
  --text-secondary: #4B5563;
  --text-tertiary: #9CA3AF;
  --text-inverted: #FFFFFF;

  /* === BORDERS === */
  --border-default: #E5E7EB;
  --border-subtle: #F3F4F6;
  --border-strong: #D1D5DB;

  /* === ACCENTS === */
  --accent-primary: #4F46E5;       /* Indigo - primary actions */
  --accent-primary-muted: #EEF2FF;
  --accent-secondary: #0EA5E9;     /* Sky - health/data */
  --accent-secondary-muted: #E0F2FE;

  /* === SEMANTIC === */
  --success: #059669;
  --success-surface: #ECFDF5;
  --warning: #D97706;
  --warning-surface: #FFFBEB;
  --error: #DC2626;
  --error-surface: #FEF2F2;

  /* === ELEVATION (Light) === */
  --shadow-sm: 0 1px 2px rgba(0,0,0,0.04);
  --shadow-md: 0 4px 12px rgba(0,0,0,0.06);
  --shadow-lg: 0 12px 32px rgba(0,0,0,0.08);
}

.dark {
  /* === SURFACES (Dark) === */
  --surface-primary: #111827;
  --surface-secondary: #0B1220;
  --surface-tertiary: #1F2937;
  --surface-elevated: #1F2937;

  /* === TEXT (Dark) === */
  --text-primary: #F9FAFB;
  --text-secondary: #D1D5DB;
  --text-tertiary: #6B7280;
  --text-inverted: #111827;

  /* === BORDERS (Dark) === */
  --border-default: #374151;
  --border-subtle: #1F2937;
  --border-strong: #4B5563;

  /* === ACCENTS (Dark) === */
  --accent-primary: #818CF8;
  --accent-primary-muted: rgba(129, 140, 248, 0.15);
  --accent-secondary: #38BDF8;
  --accent-secondary-muted: rgba(56, 189, 248, 0.15);

  /* === SEMANTIC (Dark) === */
  --success: #34D399;
  --success-surface: rgba(52, 211, 153, 0.12);
  --warning: #FBBF24;
  --warning-surface: rgba(251, 191, 36, 0.12);
  --error: #F87171;
  --error-surface: rgba(248, 113, 113, 0.12);

  /* === ELEVATION (Dark) === */
  --shadow-sm: 0 1px 2px rgba(0,0,0,0.3);
  --shadow-md: 0 4px 12px rgba(0,0,0,0.4);
  --shadow-lg: 0 12px 32px rgba(0,0,0,0.5);
}
```

### Health Tab Light Mode Adaptation

The Health tab currently uses slate-950 dark backgrounds. For light mode:

```css
/* Health page surfaces - theme-aware */
.health-hero {
  background: linear-gradient(
    to bottom right,
    var(--surface-secondary),
    var(--accent-primary-muted)
  );
}

.dark .health-hero {
  background: linear-gradient(
    to bottom right,
    #0F172A,
    #1E1B4B
  );
}

.health-card {
  background: var(--surface-primary);
  border: 1px solid var(--border-default);
  box-shadow: var(--shadow-md);
}

.dark .health-card {
  background: var(--surface-tertiary);
  border: 1px solid var(--border-default);
}
```

---

## 3. Bottom Navigation Redesign

### Recommended Solution: **5-Tab Navigation with "More" Hub**

This balances immediate access to key features while scaling for growth.

```
┌─────────────────────────────────────────────────────────┐
│  Today    Calendar   Health   Protocols    More        │
│   📅        📆         💓        📋         ⋯          │
└─────────────────────────────────────────────────────────┘
```

### "More" Hub Contents (Bottom Sheet Modal)
```
┌─────────────────────────────────────────┐
│           More                    ✕     │
├─────────────────────────────────────────┤
│  📦  Inventory                          │
│  📚  Library                            │
│  💬  Chat                               │
│  🔧  Reconstitution Calculator          │
│  ⚙️  Settings                           │
└─────────────────────────────────────────┘
```

### Navigation Implementation

```typescript
// nav.tsx
const primaryNavItems = [
  { href: '/today', label: 'Today', icon: CalendarCheck },
  { href: '/calendar', label: 'Calendar', icon: CalendarDays },
  { href: '/health', label: 'Health', icon: Activity },
  { href: '/protocols', label: 'Protocols', icon: FileText },
  { href: null, label: 'More', icon: MoreHorizontal, isHub: true },
]

const hubItems = [
  { href: '/inventory', label: 'Inventory', icon: Package },
  { href: '/library', label: 'Library', icon: BookOpen },
  { href: '/chat', label: 'Chat', icon: MessageCircle },
  { href: '/reconstitution', label: 'Calculator', icon: Calculator },
  { href: '/settings', label: 'Settings', icon: Settings },
]
```

### Active States (Theme-Aware)
```css
.nav-item {
  color: var(--text-tertiary);
}

.nav-item-active {
  color: var(--accent-primary);
  background: var(--accent-primary-muted);
}
```

---

## 4. Information Hierarchy & Density

### Principles
1. **Glanceable first** - Key info visible without scrolling
2. **Progressive disclosure** - Tap for details
3. **Reduced chrome** - No redundant headers/borders
4. **Intentional whitespace** - Breathing room, not cramped

### Per-Tab Layout Updates

#### Today Tab
```
┌─────────────────────────────────────────┐
│ Today, Feb 2                     ⚙️     │
├─────────────────────────────────────────┤
│ ┌─────────────────────────────────────┐ │
│ │  3/5 Complete              [Ring]  │ │  ← Hero card
│ │  Great progress today!              │ │
│ └─────────────────────────────────────┘ │
│                                         │
│ MORNING                                 │
│ ┌─────────────────────────────────────┐ │
│ │ BPC-157  250mcg    [○]              │ │
│ └─────────────────────────────────────┘ │
│ ┌─────────────────────────────────────┐ │
│ │ Vitamin D  5000IU  [✓]              │ │
│ └─────────────────────────────────────┘ │
└─────────────────────────────────────────┘
```

#### Health Tab
```
┌─────────────────────────────────────────┐
│ [Full-bleed hero score]          ⚙️     │
│                                         │
│ ┌───┐ ┌───┐ ┌───┐                      │
│ │Slp│ │Rec│ │Act│   ← Sub-scores       │
│ └───┘ └───┘ └───┘                      │
│                                         │
│ WHAT CHANGED                            │
│ ┌─────────────────────────────────────┐ │
│ │ HRV +12ms • Deep Sleep +23min       │ │
│ └─────────────────────────────────────┘ │
└─────────────────────────────────────────┘
```

#### Protocols Tab
```
┌─────────────────────────────────────────┐
│ Protocols                        ⚙️     │
├─────────────────────────────────────────┤
│ ACTIVE (3)                              │
│ ┌─────────────────────────────────────┐ │
│ │ BPC-157        Day 45    [→]        │ │
│ │ 250mcg daily   +18% HRV             │ │
│ └─────────────────────────────────────┘ │
└─────────────────────────────────────────┘
```

---

## 5. Implementation Plan

### Phase 1: Theme Tokens (1-2 hours)
1. Update `globals.css` with new token system
2. Create theme transition animations
3. Ensure all existing components use tokens

### Phase 2: Navigation (2-3 hours)
1. Implement "More" hub bottom sheet
2. Update `nav.tsx` with 5-tab structure
3. Move settings to hub + contextual header
4. Test on iOS for safe areas

### Phase 3: Header Cleanup (1-2 hours)
1. Update `TopHeader` component
2. Remove static title from pages
3. Add gear icon to header
4. Update per-page header usage

### Phase 4: Health Tab Light Mode (2-3 hours)
1. Replace hardcoded dark colors with theme tokens
2. Create light mode gradient variants
3. Ensure cards work in both themes
4. Test score ring/charts in light mode

### Phase 5: Polish (1-2 hours)
1. Verify all tabs in both themes
2. Test theme switching animation
3. iOS/Safari testing
4. Fine-tune spacing/typography

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/app/globals.css` | New theme token system |
| `src/components/nav.tsx` | 5-tab nav + More hub |
| `src/components/top-header.tsx` | New contextual header |
| `src/app/(app)/health/page.tsx` | Theme-aware colors |
| `src/components/health/*.tsx` | Theme-aware colors |
| `src/app/(app)/today/page.tsx` | Remove TopHeader usage |
| All page files | Update header usage |

---

## Rationale for Recommendations

### Why "More" Hub over 6+ Icons?
- 5 icons is the iOS HIG sweet spot for thumb reach
- Hub scales infinitely as features grow
- Settings gets a dedicated, discoverable home
- Reduces cognitive load in primary nav

### Why Not Hamburger Menu?
- Hamburger hides features (out of sight = out of mind)
- Modal hub is still one tap away
- All primary actions remain visible

### Why Separate Light/Dark Token Sets?
- Allows intentional contrast tuning per theme
- Dark mode isn't just "inverted light"
- Each theme can have optimized legibility
