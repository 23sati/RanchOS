# Orchid Management System - Frontend Product Specification

## Complete UI/UX Blueprint for a Modern Orchid Operations SaaS

**Product:** Orchid Management System  
**Platform:** Web app  
**Users:** Owners, operations managers, field supervisors, office admins, bilingual crews  
**Primary Devices:** Desktop in office, tablet in truck, phone in field  
**Languages:** English and Spanish  
**Recommended Stack:** Next.js App Router, TypeScript, Tailwind CSS, shadcn/ui, Framer Motion, React Hook Form, Zod, i18next, Mapbox GL

---

## 1. Product Direction

Orchid Management System should feel like a premium operations platform built for real agricultural work: fast, spatial, polished, and dependable. The UI needs to be more colorful and modern than a typical admin dashboard, while still staying serious enough for billing, compliance, irrigation, crop planning, and daily field execution.

The product should not look like a generic SaaS template with agriculture labels pasted on top. It should feel distinctly tied to orchards and field operations through color, layout, mapping, data visualization, and task workflows.

### Product goals

- Help managers understand orchard status in seconds
- Make map-based block management feel central, not secondary
- Keep tasks, irrigation, scouting, and crew workflows easy on mobile and tablet
- Deliver SaaS-grade polish in onboarding, settings, billing, and team management
- Maintain strong bilingual parity across the entire experience

### Visual tone

- Professional
- Fresh
- Calm
- Confident
- Field-ready
- Premium but practical

---

## 2. Design Principles

### Core principles

- Data-dense, not crowded
- Color used with purpose, not decoration
- Strong hierarchy for fast scanning
- Touch-friendly interactions by default
- Clear status language across every module
- Consistent empty, loading, and error states
- Modern motion with restraint
- Accessibility treated as a product requirement

### UX rules

- Prioritize quick action over deep navigation
- Keep primary CTAs visible and predictable
- Show the most important metrics above the fold
- Favor split views for map and operations workflows on desktop
- Always provide a manual fallback for map- or automation-heavy flows
- Do not rely on color alone to communicate status

---

## 3. Brand and Visual Identity

The visual identity should balance orchard realism with modern SaaS polish.

### Brand language

- Greens represent health, operations, and success
- Citrus and gold represent urgency, highlights, pricing, and active work
- Sky and teal represent irrigation, weather, and live status
- Stone and slate neutrals keep dense data readable

### Look and feel

- Soft gradients instead of flat surfaces
- Rounded cards with crisp borders
- Subtle depth through layered shadows
- Rich icon treatments with tinted backgrounds
- Occasional glass or blur effects only in auth, onboarding, and overlays
- High-contrast typography for outdoor readability

Avoid:

- Flat gray enterprise panels everywhere
- Purple-heavy default SaaS styling
- Overly playful illustrations
- Thin contrast or tiny text

---

## 4. Color System

This system should feel warmer and more premium than the original RanchOS palette while staying grounded in orchard operations.

```css
:root {
  /* Brand */
  --orchid-green-700: #1f6b43;
  --orchid-green-600: #2f8a57;
  --orchid-green-500: #44a86c;
  --orchid-lime-400:  #84cc16;

  --orchid-gold-600:  #d9911a;
  --orchid-gold-500:  #f4b942;
  --orchid-orange-500:#f97316;

  --orchid-sky-600:   #2563eb;
  --orchid-sky-500:   #3b82f6;
  --orchid-teal-500:  #14b8a6;

  --orchid-rose-500:  #ef4444;
  --orchid-slate-900: #0f1720;
  --orchid-stone-900: #172018;

  /* Surfaces */
  --bg-page:          #f7faf6;
  --bg-page-alt:      #eef4ee;
  --bg-card:          #ffffff;
  --bg-muted:         #f2f6f2;
  --bg-sidebar:       #0f1720;
  --bg-sidebar-alt:   #15202b;
  --bg-overlay:       rgba(15, 23, 32, 0.58);

  /* Text */
  --text-primary:     #132117;
  --text-secondary:   #425466;
  --text-muted:       #6b7a6f;
  --text-inverse:     #f8fafc;

  /* Borders */
  --border-soft:      #e2e8e2;
  --border-strong:    #c7d0c8;

  /* Status */
  --status-success:   #16a34a;
  --status-info:      #2563eb;
  --status-warning:   #f59e0b;
  --status-danger:    #dc2626;
  --status-neutral:   #6b7280;

  /* Module accents */
  --accent-dashboard: #2f8a57;
  --accent-blocks:    #d9911a;
  --accent-tasks:     #3b82f6;
  --accent-irrigation:#14b8a6;
  --accent-scouting:  #65a30d;
  --accent-harvest:   #f97316;
  --accent-compliance:#ef4444;
  --accent-billing:   #c084fc;

  /* Radius */
  --radius-sm: 8px;
  --radius-md: 12px;
  --radius-lg: 18px;
  --radius-xl: 24px;
  --radius-2xl: 32px;

  /* Shadows */
  --shadow-sm: 0 1px 2px rgba(16, 24, 32, 0.05);
  --shadow-md: 0 10px 30px rgba(16, 24, 32, 0.08);
  --shadow-lg: 0 18px 44px rgba(16, 24, 32, 0.10);
  --shadow-xl: 0 28px 70px rgba(16, 24, 32, 0.14);
}
```

### Gradient usage

- Primary CTA: green to gold
- Dashboard hero: green to sky with a soft gold highlight
- Weather and irrigation cards: sky to teal
- Billing highlights: gold to plum accent edge
- Auth and onboarding background: dark slate with green and sky ambient glows

---

## 5. Typography

### Recommended type system

- Primary UI: `Inter`
- Display headings: `Manrope` or `Cal Sans`
- Numeric and code surfaces: `JetBrains Mono`

### Scale

- Display: 36 to 44px
- Page title: 28 to 32px
- Section title: 20 to 24px
- Card title: 16 to 18px
- Body: 15 to 16px
- Label and helper: 12 to 13px

### Rules

- Use tabular numerals for acreage, yield, weather, billing, counts, and task metrics
- Minimum comfortable text size is more important than compactness
- Favor slightly stronger weight and contrast than average SaaS dashboards

---

## 6. Design Tokens and Component Standards

### Spacing

- Base grid: 4px
- Standard card padding: 20 to 24px
- Section spacing: 24 to 32px
- Page spacing: 24px mobile, 32px tablet, 40px desktop

### Buttons

Required variants:

- Primary
- Secondary
- Ghost
- Destructive
- Success

Primary buttons should feel branded:

- green to gold gradient
- white label
- subtle lift on hover
- clear pressed state
- large tap target

### Cards

- Large radius
- Soft border
- Low-noise shadow
- Strong header/body separation when needed
- Optional tinted icon badge or top glow

### Inputs

- Rounded large enough for touch use
- Clear focus ring
- Consistent helper and error messaging
- Enough horizontal padding for tablet use

### Badges

- Status badges always include text
- Priority badges should remain compact but bold
- Organic badge should feel distinct and premium, not loud

### Tables

- Sticky header where useful
- Row hover surface
- Visible zebra or subtle separators
- Action column pinned on wide layouts when necessary

---

## 7. Information Architecture

```text
app/
|-- layout.tsx
|-- globals.css
|-- (auth)/
|   |-- layout.tsx
|   |-- login/page.tsx
|   |-- signup/page.tsx
|   `-- onboarding/
|       |-- page.tsx
|       `-- steps/
|           |-- OrganizationStep.tsx
|           |-- RanchStep.tsx
|           `-- BlockStep.tsx
`-- (dashboard)/
    |-- layout.tsx
    |-- page.tsx
    |-- blocks/
    |   |-- page.tsx
    |   |-- new/page.tsx
    |   `-- [id]/page.tsx
    |-- tasks/
    |   |-- page.tsx
    |   |-- new/page.tsx
    |   `-- [id]/page.tsx
    |-- irrigation/page.tsx
    |-- scouting/page.tsx
    |-- harvest/page.tsx
    |-- compliance/page.tsx
    |-- crew/page.tsx
    `-- settings/
        |-- page.tsx
        |-- team/page.tsx
        |-- billing/page.tsx
        |-- integrations/page.tsx
        |-- notifications/page.tsx
        `-- security/page.tsx
```

### Primary navigation

- Dashboard
- Blocks
- Tasks
- Irrigation
- Scouting
- Harvest
- Crew
- Compliance
- Settings

---

## 8. App Shell

### Sidebar

The sidebar should feel branded and premium, not like a default dark admin rail.

#### Sidebar behavior

- Desktop: full-height persistent sidebar
- Tablet: collapsed icon-first sidebar
- Mobile: slide-over drawer with backdrop

#### Sidebar styling

- Deep charcoal to slate gradient background
- Slight surface tint behind active items
- Active item uses a rounded pill with bright icon and label
- Subtle left glow rail optional
- Brand mark at top with orchard-inspired badge

### Top bar

The top bar should support speed and orientation.

Include:

- Global search
- Quick actions menu
- Notifications
- Language switcher
- Optional weather shortcut chip
- User menu

Quick actions:

- New task
- Add block
- Log scouting note
- Start irrigation event

### Shared page header

Each major page should include:

- Title
- Subtitle
- Optional breadcrumb
- Primary action
- Optional context chips for alerts or filters

---

## 9. Dashboard Experience

The dashboard should be more visual and modern than the original spec, but preserve operational clarity.

### Recommended dashboard structure

#### 1. Welcome hero

Large banner at top with:

- Personalized greeting
- Orchard summary line
- Weather and work snapshot
- Two or three fast actions

Suggested CTAs:

- Create task
- View blocks
- Invite team

#### 2. KPI row

Core cards:

- Open work orders
- Urgent tasks
- Total blocks
- Organic acres
- Crew online
- Irrigation scheduled today

#### 3. Weather and frost intelligence

Make this a standout card with:

- Large condition icon
- High and low temperatures
- Precipitation
- Frost risk banner
- Small irrigation recommendation

#### 4. Mini map

- Satellite preview
- Color-coded blocks
- Selected block emphasis
- Optional quick drill-down

#### 5. Active work summary

- Due today
- Overdue
- High priority
- Recently completed

#### 6. Live activity feed

- Task created
- Task completed
- Sync event
- Crew check-in
- Block updated

### KPI card treatment

- Strong icon badge
- Large number
- Trend or change note
- Tinted border or glow instead of heavy card chrome

---

## 10. Blocks and Map Experience

This is one of the defining surfaces of the product. It should feel spatial, premium, and action-oriented.

### Blocks page layout

- Desktop: split view with filters and block list on the left, map on the right
- Tablet: stacked layout with sticky controls
- Mobile: list-first layout with map toggle

### Filters

- Ranch or orchard
- Crop type
- Variety
- Organic only
- Status
- Acreage range
- Search by block name

### Map best practices

- Satellite base map
- Polygon fills by crop type
- Strong selected state
- Hover state with clear feedback
- Organic blocks receive stripe, badge, or secondary border treatment
- Labels appear only at useful zoom levels

### Block popup

Show:

- Block name
- Crop and variety
- Acreage
- Organic status
- Open tasks
- Last irrigated
- Quick actions

Quick actions:

- Open details
- Create task
- View history

### Block detail page

Recommended sections:

- Header with status badges
- Overview stats
- Map preview
- Season history chart
- Yield history
- Open task list
- Irrigation events
- Notes and attachments

### Block creation

Provide two equal paths:

- Draw on map
- Enter manually

Requirements:

- Area auto-calculated when polygon is drawn
- Manual entry always available as fallback
- Organic toggle expands additional fields
- Water and parcel fields available but not overwhelming

---

## 11. Task Management Experience

Task management should keep the kanban foundation from the RanchOS docs, but the visual system should feel cleaner and more current.

### Views

- Kanban default
- List secondary
- Calendar planned for later phase

### Task columns

- Pending
- In Progress
- Completed
- Overdue

### Kanban improvements

- Softer board background
- Better column headers with counts
- Strong drag feedback
- Card hover depth
- Sticky column headings where possible

### Task card content

- Task type icon
- Title
- Block chip
- Due date chip
- Priority badge
- Assignee avatars
- Optional weather or frost context

### Priority system

- Low: neutral
- Normal: blue
- High: amber
- Urgent: red

### Task form best practices

- Searchable selects for block and assignee
- Visual task type picker
- Inline validation
- Clear due date handling
- Sticky mobile action bar
- Save draft if form complexity increases later

### Task detail page

Recommended sections:

- Status controls
- Overview grid
- Assigned blocks
- Assignees
- Completion evidence
- Notes
- Activity log

---

## 12. Auth and Onboarding

Auth and onboarding should feel like a premium SaaS product, not a placeholder gateway.

### Auth layout

- Dark gradient background
- Green and sky ambient glow shapes
- Centered glass card
- Strong brand mark
- Optional trust and value bullets on large screens

### Login page

Include:

- Welcome headline
- Supporting copy
- Email and password fields
- Forgot password
- Remember me
- Trial or signup CTA

### Signup page

Include:

- Full name
- Email
- Password
- Trial terms
- Redirect into onboarding

### Onboarding flow

Three steps:

1. Organization setup  
2. Ranch setup  
3. First block setup

#### Step 1

- Company or ranch name
- County or region
- Preferred language
- Primary crop mix
- Organic operation toggle

#### Step 2

- Ranch name
- Address
- Total acres
- Optional pricing preview

#### Step 3

- Draw on map
- Enter manually
- Skip for later

### Post-onboarding welcome banner

After onboarding, show:

- Welcome message
- Add first block
- Invite crew
- Create first task

---

## 13. Irrigation, Scouting, Harvest, and Compliance

These modules should have distinct but related visual identities.

### Irrigation

- Blue and teal accents
- Timeline or schedule-first layout
- Weather tie-in
- Block-level irrigation history

### Scouting

- Lime and green accents
- Image-forward cards
- Pest, disease, and observation tagging
- Strong mobile capture workflow

### Harvest

- Amber and orange accents
- Yield tracking
- Season summaries
- Block and ranch rollups

### Compliance

- Slate base with red and amber alerts
- Deadline-centered widgets
- Expiring items, missing records, and acknowledgment states

---

## 14. Settings and Billing

These pages should feel as polished as the core operations pages.

### Settings navigation

Tabs:

- General
- Team
- Billing
- Integrations
- Notifications
- Security

### Team page

Key sections:

- Invite member flow
- Members table
- Pending invites
- Role badges
- Language preference
- Last active
- Mobile sync status

### Billing page

Key surfaces:

- Subscription status card
- Plan summary
- Pricing calculator
- Invoice history
- Manage billing link

### Billing styling

- Use a more premium accent treatment than neutral settings pages
- Gold and plum accents should feel elevated, not flashy
- Price numbers should be large and tabular

---

## 15. Motion and Interaction

Motion should communicate quality and hierarchy without slowing the app down.

### Use motion for

- Sidebar collapse and expand
- Card entrance
- Onboarding step transitions
- Dialog and drawer open/close
- Filter chips
- List and map synchronized emphasis

### Timing guidance

- Hover and focus: 120 to 180ms
- Standard UI transition: 180 to 240ms
- Drawer or modal: 250 to 320ms

### Rules

- No heavy bounce
- No long page transitions
- Respect `prefers-reduced-motion`
- Motion should clarify state changes, not decorate everything

---

## 16. Responsive Behavior

### Mobile under 768px

- Sidebar becomes drawer
- Top bar is simplified
- Cards stack vertically
- Map becomes toggle or secondary tab
- Sticky primary action allowed on create flows

### Tablet 768px to 1024px

- Sidebar collapses
- Two-column grids where useful
- Filter rows become sticky
- Kanban can scroll horizontally

### Desktop above 1024px

- Full sidebar
- Split views for operations
- Multi-panel dashboard

### Wide desktop above 1280px

- Constrain content with `max-w-7xl`
- Avoid over-stretched charts and tables

---

## 17. Accessibility and Usability

### Standards

- WCAG 2.1 AA minimum
- Keyboard access for all major controls
- Visible focus rings
- Strong contrast in bright field conditions
- Errors tied to fields with `aria-describedby`
- Icon-only buttons always labeled
- Status never conveyed by color alone

### Field-specific usability rules

- Large tap targets
- Outdoor-friendly contrast
- Readable data cards at a glance
- Limited precision required for frequent mobile inputs

---

## 18. Internationalization

English and Spanish must feel equally supported.

### Requirements

- All UI strings come from localization keys
- Every key exists in both locales
- Language persists across sessions
- Onboarding language switch applies immediately
- Date, time, and number formatting respect locale
- Spanish expansion is considered in control sizing

### Translation best practices

- Use concise but natural phrasing
- Avoid text that becomes too wide for pills or buttons
- Keep status names and action labels consistent across modules

---

## 19. Empty, Loading, and Error States

### Empty states

Every empty state should include:

- Clear message
- Short explanation
- One primary CTA
- Optional secondary action

Examples:

- No blocks yet
- No tasks due today
- No invoices yet
- No scouting notes this week

### Loading states

- Use skeletons, not spinners alone
- Preserve layout while content loads
- Mark loading regions with `aria-busy`

### Error states

- Friendly message
- Retry action
- Keep user context when possible
- Avoid raw technical errors in user-facing language

---

## 20. Recommended Frontend Architecture

### Core technologies

- Next.js App Router
- TypeScript strict mode
- Tailwind CSS
- shadcn/ui
- Framer Motion
- React Hook Form and Zod
- Mapbox GL and react-map-gl
- SWR or TanStack Query
- Sonner
- i18next
- Sentry
- Playwright

### Shared frontend utilities

- Typed API client
- `cn()` class merge helper
- Formatters for acreage, currency, weather, dates
- Domain hooks such as `useBlocks`, `useTasks`, `useTeamMembers`, `useWeather`
- Design tokens in CSS custom properties

---

## 21. Module Visual Language

Give each major area a subtle identity so the app feels richer and easier to scan.

- Dashboard: green and sky
- Blocks: gold and green
- Tasks: sky blue
- Irrigation: sky and teal
- Scouting: lime and green
- Harvest: orange and gold
- Compliance: slate with red accents
- Billing: gold with plum accents

This should primarily appear through:

- Icon badges
- Small gradients
- Chart highlights
- Empty state illustrations
- Status chips

---

## 22. Page-by-Page Implementation Priorities

### Phase 1

- App shell
- Dashboard
- Blocks list and map
- Block create and detail
- Tasks kanban and create flow
- Login, signup, onboarding

### Phase 2

- Irrigation module
- Scouting module
- Calendar task view
- More advanced weather intelligence

### Phase 3

- Harvest workflows
- Compliance workflows
- Expanded crew management
- Deeper analytics

---

## 23. Build Checklist

### Foundation

- [ ] CSS variables added to global styles
- [ ] Tailwind theme extended with tokens
- [ ] Typography system defined
- [ ] Motion rules standardized
- [ ] Dark mode strategy decided and implemented

### Layout

- [ ] Desktop sidebar built
- [ ] Mobile drawer built
- [ ] Top bar includes search, quick actions, notifications, language, profile
- [ ] Shared page header built

### Dashboard

- [ ] Welcome hero implemented
- [ ] KPI cards implemented
- [ ] Weather and frost card implemented
- [ ] Live activity feed connected
- [ ] Mini map added

### Blocks

- [ ] Split list and map layout complete
- [ ] Crop-colored polygons implemented
- [ ] Block popup actions implemented
- [ ] Block form supports draw and manual entry
- [ ] Block detail includes history and tasks

### Tasks

- [ ] Kanban implemented
- [ ] List view implemented
- [ ] Task card hierarchy polished
- [ ] Task create flow validated with RHF and Zod

### Auth and onboarding

- [ ] Premium auth pages complete
- [ ] Three-step onboarding complete
- [ ] Pricing preview added if required
- [ ] Welcome banner shown after setup

### Settings and billing

- [ ] Team page built
- [ ] Billing status card built
- [ ] Pricing calculator built
- [ ] Invoice history built

### Quality

- [ ] Accessibility pass complete
- [ ] English and Spanish coverage complete
- [ ] Skeleton states added
- [ ] Error boundaries added
- [ ] Sentry integrated
- [ ] Playwright flow covers login to block creation to task update

---

## 24. Final Recommendation

The RanchOS A-E docs already provide a solid operational backbone. The right move for Orchid Management System is to keep that structure, but elevate the product feel significantly through better visual hierarchy, stronger color usage, richer mapping surfaces, polished onboarding, and a more premium SaaS treatment for settings and billing.

The best final direction is:

- map-forward
- colorful but controlled
- premium without looking generic
- fast to scan in the field
- strong on mobile and tablet
- consistent across operations and SaaS account surfaces

This should feel like a serious orchard platform that is both sellable and highly usable.

---

## 25. Naming Guidance

Use consistent orchid and orchard operations language across the UI.

Preferred labels:

- Orchid Management System
- Orchard Blocks
- Open Work Orders
- Field Crew Online
- Frost Risk
- Irrigation
- Crop Scouting
- Harvest Summary
- Compliance Tasks

If the product brand is shortened in the UI, use `Orchid` consistently rather than mixing product names.
