# OrchardOS — Dark Modern Frontend Product Specification

## Premium Dark-Mode Agricultural SaaS with Contemporary Minimalism

**Product:** OrchardOS  
**Platform:** Web app (dark-first design)  
**Users:** Owners, operations managers, field supervisors, office admins, bilingual crews  
**Primary Devices:** Desktop in office, tablet in truck, phone in field  
**Languages:** English and Spanish  
**Recommended Stack:** Next.js App Router, TypeScript, Tailwind CSS, shadcn/ui, Framer Motion, React Hook Form, Zod, i18next, Mapbox GL

---

## 1. Product Direction

OrchardOS Dark Modern is built for field teams who work in daylight and manage operations from trucks, sheds, and offices at dusk. The interface prioritizes **minimal visual noise, high contrast legibility, and thoughtful use of color** rather than colorful dashboard abundance.

This theme combines:
- **Dark-first interface** optimized for outdoor readability and reduced eye strain
- **Extreme minimalism** — only essential elements on screen, heavy use of whitespace and negative space
- **Warm neutrals** with strategic color accents for status and action
- **Contemporary tech aesthetic** — feels like a modern fintech or productivity app, not generic agriculture software

The product should feel calm, focused, and premium—like tools built for professionals who demand clarity.

### Product goals

- Help managers scan critical status in extreme sunlight and darkness
- Create an interface that feels modern and design-forward, not agricultural
- Keep interactions fast and deliberate—no unnecessary visuals
- Maintain accessibility across high-contrast field conditions
- Deliver premium SaaS experience across all workflows

### Visual tone

- Calm
- Minimal
- Modern
- Trustworthy
- Professional
- Contemporary

---

## 2. Design Principles

### Core principles

- **Extreme data minimalism** — show only the most critical information per view
- **Generous whitespace and breathing room** — reduce cognitive load
- **High contrast for readability** — works in harsh sunlight and dim conditions
- **Color is reserved for status and action** — never decorative
- **Typography as visual hierarchy** — use size and weight, not color
- **Subtle refinement** — micro-interactions that feel inevitable, not magical
- **Dark mode as primary** — light mode is secondary
- **Accessibility is non-negotiable** — WCAG AAA in dark mode

### UX rules

- One primary action per page
- Secondary actions grouped in a menu or sidebar
- Loading and empty states as first-class citizens
- Motion only where it clarifies state change
- Keyboard-first interaction model
- No modals unless absolutely necessary—use drawers instead

---

## 3. Visual Identity

### Brand language

- **Deep charcoal and slate** — the foundation, calm and approachable
- **Warm off-whites and creams** — text and surfaces that feel natural
- **Soft greens and teals** — system health, success, growth
- **Subtle golds and bronzes** — important highlights and premium moments
- **Warm grays** — neutral UI, not cold
- **Minimal red** — only for destructive actions and critical alerts

### Look and feel

- Flat, no gradients
- Crisp borders, not soft shadows
- Large rounded corners (16–24px)
- Generous padding and spacing (24–32px minimum)
- Clean typography with high contrast
- Status conveyed through icon + text, never color alone
- Occasional subtle texture or pattern, never overwhelming

Avoid:

- Bright colors for non-status elements
- Small or dense data tables
- Hover effects that clutter the interface
- Skeuomorphism or depth effects
- Playful or decorative illustrations
- Busy backgrounds or gradients

---

## 4. Color System

Dark-first palette with warm neutrals and strategic accents.

```css
:root {
  /* Grays and Neutrals */
  --neutral-950: #0a0a0a;
  --neutral-900: #1a1a1a;
  --neutral-850: #262626;
  --neutral-800: #333333;
  --neutral-700: #4a4a4a;
  --neutral-600: #666666;
  --neutral-500: #808080;
  --neutral-400: #999999;
  --neutral-300: #b3b3b3;
  --neutral-200: #cccccc;
  --neutral-100: #e6e6e6;
  --neutral-50:  #f5f5f5;

  /* Warm Surfaces */
  --surface-primary:    #0f0f0f;
  --surface-secondary:  #1c1c1c;
  --surface-tertiary:   #2a2a2a;
  --surface-highlight:  #fafaf8;

  /* Text */
  --text-primary:       #f5f5f3;
  --text-secondary:     #cccccc;
  --text-muted:         #999999;
  --text-inverse:       #0a0a0a;

  /* Borders */
  --border-subtle:      #333333;
  --border-strong:      #4a4a4a;

  /* Status Colors */
  --status-success:     #4ade80;
  --status-info:        #60a5fa;
  --status-warning:     #facc15;
  --status-danger:      #ef4444;
  --status-neutral:     #9ca3af;

  /* Accent Colors */
  --accent-primary:     #10b981;
  --accent-secondary:   #8b5cf6;
  --accent-bronze:      #b45309;
  --accent-gold:        #d4a574;
  --accent-teal:        #14b8a6;
  --accent-slate:       #64748b;

  /* Module Accents */
  --accent-dashboard:   #10b981;
  --accent-blocks:      #b45309;
  --accent-tasks:       #60a5fa;
  --accent-irrigation:  #0891b2;
  --accent-scouting:    #84cc16;
  --accent-harvest:     #d97706;
  --accent-compliance:  #ef4444;
  --accent-billing:     #d4a574;

  /* Radius */
  --radius-sm: 8px;
  --radius-md: 12px;
  --radius-lg: 16px;
  --radius-xl: 20px;
  --radius-2xl: 24px;

  /* Shadows */
  --shadow-xs: 0 1px 2px rgba(0, 0, 0, 0.3);
  --shadow-sm: 0 2px 4px rgba(0, 0, 0, 0.4);
  --shadow-md: 0 6px 12px rgba(0, 0, 0, 0.5);
  --shadow-lg: 0 12px 24px rgba(0, 0, 0, 0.6);
  --shadow-xl: 0 20px 40px rgba(0, 0, 0, 0.7);
}
```

### Gradient usage

- **CTA buttons:** subtle green to teal fade
- **Minimal use** — reserve gradients for hero sections only
- **Status badges:** solid colors with high contrast text
- **Backgrounds:** flat neutrals, never gradients on page surfaces

---

## 5. Typography

### Type system

- **Primary UI:** `Inter` (clean, minimal, contemporary)
- **Display headings:** `Outfit` or `Work Sans` (geometric, modern)
- **Code/data:** `Roboto Mono` (readable tabular numbers)

### Scale

- Display (hero): 40–48px, weight 600
- Page title: 32–36px, weight 600
- Section title: 24–28px, weight 500
- Card title: 16–18px, weight 500
- Body: 15–16px, weight 400
- Label: 12–13px, weight 500
- Caption: 11–12px, weight 400

### Rules

- Use **tabular numerals** everywhere numbers appear
- Maintain **1.5 line-height** for body text
- Increase letter-spacing slightly on headings for premium feel
- Avoid text smaller than 12px
- Use weight for emphasis, not color

---

## 6. Design Tokens and Component Standards

### Spacing

- Base unit: 4px
- Standard component padding: 16–20px
- Card padding: 20–24px
- Page margin: 24px mobile, 32px tablet, 40px desktop
- Section gap: 32–48px (generous)

### Buttons

Required variants:

- **Primary:** solid accent color (green), white text, minimal border
- **Secondary:** transparent, accent text, visible border
- **Ghost:** no background, text only
- **Destructive:** solid red, white text
- **Success:** solid green, white text

Button sizing:

- Height: 44–48px (touch-friendly)
- Padding horizontal: 20–24px
- Border radius: 10–12px
- No shadow; subtle border only

### Cards

- Background: `--surface-secondary`
- Border: 1px `--border-subtle`
- Radius: 16px
- Padding: 20–24px
- Separation: use white space, not multiple borders

### Inputs

- Height: 44px
- Background: `--surface-tertiary`
- Border: 1px `--border-subtle`
- Focus: 2px `--accent-primary` ring
- Radius: 10px
- Padding: 12px 16px
- Text color: `--text-primary`

### Badges and status indicators

- Use icon + text always
- Small label (12px) with colored dot or icon
- Rounded pill (20px radius)
- Example: 🟢 Active, 🟡 Pending, 🔴 Critical

### Tables

- Sticky header with darker background
- Row hover: subtle surface elevation
- Alternating row backgrounds optional (subtle)
- No heavy borders; whitespace is separator
- Action column pinned on desktop

---

## 7. Information Architecture

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
│           ├── OrganizationStep.tsx
│           ├── RanchStep.tsx
│           └── BlockStep.tsx
└── (dashboard)/
    ├── layout.tsx
    ├── page.tsx
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
        ├── integrations/page.tsx
        └── security/page.tsx
```

---

## 8. App Shell

### Sidebar

Minimal, purposeful navigation.

#### Design

- Width: 72px (collapsed icons) or 280px (expanded)
- Background: `--surface-primary`
- Border right: 1px `--border-subtle`
- Smooth collapse/expand on tablet and desktop
- Mobile: hamburger drawer

#### Navigation items

- Icon 24px, no label on collapsed
- Expanded: icon (20px) + label (14px)
- Active state: subtle background tint, colored accent border left (4px)
- Hover: background tint only
- Smooth 200ms transition

#### Sidebar sections

- Dashboard
- Operations (Blocks, Tasks)
- Monitoring (Irrigation, Scouting)
- Management (Crew, Harvest, Compliance)
- Settings

### Top bar

Minimal header with critical information only.

Include:

- Logo or workspace name (left)
- Global search (center, optional)
- Notifications (count badge only)
- User menu (right)

Exclude:

- Language switcher in top bar (move to settings)
- Weather widget (show on dashboard only)
- Quick actions (use keyboard shortcuts instead)

---

## 9. Dashboard

The homepage should feel calm and focused.

### Layout

1. **Page header** — title only, no subtitle
2. **Primary KPI** — one large metric (e.g., "Active Tasks: 12")
3. **Status grid** — 2–4 status cards with icon + text
4. **Secondary section** — map, chart, or activity feed
5. **Minimal footer** — last sync time, no clutter

### Status cards

- Icon (24px) + label (13px) + value (24px, tabular)
- Change indicator (small ↑/↓ icon, no color)
- Minimal shadow (xs only)
- No gradients

### Hero metrics

Keep simple:
- "12 tasks due today"
- "4 crews online"
- "All systems operational"

### Empty states

- Large icon (48px)
- Clear message (16px)
- One primary CTA (button)
- Minimal secondary action (link)

---

## 10. Blocks Module

Map-centric with minimal sidebar.

### Layout

- **Left:** Full-height map with minimal controls
- **Right:** Collapsed card showing selected block
- **Tablet:** Map full-width with card overlay bottom
- **Mobile:** Map + drawer for details

### Block cards

- Only essential info shown initially
- Click or swipe to expand
- Minimal shadows, flat appearance

### Map styling

- Neutral base map (no bright colors)
- Crop-specific colors for polygons only
- High contrast borders (white or light)
- Minimal zoom controls

---

## 11. Tasks Module

Kanban is default, list view secondary.

### Kanban board

- 3–4 columns (To Do, In Progress, Review, Done)
- Cards show: title, assignee, priority icon, due date
- Minimal shadows on cards
- Drag to move between columns
- Smooth 200ms transitions

### List view

- Vertical layout with same information
- Sortable by due date, priority, assignee
- Compact rows (44px height)
- Hover reveals actions

### Create task flow

- Single-page form (no wizard)
- Fields: title, description, assignee, due date, priority, block
- Validation on blur (not submit)
- Large submit button (primary action)

---

## 12. Auth and Onboarding

Dark, minimal, premium feel.

### Login page

- Centered form (400px max width)
- Email + password fields
- "Remember me" checkbox
- Primary CTA: "Sign in"
- Secondary: "Sign up" link
- No illustration, pure minimalism
- Subtle pattern or texture in background (optional)

### Signup page

- Similar layout
- Email, password, confirm password
- Terms acceptance checkbox
- "Create account" CTA

### Onboarding (3 steps)

1. **Organization** — company name, size
2. **First ranch** — name, location, acreage
3. **First block** — name, crop type, area

Each step:
- One question or small group of related fields
- Progress bar at top
- "Continue" and "Skip" buttons
- No animations, simple transitions

---

## 13. Settings

Tabbed interface, minimal visual complexity.

### Tabs

- General
- Team
- Billing
- Integrations
- Security

### General settings

- Workspace name
- Language preference
- Timezone
- Units (metric/imperial)
- Notifications toggle

### Team page

- Invite member (email input + role select)
- Members table: name, role, email, last active
- Pending invites section
- Remove member action (destructive red)

### Billing page

- Current plan display
- Plan features (simple list)
- Pricing calculator for seat changes
- Invoice history table
- Cancel subscription link (muted)

### Security

- Change password
- Two-factor authentication toggle
- Active sessions list
- Last login timestamp

---

## 14. Motion and Interaction

Restraint is key.

### Use motion for

- Sidebar collapse/expand (200ms)
- Card entrance fade (120ms)
- Button press (60ms scale)
- Page transitions (150ms fade)
- Drawer/modal open (200ms slide)

### Rules

- No bounce
- No elastic easing
- Respect `prefers-reduced-motion`
- Motion should clarify, not delight
- Timing: 120–200ms for micro-interactions, 200–300ms for page changes

---

## 15. Responsive Behavior

### Mobile (<768px)

- Sidebar: hamburger drawer
- One-column layout
- Full-width cards
- Map: full-screen with overlay controls
- Bottom sticky action button where useful

### Tablet (768–1024px)

- Sidebar: collapsed (icons only)
- Two-column where appropriate
- Sticky headers on tables
- Card-based layouts

### Desktop (>1024px)

- Sidebar: full width, always visible
- Split views for map + details
- Multi-panel layouts
- Wider tables with more columns

### Wide (>1400px)

- Max content width: `--max-w-6xl` (1152px)
- Maintain readability, avoid over-stretched layouts

---

## 16. Accessibility and Usability

### Standards

- **WCAG 2.1 AAA** in dark mode
- Strong contrast: text on dark surfaces
- Large touch targets: minimum 44px × 44px
- Keyboard navigation: full tab order, visible focus rings
- Semantic HTML: proper heading hierarchy
- ARIA labels on icon-only buttons
- Status never conveyed by color alone

### Dark mode considerations

- Avoid pure white (#fff) for text; use off-white (#f5f5f3)
- Avoid pure black (#000) for backgrounds; use dark gray (#0a0a0a)
- Test with dark mode preferences in browser
- Ensure sufficient contrast in high-brightness outdoor conditions

---

## 17. Internationalization

English and Spanish parity.

### Requirements

- All strings from localization keys
- 1:1 key coverage in both locales
- Language preference in settings (not top bar)
- Responsive text expansion: Spanish often longer
- Number, date, time formatting per locale
- RTL-ready HTML structure

---

## 18. Empty, Loading, and Error States

### Empty states

- Large centered icon (48px)
- Clear message (16–18px)
- Brief explanation (13px, muted)
- One primary CTA button
- Optional illustration (subtle)

### Loading states

- Skeleton screens matching card layout
- No spinners; use skeletons
- Mark regions with `aria-busy="true"`
- Progressive content reveal

### Error states

- Clear, friendly message
- Retry button (primary)
- Error code (small, muted)
- Contact support link if needed

---

## 19. Recommended Frontend Architecture

### Core technologies

- **Next.js 14** App Router
- **TypeScript** strict mode
- **Tailwind CSS** with custom config
- **shadcn/ui** for base components
- **Framer Motion** for micro-interactions
- **React Hook Form** + **Zod** for forms
- **Mapbox GL** and **react-map-gl**
- **TanStack Query** for data fetching
- **Sonner** for toast notifications
- **i18next** for localization
- **Sentry** for error tracking
- **Playwright** for E2E testing

### Dark mode strategy

- CSS custom properties with light/dark variants
- Tailwind `darkMode: 'class'` (class-based)
- Prefer system preference initially
- Allow manual override in settings
- Default to dark mode on first visit

### Design tokens

```typescript
// tokens.ts
export const colors = {
  neutral: {
    950: '#0a0a0a',
    900: '#1a1a1a',
    // ...
  },
  accent: {
    primary: '#10b981',
    secondary: '#8b5cf6',
    // ...
  },
}

export const spacing = {
  sm: '8px',
  md: '16px',
  lg: '24px',
  xl: '32px',
}
```

---

## 20. Module Visual Language

Subtle accents identify each area:

- **Dashboard:** Teal (#14b8a6) accent
- **Blocks:** Bronze (#b45309) accent
- **Tasks:** Sky blue (#60a5fa) accent
- **Irrigation:** Cyan (#0891b2) accent
- **Scouting:** Lime (#84cc16) accent
- **Harvest:** Amber (#d97706) accent
- **Compliance:** Red (#ef4444) accent
- **Billing:** Gold (#d4a574) accent

Accent appears in:
- Module icon background
- Primary CTA gradient
- Status badge highlights
- Chart colors

---

## 21. Build Checklist

### Foundation

- [ ] CSS custom properties set up for dark mode
- [ ] Tailwind theme extended with tokens
- [ ] Type system defined (scale + weights)
- [ ] Dark mode toggle implemented
- [ ] Focus rings visible everywhere

### Layout

- [ ] Sidebar with expand/collapse built
- [ ] Top bar minimal and clean
- [ ] Responsive breakpoints tested
- [ ] Page header component created
- [ ] Sticky header/footer patterns built

### Dashboard

- [ ] Primary KPI displayed
- [ ] Status grid implemented
- [ ] Empty state designed
- [ ] Activity feed optional
- [ ] Mini map or mini chart added

### Blocks

- [ ] Full-height map integrated
- [ ] Block detail card built
- [ ] Polygon color coding by crop
- [ ] Map controls minimal
- [ ] Split/drawer layouts responsive

### Tasks

- [ ] Kanban board functional
- [ ] Card drag-and-drop smooth
- [ ] List view as alternative
- [ ] Create task form validated
- [ ] Status badges with icons

### Auth and onboarding

- [ ] Login/signup pages dark and minimal
- [ ] Three-step onboarding flow
- [ ] Form validation with error messages
- [ ] Success states after signup

### Settings

- [ ] Tabbed interface built
- [ ] Team member table built
- [ ] Billing cards and calculator
- [ ] Security settings page

### Quality

- [ ] WCAG AAA contrast verified
- [ ] Keyboard navigation tested
- [ ] English + Spanish complete
- [ ] Dark mode preference tested
- [ ] Mobile responsiveness verified
- [ ] Sentry integrated
- [ ] E2E tests cover critical flows

---

## 22. Color Comparison Across Themes

| Element | OrchardOS Warm | Orchid Premium | Dark Modern |
|---------|---|---|---|
| Primary green | #2e8b57 | #2f8a57 | #10b981 |
| Primary accent | #fbbf24 (Citrus) | #f4b942 (Gold) | None (minimal) |
| Background | #f8faf7 | #f7faf6 | #0f0f0f |
| Text primary | #102018 | #132117 | #f5f5f3 |
| Borders | #e5ebe7 | #e2e8e2 | #333333 |
| Page feel | Warm, energetic | Premium, grounded | Calm, minimal |

---

## 23. Final Recommendation

The Dark Modern theme is for organizations that want to position OrchardOS as a **contemporary, serious tool**—not another colorful agricultural dashboard. It appeals to tech-forward operators, younger crews, and teams working in harsh field lighting.

This direction is:

- **Minimal** — only signal, no noise
- **Accessible** — high contrast for outdoor use
- **Premium** — feels like a fintech or SaaS product
- **Professional** — calm under pressure
- **Contemporary** — modern, not agricultural-specific in aesthetics
- **Fast** — cognitive load is minimal

Use this theme if your customers want to feel like they're using enterprise software that happens to manage orchards—not agriculture software trying to look modern.

---

## 24. Naming and Positioning

Use consistent, minimal language:

- **OrchardOS** (simple, no descriptors)
- Orchard Blocks
- Work Orders (not "tasks")
- Field Teams (not "crew")
- Irrigation Status
- Crop Scouting
- Harvest Tracking
- Compliance Log

All labels should be nouns only, no extra words.

---

## 25. Implementation Priority

### Phase 1: Foundation

- App shell (sidebar + top bar)
- Authentication flows
- Dashboard homepage
- Blocks module with map
- Tasks kanban view

### Phase 2: Operations

- Irrigation monitoring
- Scouting observations
- Task calendar view
- Crew management

### Phase 3: Advanced

- Harvest workflows
- Compliance tracking
- Analytics dashboard
- Integrations platform

---

## 26. Sample Code Patterns

### Dark mode aware button

```tsx
export function PrimaryButton({ children, ...props }) {
  return (
    <button
      className="
        px-6 py-3 rounded-lg font-500
        bg-accent-primary text-text-inverse
        hover:opacity-90 active:scale-95
        transition-all duration-200
        dark:bg-accent-primary dark:text-text-inverse
      "
      {...props}
    >
      {children}
    </button>
  )
}
```

### Dark mode card

```tsx
export function Card({ children }) {
  return (
    <div
      className="
        bg-surface-secondary
        border border-border-subtle
        rounded-2xl p-6
        dark:bg-surface-secondary dark:border-border-subtle
      "
    >
      {children}
    </div>
  )
}
```

### Status badge with icon

```tsx
export function StatusBadge({ status, label }) {
  const statusConfig = {
    active: { icon: '🟢', color: 'text-status-success' },
    pending: { icon: '🟡', color: 'text-status-warning' },
    critical: { icon: '🔴', color: 'text-status-danger' },
  }
  
  const { icon, color } = statusConfig[status]
  
  return (
    <span className="flex items-center gap-2 text-sm">
      <span className={color}>{icon}</span>
      <span className="text-text-secondary">{label}</span>
    </span>
  )
}
```

---

## 27. Closing Principles

**Dark Modern is for builders, not farmers.**

It positions OrchardOS as a serious operational tool used by tech-literate managers and forward-thinking crews. The aesthetic is deliberately non-agricultural—no fruit imagery, no field illustrations, no warm browns or natural textures. Instead: clean lines, high contrast, strategic color, and breathing room.

If your positioning is "premium technology for orchard professionals," this theme delivers that message immediately through design.
