# RanchOS — Frontend Implementation Plan
## Part E: Settings, Billing, i18n Keys & Implementation Checklist

> **Prerequisite:** Parts A–D · **Final part of the frontend plan**

---

## 1. Settings Layout

```tsx
// app/(dashboard)/settings/layout.tsx
// Sub-nav tabs: General | Team | Billing | Integrations
// Use horizontal tab bar below PageHeader
// Each tab is a Link — active state: bottom border in --color-ranch-sky

const TABS = [
  { href: '/settings',              label: 'settings.general' },
  { href: '/settings/team',         label: 'settings.team' },
  { href: '/settings/billing',      label: 'settings.billing' },
  { href: '/settings/integrations', label: 'settings.integrations' },
];
```

---

## 2. Billing Page (`/settings/billing/page.tsx`)

```tsx
// app/(dashboard)/settings/billing/page.tsx
import { PricingCalculator } from '@/components/billing/PricingCalculator';
import { SubscriptionStatus } from '@/components/billing/SubscriptionStatus';
import { InvoiceHistory } from '@/components/billing/InvoiceHistory';

export const metadata = { title: 'Billing' };

export default async function BillingPage() {
  const subscription = await getCurrentSubscription();
  return (
    <div className="max-w-3xl space-y-6 animate-fade-in">
      <PageHeader title="Billing" subtitle="Manage your subscription and payment details." />
      <SubscriptionStatus subscription={subscription} />
      <PricingCalculator currentAcres={subscription?.acres} />
      <InvoiceHistory />
    </div>
  );
}
```

---

## 3. SubscriptionStatus Component

```tsx
// components/billing/SubscriptionStatus.tsx
// Shows current plan card:
//   - Plan name badge (Starter / Growth / Enterprise)
//   - Monthly total (large, bold, tabular-nums)
//   - Trial days remaining banner (amber) or renewal date
//   - "Manage in Stripe" → link to Stripe customer portal
//   - "Upgrade Plan" button if on Starter or Growth

// Status variants:
//   active:    green dot + "Active"
//   trialing:  amber dot + "Trial — X days remaining"
//   past_due:  red dot + "Payment failed — update card"
//   canceled:  gray dot + "Canceled"
```

---

## 4. PricingCalculator Component

```tsx
// components/billing/PricingCalculator.tsx
'use client';
import { useState } from 'react';
import { calculateMonthlyPrice, PRICING } from '@ranchos/shared/constants/pricing';
import { Card, CardContent } from '@/components/ui/Card';
import { useTranslation } from 'react-i18next';

export function PricingCalculator({ currentAcres = 50 }: { currentAcres?: number }) {
  const { t } = useTranslation();
  const [acres, setAcres] = useState(currentAcres);
  const [seats, setSeats] = useState(0);

  return (
    <Card id="pricing-calculator">
      <CardContent className="p-6 space-y-5">
        <h2 className="text-h3">{t('billing.price_calculator')}</h2>

        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--color-text-secondary)] mb-2">
            {t('billing.total_acres')}: <span className="text-[var(--color-text-primary)] font-bold">{acres}</span>
          </label>
          <input
            id="billing-acres-slider"
            type="range"
            min={10}
            max={1000}
            step={10}
            value={acres}
            onChange={e => setAcres(Number(e.target.value))}
            className="w-full accent-[var(--color-ranch-leaf)]"
          />
          <div className="flex justify-between text-xs text-[var(--color-text-muted)] mt-1">
            <span>10</span><span>500</span><span>1,000+</span>
          </div>
        </div>

        {/* Plan cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {(['starter', 'growth', 'enterprise'] as const).map(plan => {
            const monthly = calculateMonthlyPrice(plan, acres, seats);
            const p = PRICING[plan];
            return (
              <div key={plan} className="rounded-xl border border-[var(--color-border)] p-4 hover:border-sky/50 transition-colors">
                <p className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-muted)]">{p.name}</p>
                <p className="text-2xl font-bold tabular-nums mt-2">
                  ${monthly}<span className="text-sm font-normal text-[var(--color-text-muted)]">/mo</span>
                </p>
                <p className="text-xs text-[var(--color-text-muted)] mt-1">
                  ${monthly * 10 / 12 | 0}/mo billed annually
                </p>
                <ul className="mt-3 space-y-1">
                  {p.features.slice(0, 4).map(f => (
                    <li key={f} className="text-xs text-[var(--color-text-secondary)] flex items-center gap-1.5">
                      <span className="text-leaf">✓</span> {t(`billing.feature.${f}`)}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
```

---

## 5. Team Settings Page (`/settings/team/page.tsx`)

```tsx
// Key sections:
// 1. Invite member form (email + role dropdown: owner | manager | crew)
//    - Role descriptions shown as tooltip/helper text
//    - On submit → POST /api/v1/invites → toast.success
// 2. Members table:
//    Columns: Avatar+Name | Role badge | Language | Last active | Actions (Remove)
//    - Role badge colors: owner=soil, manager=sky, crew=leaf
//    - H-2A identification badge (gray, not compliance claim)
// 3. Pending invites section (if any)
```

---

## 6. i18n Key Reference (`packages/i18n/locales/en/`)

### `common.json`
```json
{
  "today": "Today", "back": "Back", "cancel": "Cancel", "save": "Save",
  "continue": "Continue", "select": "Select...", "other": "Other",
  "notes": "Notes", "acres": "acres", "view_details": "View Details",
  "live": "Live", "disconnected": "Disconnected", "search_placeholder": "Search...",
  "add_season": "Add Season", "saving": "Saving..."
}
```

### `auth.json`
```json
{
  "welcome_back": "Welcome back", "sign_in_subtitle": "Sign in to your RanchOS account",
  "email": "Email", "password": "Password", "forgot_password": "Forgot password?",
  "sign_in": "Sign In", "no_account": "Don't have an account?",
  "start_trial": "Start free trial", "full_name": "Full Name",
  "create_account": "Create Account", "have_account": "Already have an account?",
  "invalid_credentials": "Invalid email or password. Please try again.",
  "trial_terms": "14-day free trial. No credit card required.",
  "start_free_trial": "Start your free trial",
  "trial_subtitle": "Set up your ranch in under 10 minutes."
}
```

### `nav.json`
```json
{
  "dashboard": "Dashboard", "blocks": "Blocks", "tasks": "Tasks",
  "irrigation": "Irrigation", "scouting": "Scouting",
  "labor": "Labor", "compliance": "Compliance", "settings": "Settings",
  "operation": "Operation", "collapse": "Collapse"
}
```

### `blocks.json`
```json
{
  "name": "Block Name", "ranch": "Ranch", "crop_type": "Crop Type",
  "variety": "Variety", "acreage": "Acreage", "tree_count": "Tree Count",
  "year_planted": "Year Planted", "irrigation": "Irrigation Type",
  "organic_certified": "Certified Organic Block",
  "organic_description": "OMRI-listed products only will be required",
  "organic_since": "Organic Since", "certification_body": "Certifier",
  "water_reporting": "Water Reporting", "apn": "APN (Parcel Number)",
  "water_district": "Water District", "save_block": "Save Block",
  "organic": "Organic", "open_tasks": "open tasks",
  "season_history": "Season History", "draw_block": "Draw Block",
  "cancel_draw": "Cancel", "enter_manually": "Enter manually",
  "no_season_data": "No season data yet. Add harvest results after each season.",
  "season": "Season", "bloom": "Bloom", "harvest_start": "Harvest Start",
  "yield_lbs": "Yield (lbs)", "lbs_per_acre": "lbs/acre"
}
```

### `tasks.json`
```json
{
  "type": "Task Type", "title": "Title", "description": "Description",
  "due_date": "Due Date", "priority": "Priority", "blocks": "Blocks",
  "assign_to": "Assign To", "create_task": "Create Task", "new_task": "New Task",
  "status_updated": "Task status updated", "created_success": "Task created",
  "title_placeholder": "e.g. Irrigate North Block",
  "no_tasks_in_column": "No tasks here",
  "overdue": "Overdue", "due_today": "Due today",
  "status": {
    "pending": "Pending", "in_progress": "In Progress",
    "completed": "Completed", "overdue": "Overdue"
  },
  "priority": {
    "low": "Low", "normal": "Normal", "high": "High", "urgent": "Urgent"
  }
}
```

### `dashboard.json`
```json
{
  "weather": "7-Day Forecast", "frost_risk_alert": "Frost Risk",
  "low": "Low", "rain": "Rain", "activity": "Live Activity",
  "no_activity": "No activity yet. Tasks and syncs will appear here.",
  "welcome_title": "Welcome to RanchOS!",
  "welcome_subtitle": "You're set up. Add your first block to get started.",
  "add_first_block": "Add First Block", "invite_crew": "Invite Crew"
}
```

### Spanish equivalents (`es/`) follow the same key structure — all keys must exist in both locales.

---

## 7. Accessibility Standards

| Feature | Implementation |
|---|---|
| **WCAG 2.1 AA** | All interactive elements meet contrast ratio 4.5:1 minimum |
| **Keyboard navigation** | All nav items, buttons, modals keyboard-accessible |
| **Focus rings** | `focus-visible:ring-2 ring-sky/50` — never `outline-none` without replacement |
| **Screen reader labels** | All icon-only buttons have `aria-label` |
| **Skip link** | `<a href="#main-content" className="sr-only focus:not-sr-only">` in root layout |
| **Form errors** | `aria-describedby` links inputs to error messages |
| **Loading states** | `aria-busy="true"` on skeleton containers |
| **Map alt text** | BlockMap has `role="img" aria-label` describing the block visualization |
| **Color only** | Status never conveyed by color alone — always includes text or icon |

---

## 8. Responsive Breakpoints

| Breakpoint | Layout change |
|---|---|
| `< 768px` (mobile) | Sidebar hidden (hamburger menu), single column, full-width cards |
| `768px–1024px` (tablet) | Sidebar collapsed (icon-only), 2-column grids |
| `> 1024px` (desktop) | Full sidebar, 4-column stat row, split views |
| `> 1280px` (wide) | Max-width containers cap at `max-w-7xl` to prevent wide-screen stretch |

Mobile sidebar pattern:
```tsx
// On mobile: sidebar is a drawer over content (z-50)
// Triggered by hamburger in TopBar
// Backdrop overlay closes it on click
// Uses translate-x-0 / -translate-x-full with transition-transform
```

---

## 9. Error Boundary

```tsx
// app/(dashboard)/error.tsx
'use client';
import { Button } from '@/components/ui/Button';
import { AlertTriangleIcon } from 'lucide-react';

export default function DashboardError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center h-64 gap-4 text-center">
      <div className="p-4 rounded-full bg-red-50">
        <AlertTriangleIcon className="w-8 h-8 text-red-500" />
      </div>
      <h2 className="text-h2 text-[var(--color-text-primary)]">Something went wrong</h2>
      <p className="text-sm text-[var(--color-text-secondary)] max-w-sm">{error.message}</p>
      <Button onClick={reset} variant="secondary">Try again</Button>
    </div>
  );
}
```

---

## 10. Implementation Checklist

### Design System (Part A)
- [ ] CSS custom properties defined in `globals.css`
- [ ] Tailwind config extended with brand tokens
- [ ] Inter font loaded via `next/font`
- [ ] Dark mode CSS properties defined
- [ ] Shimmer skeleton animation working
- [ ] `cn()` utility installed (`clsx` + `tailwind-merge`)

### Layout (Part A)
- [ ] AppShell renders with sidebar + topbar
- [ ] Sidebar collapses/expands with animation
- [ ] Active nav item highlighted with gold left-accent
- [ ] Mobile hamburger menu works (Phase 1.5)
- [ ] Language switcher toggles EN ↔ ES globally

### Dashboard (Part B)
- [ ] 4 StatCards render with real data from `/api/v1/dashboard/stats`
- [ ] WeatherWidget fetches Open-Meteo (no API key required)
- [ ] Frost risk badge appears when min temp < 36°F within 3 days
- [ ] ActivityFeed connects to SSE endpoint
- [ ] ActivityFeed shows live dot pulse when connected

### Blocks (Part B)
- [ ] Satellite map loads with Mapbox token
- [ ] Block polygons render with crop-type colors
- [ ] Organic blocks have green dashed border overlay
- [ ] Block labels appear at appropriate zoom
- [ ] Draw tool activates polygon mode
- [ ] Polygon draw → turf.area() calculates acreage → BlockForm pre-filled
- [ ] "Enter manually" link always visible as fallback
- [ ] BlockPopup shows name, variety, acreage, organic badge, open task count
- [ ] BlockCard shows organic badge when `is_organic = true`
- [ ] BlockForm includes `is_organic` toggle, `organicSince`, `apn`, `waterDistrict`
- [ ] Block detail renders season history chart (recharts BarChart)
- [ ] Block season table sortable by year

### Tasks (Part C)
- [ ] Kanban 4 columns render: Pending | In Progress | Completed | Overdue
- [ ] Drag-and-drop updates status with optimistic UI
- [ ] Status conflict: dragging to lower state doesn't overwrite confirmed sync
- [ ] TaskCard shows priority badge, due date indicator, assignee avatars
- [ ] Overdue tasks show red date text
- [ ] Create task: task type visual radio selector
- [ ] Create task: block multi-select chip toggle
- [ ] Create task: assignee multi-select chip toggle
- [ ] Tasks filter bar: by ranch, type, assignee, organic/conventional

### Auth & Onboarding (Part D)
- [ ] Login page: dark glassmorphism card, gradient background
- [ ] Signup → redirects to `/onboarding` on success
- [ ] Onboarding wizard: progress bar animates between steps
- [ ] Step 1 language toggle applies to i18n immediately
- [ ] Step 2 pricing calculator updates in real-time as acres change
- [ ] Step 3 skippable — no block required to reach dashboard
- [ ] Welcome banner shows on `?welcome=1` and dismisses cleanly

### Settings & Billing (Part E)
- [ ] Sub-nav tabs with active state underline
- [ ] Billing page shows current subscription status badge
- [ ] Pricing calculator shows 3 plan cards with live acre-based totals
- [ ] Annual discount preview shown on each plan
- [ ] Invite team modal: email + role + language preference
- [ ] Members table: role badge, mobile sync status, last active

### i18n
- [ ] All visible strings use `t('key')` — zero hardcoded English text
- [ ] All keys exist in both `en/` and `es/` locale files
- [ ] Locale persisted to `localStorage` and re-applied on page load
- [ ] API error messages returned in user's locale (server-side)

### Cross-cutting
- [ ] All buttons have unique `id` attributes for E2E testing
- [ ] Error boundaries on every dashboard route segment
- [ ] Skeleton loading states for all async data regions
- [ ] `aria-label` on all icon-only interactive elements
- [ ] Console free of errors and warnings in production build
- [ ] Sentry error tracking integrated (`@sentry/nextjs`)
- [ ] Playwright E2E: login → create block → create task → kanban drag

---

## 11. File Count Summary

| Directory | Key Files |
|---|---|
| `app/(auth)/` | `layout.tsx`, `login/page.tsx`, `signup/page.tsx`, `onboarding/page.tsx` + 3 step files |
| `app/(dashboard)/` | `layout.tsx`, `page.tsx`, `blocks/`, `tasks/`, `settings/` |
| `components/ui/` | Button, Badge, Card, Toaster, Skeleton, Dialog, Select |
| `components/layout/` | AppShell, Sidebar, TopBar, PageHeader |
| `components/map/` | BlockMap, BlockDrawToolbar, BlockPopup |
| `components/blocks/` | BlockCard, BlockForm, BlockList, BlockSeasonHistory |
| `components/tasks/` | TaskCard, TaskKanban, TaskStatusBadge, TaskFilters |
| `components/dashboard/` | StatCard, WeatherWidget, ActivityFeed, WelcomeBanner |
| `components/billing/` | PricingCalculator, SubscriptionStatus, InvoiceHistory |
| `lib/hooks/` | useBlocks, useTasks, useTeamMembers, useTaskTypes, useSSE, useOrg |
| `lib/api/` | client.ts |
| `lib/auth/` | client.ts, server.ts |

---

*End of RanchOS Frontend Implementation Plan (Parts A–E).*
