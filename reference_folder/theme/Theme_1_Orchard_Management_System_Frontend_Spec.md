# OrchardOS — Modern Frontend Product Specification

## Complete Frontend UI/UX Blueprint for a Premium Orchard Management SaaS

**Stack:** Next.js 14 (App Router) · TypeScript · Tailwind CSS · shadcn/ui · Framer Motion · Mapbox GL JS · React Hook Form · i18next  
**Audience:** California orchard operators, ranch managers, field supervisors, office admins, bilingual crews  
**Primary Devices:** Desktop in office, iPad in truck, mobile phone in field  
**Supported Languages:** English and Spanish

---

## 1. Product Direction

OrchardOS should feel like a modern agricultural operating system: polished enough for a premium SaaS product, but rugged enough for real field work. The interface must balance three things at once:

1. **Operational clarity** for task-heavy, map-heavy workflows.
2. **Visual warmth** that reflects orchards, weather, seasons, and field activity.
3. **Fast decision support** for owners and ranch managers who need to scan status in seconds.

This frontend should not look like generic B2B admin software. It should feel distinctly orchard-native: fresh, sunlit, spatial, and trustworthy.

---

## 2. Design Goals

### Core principles

- **Data-dense, not crowded** — show more useful information without making the interface feel heavy.
- **Color with purpose** — color should support hierarchy, status, crop identity, and seasonality.
- **Fast visual scanning** — managers should recognize urgent work, block conditions, and crew activity immediately.
- **Touch-first usability** — large hit targets, sticky actions, strong contrast, tablet-friendly layouts.
- **Bilingual parity** — Spanish experience must feel first-class, not translated as an afterthought.
- **SaaS-grade polish** — smooth motion, clear onboarding, elegant empty states, premium billing/settings screens.

### Emotional tone

- Professional
- Fresh
- Reliable
- Modern
- Calm under pressure

---

## 3. Visual Identity

### Brand personality

The UI should blend:

- **Fresh greens** for crop health and productivity
- **Citrus and gold accents** for energy, alerts, highlights, and pricing moments
- **Sky blues** for irrigation, weather, and live status
- **Neutral stone surfaces** for enterprise readability

### Elevated UI style

Use a hybrid of:

- soft gradients
- layered cards
- glassy overlays only where useful
- crisp borders
- subtle shadows
- large-radius containers
- bold section headers
- compact but breathable spacing

Avoid overusing flat gray admin panels.

---

## 4. Upgraded Color System

This is the biggest visual shift from the original plan: keep agricultural grounding, but make it richer and more premium.

```css
:root {
  /* Brand */
  --brand-green-700: #1f6b43;
  --brand-green-600: #2e8b57;
  --brand-green-500: #43a86b;
  --brand-lime-400:  #84cc16;

  --brand-citrus-600: #f59e0b;
  --brand-citrus-500: #fbbf24;
  --brand-orange-500: #f97316;

  --brand-sky-600: #2563eb;
  --brand-sky-500: #3b82f6;
  --brand-sky-400: #60a5fa;

  --brand-plum-500: #8b5cf6;
  --brand-rose-500: #ef4444;
  --brand-teal-500: #14b8a6;

  /* Neutrals */
  --bg-page:      #f8faf7;
  --bg-surface:   #ffffff;
  --bg-muted:     #f1f5f2;
  --bg-sidebar:   #0f1720;
  --bg-overlay:   rgba(15, 23, 32, 0.55);

  --text-primary:   #102018;
  --text-secondary: #425466;
  --text-muted:     #718096;
  --text-inverse:   #f8fafc;

  --border-soft:   #e5ebe7;
  --border-strong: #cbd5d0;

  /* Status */
  --status-success: #16a34a;
  --status-info:    #2563eb;
  --status-warning: #f59e0b;
  --status-danger:  #dc2626;
  --status-neutral: #6b7280;

  /* Crop categories */
  --crop-almond:   #d97706;
  --crop-citrus:   #f97316;
  --crop-avocado:  #22c55e;
  --crop-grape:    #7c3aed;
  --crop-organic:  #16a34a;

  /* Radius */
  --radius-sm: 8px;
  --radius-md: 12px;
  --radius-lg: 18px;
  --radius-xl: 24px;
  --radius-2xl: 32px;

  /* Shadows */
  --shadow-sm: 0 1px 2px rgba(16, 24, 32, 0.05);
  --shadow-md: 0 8px 24px rgba(16, 24, 32, 0.08);
  --shadow-lg: 0 16px 40px rgba(16, 24, 32, 0.10);
  --shadow-xl: 0 24px 60px rgba(16, 24, 32, 0.14);
}
```

### Gradient guidance

Use gradients sparingly but intentionally.

- **Primary CTA buttons:** green → citrus
- **Hero/dashboard banners:** green → sky → citrus accents
- **Onboarding/auth background glows:** deep green + blue ambient gradients
- **Weather and frost cards:** blue-based gradient surfaces
- **Billing highlight cards:** citrus + gold gradient edge accents

---

## 5. Typography

### Recommended type stack

- **Primary:** Inter
- **Display headings:** Manrope or Cal Sans
- **Monospace / tabular numbers:** JetBrains Mono

### Scale

- Display: 32–40px
- Page title: 28–32px
- Section title: 20–24px
- Card title: 16–18px
- Body: 15–16px
- Label/helper: 12–13px

### Rules

- Use **tabular numerals** for acres, yields, temperatures, invoices, and counts.
- Avoid tiny text in data-heavy cards.
- Use stronger contrast than typical SaaS dashboards because field lighting conditions vary.

---

## 6. Layout Architecture

```text
app/
├── layout.tsx
├── globals.css
├── (auth)/
│   ├── layout.tsx
│   ├── login/page.tsx
│   ├── signup/page.tsx
│   └── onboarding/
│       ├── page.tsx
│       └── steps/
│           ├── OrgStep.tsx
│           ├── RanchStep.tsx
│           └── BlockStep.tsx
└── (dashboard)/
    ├── layout.tsx
    ├── page.tsx
    ├── orchards/page.tsx
    ├── blocks/
    │   ├── page.tsx
    │   ├── new/page.tsx
    │   └── [id]/page.tsx
    ├── tasks/
    │   ├── page.tsx
    │   ├── new/page.tsx
    │   └── [id]/page.tsx
    ├── irrigation/page.tsx
    ├── scouting/page.tsx
    ├── harvest/page.tsx
    ├── compliance/page.tsx
    ├── crew/page.tsx
    └── settings/
        ├── page.tsx
        ├── team/page.tsx
        ├── billing/page.tsx
        └── integrations/page.tsx
```

### Layout pattern

- **Sidebar** for primary module switching
- **Top bar** for search, org switcher, notifications, language, profile
- **Main content** constrained to `max-w-7xl` for readability
- **Sticky page header** where appropriate for map/task workflows
- **Split views** for list + map on larger screens

---

## 7. App Shell

### Sidebar

The sidebar should feel premium and branded, not just dark.

#### Sidebar styling

- Deep charcoal base
- Subtle vertical gradient overlay
- Active nav item uses a **colored pill background**, not just a small border
- Section icons use soft accent colors by module
- Small orchard brand badge in header

#### Suggested nav structure

- Dashboard
- Orchards / Ranches
- Blocks
- Tasks
- Irrigation
- Scouting
- Harvest
- Crew
- Compliance
- Settings

#### Active states

- Background: tinted green/blue surface
- Left indicator: optional 3px glow rail
- Icon and label both brighten
- Smooth 180–220ms transition

### Top bar

- Global search with icon and command-style styling
- Notification bell with count badge
- Language switcher EN/ES
- Weather shortcut or quick conditions chip
- User menu

Add optional quick actions dropdown:

- New task
- Add block
- Log scouting observation
- Create work order

---

## 8. Page-Level Experience

Every main page should follow a predictable, premium structure:

1. **Header** with title, subtitle, and primary action
2. **Summary layer** with KPI cards or filters
3. **Primary workflow area** (table, kanban, map, detail card, form)
4. **Context panel** for alerts, live activity, weather, notes, or history

### Shared page header pattern

- Title
- Optional breadcrumb
- Subheading
- Actions on right
- Optional small context chips below:
  - Organic only
  - Frost alert
  - Crew online
  - 3 overdue tasks

---

## 9. Dashboard Redesign

The dashboard should look more premium and visual than the original implementation plan while keeping the same operational structure.

### Recommended dashboard sections

#### 1. Welcome banner

Large, elegant hero at top:

- “Good morning, Maria”
- Orchard summary line: acreage, active crews, weather snapshot
- Subtle gradient background
- Optional illustration or abstract map pattern

CTA buttons:

- Create task
- View blocks
- Invite team

#### 2. KPI row

Four to six stat cards with stronger visual treatment:

- Active tasks
- Urgent tasks
- Total blocks
- Organic acres
- Crew checked in
- Watering scheduled today

#### 3. Weather + Frost Intelligence card

This should be a standout module.

Include:

- large current condition icon
- max/min temps
- precipitation forecast
- frost risk ribbon
- irrigation recommendation stub

#### 4. Map snapshot

Mini satellite map with color-coded block overlays.

#### 5. Active tasks summary

- today
- overdue
- high priority
- recently completed

#### 6. Live activity feed

Event stream with icons and relative timestamps.

### KPI card style guidance

- Use icon badges with gradient surfaces
- Add a small trend indicator
- Use colored top glow or border tint instead of heavy borders
- Keep numbers large and tabular

---

## 10. Blocks / Orchard Map Experience

This is one of the defining features of the app and should feel spatial, premium, and highly interactive.

### Blocks page layout

**Desktop:** split screen  
- Left: filters + block list/table  
- Right: interactive satellite map

**Tablet:** stacked layout with sticky filter row  
**Mobile:** cards first, map optional toggle

### Filters

- Ranch
- Crop type
- Variety
- Organic only
- Status
- Acreage range
- Search by block name

### Map styling best practices

- Satellite base map for field realism
- Polygon fills tinted by crop type
- Strong outline on selected block
- Hover state with softened glow
- Organic blocks get a subtle leaf badge or stripe pattern

### Block popup content

- Block name
- Crop + variety
- Acreage
- Organic status
- Open tasks count
- Last irrigated
- Quick actions:
  - Open details
  - Create task
  - View history

### Block detail page

Should feel like a premium operations profile.

Sections:

- Overview card
- Map preview
- Season history
- Yield chart
- Task timeline
- Irrigation events
- Notes / attachments

---

## 11. Task Management Experience

Keep the kanban foundation from the original files, but improve the visual hierarchy and modernity.

### Tasks page

Modes:

- Kanban (default)
- List
- Calendar (Phase 2)

### Kanban improvements

- Softer board background
- Stronger colored column headers
- Sticky column counts
- Cleaner drag affordances
- Richer task cards with icons, chips, and avatars

### Task columns

- Pending
- In Progress
- Completed
- Overdue

### Task card content

- Task type icon
- Title
- Block chip
- Due date chip
- Priority chip
- Assignees
- Optional weather/frost tag if relevant

### Priority colors

- Low: gray
- Normal: blue
- High: amber
- Urgent: red

### Task form

Required fields:

- Title
- Task type
- Description
- Due date
- Priority
- Block(s)
- Assignee(s)

Enhanced UX:

- searchable selects
- suggested task templates
- inline validation
- sticky submit bar on mobile

---

## 12. Auth and Onboarding

The original auth direction is solid. Upgrade it into a more premium SaaS entry point.

### Auth pages

#### Visual treatment

- dark gradient background
- blurred orchard-color ambient glows
- centered glass card
- strong brand mark
- benefit bullets on larger screens

#### Login card content

- headline
- short supporting text
- email/password form
- forgot password
- remember me
- SSO placeholder if needed later

### Onboarding wizard

Use a **3-step progressive flow**:

1. Organization setup
2. Ranch / orchard setup
3. First blocks

#### Step 1: Organization

Fields:

- Company name
- County / region
- Preferred language
- Organic operation toggle

#### Step 2: Orchard / ranch details

Fields:

- Ranch name
- Address
- Total acres
- Crop mix

Enhancement:

- Live pricing preview on the same screen

#### Step 3: Add first blocks

Two large cards:

- Draw on map
- Enter manually

Small skip option:

- “I’ll add blocks later”

### Post-onboarding welcome banner

After first login:

- celebratory message
- add first block
- invite crew
- create first task

---

## 13. Billing and Settings

These pages are often weak in internal tools; here they should feel like a real SaaS product.

### Settings IA

Tabs:

- General
- Team
- Billing
- Integrations
- Notifications
- Security

### Billing page

#### Subscription status card

- Plan name
- Status badge
- Renewal date
- Monthly total
- Manage billing button
- Upgrade CTA

#### Pricing calculator

- acreage slider
- seat count control
- three plan cards
- annual discount preview

#### Invoice history

- invoice number
- date
- amount
- status
- PDF download

### Team page

- invite member modal
- role badge
- language preference
- mobile sync status
- last active
- resend invite
- deactivate member

---

## 14. UI Components

### Must-have primitives

- Button
- Input
- Textarea
- Select
- Multi-select
- Badge
- Card
- Dialog
- Drawer
- Tabs
- Tooltip
- Toast
- Skeleton
- EmptyState
- DataTable
- DatePicker
- Command menu

### Component style guidance

#### Buttons

Variants:

- Primary
- Secondary
- Ghost
- Destructive
- Success

Primary button should feel branded:

- green/citrus gradient
- soft shadow
- hover lift
- active press state

#### Cards

- large radius
- low-contrast border
- subtle shadow
- optional gradient edge or icon badge

#### Badges

Use semantic colors with dot or icon option.

#### Empty states

Every empty state should feel intentional, not blank.

Example:

- Illustration or icon
- Clear message
- One strong CTA
- Optional secondary action

---

## 15. Motion and Interaction

Motion should communicate quality, not draw attention to itself.

### Use Framer Motion for

- sidebar collapse/expand
- card entrance fades
- onboarding step transitions
- modal/drawer transitions
- KPI card hover lift
- map/list synchronized emphasis

### Timing

- 120–180ms for hover/focus
- 180–240ms for page UI transitions
- 250–320ms for drawers/modals

### Motion rules

- no bounce-heavy consumer animations
- no slow page transitions
- always respect `prefers-reduced-motion`

---

## 16. Responsive Behavior

### Mobile (<768px)

- sidebar becomes slide-over drawer
- top bar simplified
- cards stack vertically
- map becomes tab/toggle
- primary action sticky at bottom when useful

### Tablet (768–1024px)

- collapsed sidebar
- two-column grids
- sticky filter bars
- full kanban becomes horizontally scrollable

### Desktop (>1024px)

- full sidebar
- split map/list layouts
- multi-panel dashboard

### Wide desktop (>1280px)

- cap content width to maintain readability
- avoid over-stretched charts and tables

---

## 17. Accessibility

Keep the original accessibility requirements and apply them rigorously.

### Standards

- WCAG 2.1 AA minimum
- strong contrast on all critical actions
- keyboard access for all dialogs, dropdowns, tabs, and kanban interactions
- visible focus rings everywhere
- labels and helper text connected with `aria-describedby`
- status never conveyed by color alone
- screen reader labels on icon-only controls

### Field conditions matter

This app will be used in bright environments. Favor stronger contrast and slightly larger typography than many SaaS dashboards.

---

## 18. Internationalization

The original files correctly prioritize English and Spanish parity. Keep that approach.

### Requirements

- all UI strings come from `t('key')`
- identical key coverage in `en` and `es`
- language persisted in local storage
- onboarding language switch applies instantly
- role labels, statuses, and system messages are localized
- date/time and number formatting respect locale

### Bilingual UX notes

- allow wider buttons/labels for Spanish expansion
- avoid fixed-width controls that clip translated strings
- make field instructions concise in both languages

---

## 19. Recommended Tech Decisions

### Frontend stack

- **Next.js 14 App Router**
- **TypeScript strict mode**
- **Tailwind CSS**
- **shadcn/ui** for solid primitives
- **Framer Motion** for motion
- **Mapbox GL JS / react-map-gl** for block mapping
- **React Hook Form + Zod** for forms
- **SWR or TanStack Query** for data fetching
- **Sonner** for toasts
- **i18next** for localization
- **Sentry** for error tracking
- **Playwright** for E2E testing

### Recommended package areas

- auth client/server helpers
- typed API client
- reusable formatters
- domain hooks (`useBlocks`, `useTasks`, `useTeamMembers`, `useWeather`)
- design tokens in CSS variables

---

## 20. Example Component Direction

### Premium stat card

```tsx
<Card className="group rounded-2xl border border-[var(--border-soft)] bg-white shadow-sm hover:shadow-lg transition-all duration-200">
  <CardContent className="p-5">
    <div className="flex items-start justify-between gap-4">
      <div>
        <p className="text-sm text-[var(--text-secondary)]">Active Tasks</p>
        <p className="mt-2 text-3xl font-bold tabular-nums text-[var(--text-primary)]">18</p>
        <p className="mt-2 text-xs text-amber-600 font-medium">+12% vs last week</p>
      </div>
      <div className="rounded-2xl bg-gradient-to-br from-green-500 to-sky-500 p-3 text-white shadow-md group-hover:scale-105 transition-transform">
        <ClipboardList className="h-5 w-5" />
      </div>
    </div>
  </CardContent>
</Card>
```

### Premium primary button

```tsx
<Button className="rounded-xl bg-gradient-to-r from-[var(--brand-green-600)] to-[var(--brand-citrus-500)] text-white shadow-md hover:shadow-lg hover:-translate-y-0.5 active:translate-y-0 transition-all">
  Create Task
</Button>
```

---

## 21. Suggested Module Visual Language

To make the app feel richer and more intuitive, give each major module a light visual identity.

- **Dashboard:** green + sky
- **Blocks / Map:** amber + green
- **Tasks:** sky + blue
- **Irrigation:** blue + teal
- **Scouting:** lime + green
- **Harvest:** amber + orange
- **Compliance:** slate + red accents
- **Billing:** gold + plum accents

This should be subtle, mainly through icon surfaces, badges, chart highlights, and empty-state illustrations.

---

## 22. Empty States and Error States

### Empty states should include

- concise message
- quick explanation
- one primary CTA
- optional illustration

Examples:

- “No blocks yet” → Add your first block
- “No tasks due today” → Create task
- “No invoices yet” → Billing becomes active after your first payment

### Error states

- friendly message
- retry button
- preserve context when possible
- avoid raw technical language for end users

---

## 23. Frontend Implementation Checklist

### Foundation

- [ ] CSS variables added to `globals.css`
- [ ] Tailwind theme extended with brand tokens
- [ ] Typography system defined
- [ ] Dark mode tokens created
- [ ] Motion tokens standardized

### Layout

- [ ] Sidebar built with desktop + mobile drawer modes
- [ ] Top bar includes search, language switcher, notifications, profile
- [ ] Shared page header component created
- [ ] `max-w-7xl` content containers applied consistently

### Dashboard

- [ ] Welcome hero banner implemented
- [ ] KPI cards use premium card styling
- [ ] Weather / frost card implemented
- [ ] Live activity feed connected
- [ ] Mini block map added

### Blocks

- [ ] Split map/list layout complete
- [ ] Crop-colored polygons implemented
- [ ] Block popup actions implemented
- [ ] Block detail page includes season history and stats

### Tasks

- [ ] Kanban board implemented
- [ ] List toggle implemented
- [ ] Task cards support assignees, due status, priority, block chips
- [ ] Create task form uses RHF + validation

### Auth and onboarding

- [ ] Login/signup pages styled with premium dark gradient layout
- [ ] Onboarding wizard complete
- [ ] Live pricing preview included
- [ ] Post-onboarding welcome banner implemented

### Settings and billing

- [ ] Team page built
- [ ] Billing status card built
- [ ] Pricing calculator built
- [ ] Invoice history table added

### Quality

- [ ] All icon-only buttons have labels
- [ ] Visible focus states everywhere
- [ ] English and Spanish keys complete
- [ ] Skeletons for all async panels
- [ ] Sentry integrated
- [ ] Playwright flow covers login → create block → create task → update task status

---

## 24. Final Recommendation

The original RanchOS frontend plan already had a strong functional structure. For OrchardOS, the main opportunity is **not** changing the architecture — it is **raising the product feel**.

The best version of this frontend is:

- spatial and map-forward
- more colorful without looking playful
- premium like a real SaaS product
- faster to scan in the field
- elegant in onboarding and billing
- deeply practical in tasks and block operations

In other words: keep the operational backbone, but upgrade the presentation into a branded orchard platform that feels modern, valuable, and ready to sell.

---

## 25. Naming Notes

If you want to fully re-theme this from the original RanchOS framing, use consistent orchard language throughout the UI.

### Recommended naming swaps

- RanchOS → OrchardOS
- Ranches → Orchards or Properties
- Blocks → Orchard Blocks
- Crew Active → Field Crew Online
- Active Tasks → Open Work Orders
- Frost Alert → Frost Risk
- Irrigation → Watering / Irrigation
- Scouting → Crop Scouting

This will make the product feel more specific to your market.

