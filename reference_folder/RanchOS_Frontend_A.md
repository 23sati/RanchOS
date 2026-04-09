# RanchOS — Frontend Implementation Plan
## Part A: Design System, Layout Architecture & Global Config

> **Stack:** Next.js 14 (App Router) · TypeScript (strict) · Tailwind CSS · Mapbox GL JS · i18next  
> **Read alongside:** `RanchOS_Overview.md`, `RanchOS_Phase1.md`  
> **Continued in:** `RanchOS_Frontend_B.md`, `RanchOS_Frontend_C.md`, `RanchOS_Frontend_D.md`

---

## 1. Design Philosophy

RanchOS is a **professional-grade field operations tool** — not a consumer app. The design must convey trust, precision, and durability. Primary users open this at dawn on a tablet in a farm office or on a phone standing in a 105°F orchard.

| Principle | Implementation |
|---|---|
| **Data density without clutter** | Card-based layouts with clear hierarchy; no decorative whitespace waste |
| **Instant legibility** | High contrast text on colored backgrounds; min 16px body, 14px labels |
| **Tactile affordance** | Visible buttons, large click targets, clear hover/active states |
| **Agricultural grounding** | Earth tones + sky gradients, not sterile tech blues |
| **Bilingual parity** | Spanish UI receives identical design treatment; never degraded |
| **Status clarity** | Color-coded status system consistent across every surface |

---

## 2. Color System

### Primary Palette (CSS Custom Properties)

```css
/* apps/web/src/app/globals.css */
:root {
  /* === Brand === */
  --color-ranch-soil:      #7C5C3E;   /* warm brown — primary brand */
  --color-ranch-soil-dark: #5A3E26;
  --color-ranch-leaf:      #3D7A4F;   /* agricultural green */
  --color-ranch-leaf-dark: #2A5738;
  --color-ranch-sky:       #3B8BEB;   /* California sky blue */
  --color-ranch-sky-dark:  #2466C2;
  --color-ranch-sun:       #F5A623;   /* citrus/almond gold */
  --color-ranch-sun-dark:  #D4851A;

  /* === Semantic Status === */
  --color-status-pending:   #6B7280;   /* gray */
  --color-status-active:    #3B8BEB;   /* blue */
  --color-status-completed: #3D7A4F;   /* green */
  --color-status-overdue:   #DC2626;   /* red */
  --color-status-urgent:    #EA580C;   /* orange */

  /* === Crop Type === */
  --color-crop-almond:       #F59E0B;
  --color-crop-almond-light: #FEF3C7;
  --color-crop-citrus:       #FB923C;
  --color-crop-citrus-light: #FFEDD5;
  --color-crop-organic:      #22C55E;

  /* === Surface (Light Mode) === */
  --color-bg-primary:   #FAFAF9;   /* warm off-white */
  --color-bg-secondary: #F5F3F0;   /* parchment */
  --color-bg-card:      #FFFFFF;
  --color-bg-sidebar:   #1C1917;   /* near-black warm */
  --color-bg-overlay:   rgba(28,25,23,0.6);

  /* === Text === */
  --color-text-primary:   #1C1917;
  --color-text-secondary: #57534E;
  --color-text-muted:     #A8A29E;
  --color-text-inverse:   #FAFAF9;

  /* === Borders === */
  --color-border:        #E7E5E4;
  --color-border-strong: #A8A29E;

  /* === Spacing scale === */
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 20px;
  --space-6: 24px;
  --space-8: 32px;
  --space-10: 40px;
  --space-12: 48px;
  --space-16: 64px;

  /* === Border Radius === */
  --radius-sm:  4px;
  --radius-md:  8px;
  --radius-lg:  12px;
  --radius-xl:  16px;
  --radius-full: 9999px;

  /* === Shadow === */
  --shadow-sm: 0 1px 2px rgba(28,25,23,0.06);
  --shadow-md: 0 4px 12px rgba(28,25,23,0.10);
  --shadow-lg: 0 8px 24px rgba(28,25,23,0.14);
  --shadow-xl: 0 16px 48px rgba(28,25,23,0.18);
}

/* Dark mode overrides (system preference) */
@media (prefers-color-scheme: dark) {
  :root {
    --color-bg-primary:   #0C0A09;
    --color-bg-secondary: #1C1917;
    --color-bg-card:      #292524;
    --color-bg-sidebar:   #0C0A09;
    --color-border:        #3D3937;
    --color-border-strong: #57534E;
    --color-text-primary:   #FAFAF9;
    --color-text-secondary: #D6D3D1;
    --color-text-muted:     #78716C;
  }
}
```

### Tailwind Config Extension

```typescript
// apps/web/tailwind.config.ts
import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        soil:    { DEFAULT: '#7C5C3E', dark: '#5A3E26' },
        leaf:    { DEFAULT: '#3D7A4F', dark: '#2A5738', light: '#D1FAE5' },
        sky:     { DEFAULT: '#3B8BEB', dark: '#2466C2', light: '#DBEAFE' },
        sun:     { DEFAULT: '#F5A623', dark: '#D4851A', light: '#FEF3C7' },
        ranch: {
          'bg':      '#FAFAF9',
          'card':    '#FFFFFF',
          'sidebar': '#1C1917',
          'border':  '#E7E5E4',
        }
      },
      fontFamily: {
        sans:  ['Inter', 'system-ui', 'sans-serif'],
        mono:  ['JetBrains Mono', 'Menlo', 'monospace'],
        display: ['Cal Sans', 'Inter', 'sans-serif'], /* for hero/dashboard headings */
      },
      boxShadow: {
        'card-hover': '0 8px 24px rgba(28,25,23,0.14)',
        'sidebar':    '4px 0 24px rgba(0,0,0,0.15)',
        'map-control':'0 2px 8px rgba(28,25,23,0.2)',
      },
      animation: {
        'fade-in':       'fadeIn 0.2s ease-out',
        'slide-up':      'slideUp 0.25s ease-out',
        'slide-in-left': 'slideInLeft 0.3s ease-out',
        'pulse-slow':    'pulse 3s cubic-bezier(0.4,0,0.6,1) infinite',
        'shimmer':       'shimmer 1.5s infinite linear',
      },
      keyframes: {
        fadeIn:      { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
        slideUp:     { '0%': { transform: 'translateY(8px)', opacity: '0' }, '100%': { transform: 'translateY(0)', opacity: '1' } },
        slideInLeft: { '0%': { transform: 'translateX(-16px)', opacity: '0' }, '100%': { transform: 'translateX(0)', opacity: '1' } },
        shimmer:     { '0%': { backgroundPosition: '-1000px 0' }, '100%': { backgroundPosition: '1000px 0' } },
      }
    }
  },
  plugins: [
    require('@tailwindcss/forms'),
    require('@tailwindcss/typography'),
  ]
};
export default config;
```

---

## 3. Typography System

```css
/* globals.css (continued) */
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');
/* Cal Sans via local or CDN for display headings */

/* Type Scale */
.text-display  { font-size: 2rem;   line-height: 1.2;  font-weight: 700; letter-spacing: -0.03em; }
.text-h1       { font-size: 1.5rem; line-height: 1.3;  font-weight: 700; letter-spacing: -0.02em; }
.text-h2       { font-size: 1.25rem;line-height: 1.35; font-weight: 600; }
.text-h3       { font-size: 1.0rem; line-height: 1.4;  font-weight: 600; }
.text-body     { font-size: 0.9375rem; line-height: 1.6; font-weight: 400; } /* 15px */
.text-sm       { font-size: 0.8125rem; line-height: 1.5; font-weight: 400; } /* 13px */
.text-xs       { font-size: 0.6875rem; line-height: 1.4; font-weight: 500; letter-spacing: 0.04em; text-transform: uppercase; } /* labels */
.text-mono     { font-family: var(--font-mono); font-size: 0.8125rem; }
```

---

## 4. Global CSS Foundations

```css
/* globals.css (continued) */

/* Reset & Base */
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
html { font-size: 16px; -webkit-font-smoothing: antialiased; }
body {
  font-family: 'Inter', system-ui, sans-serif;
  background-color: var(--color-bg-primary);
  color: var(--color-text-primary);
  min-height: 100dvh;
}

/* Focus rings — visible, branded */
:focus-visible {
  outline: 2px solid var(--color-ranch-sky);
  outline-offset: 2px;
  border-radius: var(--radius-sm);
}

/* Scrollbar (webkit) */
::-webkit-scrollbar        { width: 6px; height: 6px; }
::-webkit-scrollbar-track  { background: transparent; }
::-webkit-scrollbar-thumb  { background: var(--color-border-strong); border-radius: 99px; }

/* Skeleton shimmer base */
.skeleton {
  background: linear-gradient(90deg, var(--color-border) 25%, var(--color-bg-secondary) 50%, var(--color-border) 75%);
  background-size: 1000px 100%;
  animation: shimmer 1.5s infinite linear;
  border-radius: var(--radius-md);
}

/* Map container resets */
.mapboxgl-map { font-family: inherit !important; }
.mapboxgl-ctrl-group { box-shadow: var(--shadow-map-control) !important; border-radius: var(--radius-md) !important; }
```

---

## 5. App Router Layout Architecture

```
apps/web/src/
├── app/
│   ├── layout.tsx                  ← Root: fonts, ThemeProvider, Toaster, i18n
│   ├── globals.css
│   ├── (auth)/
│   │   ├── layout.tsx              ← Centered card, bg gradient, no sidebar
│   │   ├── login/page.tsx
│   │   ├── signup/page.tsx
│   │   └── onboarding/
│   │       ├── page.tsx            ← Multi-step wizard controller
│   │       └── steps/
│   │           ├── OrgStep.tsx
│   │           ├── RanchStep.tsx
│   │           └── BlockStep.tsx
│   └── (dashboard)/
│       ├── layout.tsx              ← AppShell: sidebar + topbar + main area
│       ├── page.tsx                ← Owner home dashboard
│       ├── blocks/
│       │   ├── page.tsx            ← Block list + satellite map split view
│       │   ├── new/page.tsx
│       │   └── [id]/page.tsx       ← Block detail + season history
│       ├── tasks/
│       │   ├── page.tsx            ← Kanban board (default) or list toggle
│       │   ├── new/page.tsx
│       │   └── [id]/page.tsx
│       ├── irrigation/
│       │   └── page.tsx            ← Phase 2
│       ├── scouting/
│       │   └── page.tsx            ← Phase 2
│       ├── labor/
│       │   └── page.tsx            ← Phase 3
│       ├── compliance/
│       │   └── page.tsx            ← Phase 3
│       └── settings/
│           ├── page.tsx
│           ├── team/page.tsx
│           ├── billing/page.tsx
│           └── integrations/page.tsx
├── components/
│   ├── ui/                         ← Primitives (button, input, badge, dialog…)
│   ├── layout/                     ← Sidebar, TopBar, AppShell, PageHeader
│   ├── map/                        ← BlockMap, DrawTool, Popup
│   ├── blocks/                     ← BlockCard, BlockForm, BlockList, BlockTable
│   ├── tasks/                      ← TaskCard, TaskKanban, TaskForm, TaskStatusBadge
│   ├── dashboard/                  ← WeatherWidget, ActivityFeed, StatCard
│   ├── onboarding/                 ← WizardStep, ProgressBar, StepIndicator
│   └── shared/                     ← LanguageSwitcher, OrgSwitcher, UserMenu
└── lib/
    ├── auth/client.ts
    ├── auth/server.ts
    ├── api/client.ts
    ├── hooks/                      ← useOrg, useSSE, useDebounce, useMapBlock
    └── utils/                      ← formatters.ts, area.ts, cn.ts
```

---

## 6. Root Layout (`app/layout.tsx`)

```tsx
// apps/web/src/app/layout.tsx
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { Toaster } from '@/components/ui/Toaster';
import { I18nProvider } from '@/components/shared/I18nProvider';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

export const metadata: Metadata = {
  title: { template: '%s | RanchOS', default: 'RanchOS — Orchard Operations Platform' },
  description: 'Bilingual orchard management for California almond and citrus growers. Track blocks, tasks, irrigation, and compliance in one platform.',
  keywords: ['orchard management', 'almond farming', 'citrus farming', 'agriculture software', 'farm management'],
  openGraph: {
    siteName: 'RanchOS',
    type: 'website',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <body>
        <I18nProvider>
          {children}
          <Toaster />
        </I18nProvider>
      </body>
    </html>
  );
}
```

---

## 7. Dashboard Shell Layout (`app/(dashboard)/layout.tsx`)

```tsx
// apps/web/src/app/(dashboard)/layout.tsx
import { redirect } from 'next/navigation';
import { getServerSession } from '@/lib/auth/server';
import { AppShell } from '@/components/layout/AppShell';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession();
  if (!session) redirect('/login');

  return <AppShell session={session}>{children}</AppShell>;
}
```

---

## 8. AppShell Component

```tsx
// apps/web/src/components/layout/AppShell.tsx
'use client';
import { useState } from 'react';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import type { Session } from '@/lib/auth/types';

interface AppShellProps {
  children: React.ReactNode;
  session: Session;
}

export function AppShell({ children, session }: AppShellProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  return (
    <div className="flex h-screen bg-[var(--color-bg-primary)] overflow-hidden">
      {/* Sidebar */}
      <Sidebar
        collapsed={sidebarCollapsed}
        onCollapse={() => setSidebarCollapsed(c => !c)}
        session={session}
      />

      {/* Main content area */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <TopBar session={session} />
        <main
          id="main-content"
          className="flex-1 overflow-y-auto p-6 animate-fade-in"
        >
          {children}
        </main>
      </div>
    </div>
  );
}
```

---

## 9. Sidebar Component

```tsx
// apps/web/src/components/layout/Sidebar.tsx
'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import {
  MapIcon, ClipboardListIcon, DropletIcon, BugIcon,
  UsersIcon, FileTextIcon, SettingsIcon, ChevronLeftIcon,
  LeafIcon
} from 'lucide-react';
import { cn } from '@/lib/utils/cn';

const NAV_ITEMS = [
  { href: '/',            icon: HomeIcon,          labelKey: 'nav.dashboard',  phase: 1 },
  { href: '/blocks',      icon: MapIcon,            labelKey: 'nav.blocks',     phase: 1 },
  { href: '/tasks',       icon: ClipboardListIcon,  labelKey: 'nav.tasks',      phase: 1 },
  { href: '/irrigation',  icon: DropletIcon,        labelKey: 'nav.irrigation', phase: 2 },
  { href: '/scouting',    icon: BugIcon,            labelKey: 'nav.scouting',   phase: 2 },
  { href: '/labor',       icon: UsersIcon,          labelKey: 'nav.labor',      phase: 3 },
  { href: '/compliance',  icon: FileTextIcon,       labelKey: 'nav.compliance', phase: 3 },
] as const;

interface SidebarProps {
  collapsed: boolean;
  onCollapse: () => void;
  session: Session;
}

export function Sidebar({ collapsed, onCollapse, session }: SidebarProps) {
  const pathname = usePathname();
  const { t } = useTranslation();

  return (
    <aside
      id="sidebar"
      className={cn(
        'relative flex flex-col bg-[var(--color-bg-sidebar)] transition-all duration-300 ease-out',
        'border-r border-white/5 shadow-sidebar',
        collapsed ? 'w-16' : 'w-64'
      )}
    >
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 py-5 border-b border-white/10">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[var(--color-ranch-leaf)] to-[var(--color-ranch-sun)] flex items-center justify-center flex-shrink-0">
          <LeafIcon className="w-4 h-4 text-white" />
        </div>
        {!collapsed && (
          <span className="text-white font-bold text-lg tracking-tight">RanchOS</span>
        )}
      </div>

      {/* Org name */}
      {!collapsed && (
        <div className="px-4 py-3 border-b border-white/10">
          <p className="text-[var(--color-text-muted)] text-xs uppercase tracking-widest mb-1">
            {t('nav.operation')}
          </p>
          <p className="text-white text-sm font-medium truncate">
            {session.org?.name}
          </p>
        </div>
      )}

      {/* Nav items */}
      <nav className="flex-1 px-2 py-4 space-y-1 overflow-y-auto">
        {NAV_ITEMS.map(({ href, icon: Icon, labelKey }) => {
          const active = pathname === href || (href !== '/' && pathname.startsWith(href));
          return (
            <Link
              key={href}
              href={href}
              id={`nav-${href.replace('/', '') || 'dashboard'}`}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150',
                'group relative',
                active
                  ? 'bg-white/10 text-white'
                  : 'text-white/60 hover:bg-white/5 hover:text-white'
              )}
            >
              <Icon className={cn('w-5 h-5 flex-shrink-0 transition-transform group-hover:scale-110', active && 'text-[var(--color-ranch-sun)]')} />
              {!collapsed && <span>{t(labelKey)}</span>}
              {/* Active indicator */}
              {active && (
                <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-[var(--color-ranch-sun)] rounded-r-full" />
              )}
            </Link>
          );
        })}
      </nav>

      {/* Settings + collapse toggle */}
      <div className="px-2 py-4 border-t border-white/10 space-y-1">
        <Link href="/settings" id="nav-settings" className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-white/60 hover:bg-white/5 hover:text-white transition-all">
          <SettingsIcon className="w-5 h-5 flex-shrink-0" />
          {!collapsed && <span>{t('nav.settings')}</span>}
        </Link>
        <button
          onClick={onCollapse}
          id="sidebar-collapse-btn"
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-white/40 hover:text-white/70 hover:bg-white/5 transition-all"
        >
          <ChevronLeftIcon className={cn('w-4 h-4 flex-shrink-0 transition-transform duration-300', collapsed && 'rotate-180')} />
          {!collapsed && <span className="text-xs">{t('nav.collapse')}</span>}
        </button>
      </div>
    </aside>
  );
}
```

---

## 10. TopBar Component

```tsx
// apps/web/src/components/layout/TopBar.tsx
'use client';
import { useTranslation } from 'react-i18next';
import { BellIcon, SearchIcon } from 'lucide-react';
import { LanguageSwitcher } from '@/components/shared/LanguageSwitcher';
import { UserMenu } from '@/components/shared/UserMenu';
import { NotificationsDropdown } from '@/components/shared/NotificationsDropdown';

export function TopBar({ session }: { session: Session }) {
  const { t } = useTranslation();

  return (
    <header className="h-14 flex items-center justify-between px-6 bg-[var(--color-bg-card)] border-b border-[var(--color-border)] flex-shrink-0">
      {/* Global search */}
      <div className="relative w-72">
        <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-muted)]" />
        <input
          id="global-search"
          type="search"
          placeholder={t('common.search_placeholder')}
          className="w-full pl-9 pr-4 py-2 text-sm bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-lg focus:ring-2 focus:ring-sky/30 focus:border-sky transition-all"
        />
      </div>

      {/* Right controls */}
      <div className="flex items-center gap-3">
        <LanguageSwitcher />
        <NotificationsDropdown />
        <UserMenu session={session} />
      </div>
    </header>
  );
}
```

---

## 11. PageHeader Component

```tsx
// apps/web/src/components/layout/PageHeader.tsx
import { cn } from '@/lib/utils/cn';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  breadcrumb?: { label: string; href?: string }[];
  className?: string;
}

export function PageHeader({ title, subtitle, actions, breadcrumb, className }: PageHeaderProps) {
  return (
    <div className={cn('mb-6', className)}>
      {breadcrumb && (
        <nav className="flex items-center gap-2 text-sm text-[var(--color-text-muted)] mb-2">
          {breadcrumb.map((crumb, i) => (
            <span key={i} className="flex items-center gap-2">
              {i > 0 && <span>/</span>}
              {crumb.href
                ? <a href={crumb.href} className="hover:text-[var(--color-text-primary)] transition-colors">{crumb.label}</a>
                : <span>{crumb.label}</span>
              }
            </span>
          ))}
        </nav>
      )}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-display text-[var(--color-text-primary)]">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-[var(--color-text-secondary)]">{subtitle}</p>}
        </div>
        {actions && <div className="flex items-center gap-3 flex-shrink-0">{actions}</div>}
      </div>
    </div>
  );
}
```

---

## 12. Primitive UI Components

### `cn` utility

```typescript
// apps/web/src/lib/utils/cn.ts
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
export function cn(...inputs: ClassValue[]) { return twMerge(clsx(inputs)); }
```

### Button

```tsx
// apps/web/src/components/ui/Button.tsx
import { cn } from '@/lib/utils/cn';
import { forwardRef } from 'react';

const VARIANTS = {
  primary:   'bg-[var(--color-ranch-leaf)] text-white hover:bg-[var(--color-ranch-leaf-dark)] shadow-sm',
  secondary: 'bg-[var(--color-bg-secondary)] text-[var(--color-text-primary)] border border-[var(--color-border)] hover:bg-[var(--color-border)]',
  destructive: 'bg-red-600 text-white hover:bg-red-700',
  ghost:     'text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-secondary)] hover:text-[var(--color-text-primary)]',
  outline:   'border border-[var(--color-ranch-leaf)] text-[var(--color-ranch-leaf)] hover:bg-leaf/10',
} as const;

const SIZES = {
  sm: 'h-8 px-3 text-xs font-medium rounded-md gap-1.5',
  md: 'h-9 px-4 text-sm font-medium rounded-lg gap-2',
  lg: 'h-11 px-6 text-sm font-semibold rounded-lg gap-2',
} as const;

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: keyof typeof VARIANTS;
  size?: keyof typeof SIZES;
  loading?: boolean;
  icon?: React.ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', loading, icon, children, className, disabled, ...props }, ref) => (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center justify-center transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky/50',
        'disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98]',
        VARIANTS[variant],
        SIZES[size],
        className
      )}
      {...props}
    >
      {loading ? <Spinner className="w-4 h-4" /> : icon}
      {children}
    </button>
  )
);
Button.displayName = 'Button';
```

### Badge

```tsx
// apps/web/src/components/ui/Badge.tsx
import { cn } from '@/lib/utils/cn';

const COLORS = {
  default:   'bg-[var(--color-bg-secondary)] text-[var(--color-text-secondary)]',
  green:     'bg-leaf/15 text-leaf-dark',
  blue:      'bg-sky/15 text-sky-dark',
  amber:     'bg-sun/15 text-sun-dark',
  red:       'bg-red-100 text-red-700',
  orange:    'bg-orange-100 text-orange-700',
  gray:      'bg-stone-100 text-stone-600',
  organic:   'bg-emerald-100 text-emerald-700 border border-emerald-300',
} as const;

interface BadgeProps {
  children: React.ReactNode;
  color?: keyof typeof COLORS;
  dot?: boolean;
  className?: string;
}

export function Badge({ children, color = 'default', dot, className }: BadgeProps) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium', COLORS[color], className)}>
      {dot && <span className={cn('w-1.5 h-1.5 rounded-full', color === 'green' ? 'bg-leaf' : color === 'red' ? 'bg-red-500' : 'bg-current opacity-60')} />}
      {children}
    </span>
  );
}
```

### Card

```tsx
// apps/web/src/components/ui/Card.tsx
import { cn } from '@/lib/utils/cn';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  hover?: boolean;
  onClick?: () => void;
}

export function Card({ children, className, hover, onClick }: CardProps) {
  return (
    <div
      onClick={onClick}
      className={cn(
        'bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-xl shadow-sm',
        hover && 'cursor-pointer hover:shadow-card-hover hover:-translate-y-0.5 transition-all duration-200',
        onClick && 'cursor-pointer',
        className
      )}
    >
      {children}
    </div>
  );
}

export function CardHeader({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('px-5 py-4 border-b border-[var(--color-border)]', className)}>{children}</div>;
}

export function CardContent({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('px-5 py-4', className)}>{children}</div>;
}
```

### StatCard

```tsx
// apps/web/src/components/dashboard/StatCard.tsx
import { Card, CardContent } from '@/components/ui/Card';
import { cn } from '@/lib/utils/cn';
import type { LucideIcon } from 'lucide-react';

interface StatCardProps {
  label: string;
  value: string | number;
  subtext?: string;
  icon: LucideIcon;
  color?: 'green' | 'blue' | 'amber' | 'red';
  trend?: { value: number; label: string };
}

const COLOR_MAP = {
  green: { bg: 'bg-leaf/10', icon: 'text-leaf', text: 'text-leaf-dark' },
  blue:  { bg: 'bg-sky/10',  icon: 'text-sky',  text: 'text-sky-dark'  },
  amber: { bg: 'bg-sun/10',  icon: 'text-sun',  text: 'text-sun-dark'  },
  red:   { bg: 'bg-red-50',  icon: 'text-red-500', text: 'text-red-600' },
};

export function StatCard({ label, value, subtext, icon: Icon, color = 'blue', trend }: StatCardProps) {
  const c = COLOR_MAP[color];
  return (
    <Card hover className="group">
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-widest text-[var(--color-text-muted)]">{label}</p>
            <p className="mt-2 text-2xl font-bold text-[var(--color-text-primary)] tabular-nums">{value}</p>
            {subtext && <p className="mt-1 text-sm text-[var(--color-text-secondary)]">{subtext}</p>}
            {trend && (
              <p className={cn('mt-1 text-xs font-medium', trend.value >= 0 ? 'text-leaf' : 'text-red-500')}>
                {trend.value >= 0 ? '↑' : '↓'} {Math.abs(trend.value)}% {trend.label}
              </p>
            )}
          </div>
          <div className={cn('p-3 rounded-xl transition-transform group-hover:scale-110', c.bg)}>
            <Icon className={cn('w-5 h-5', c.icon)} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
```

---

## 13. i18n Provider Setup

```tsx
// apps/web/src/components/shared/I18nProvider.tsx
'use client';
import i18n from 'i18next';
import { initReactI18next, I18nextProvider } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import en from '@ranchos/i18n/locales/en';
import es from '@ranchos/i18n/locales/es';

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: { en: { translation: en }, es: { translation: es } },
    fallbackLng: 'en',
    supportedLngs: ['en', 'es'],
    interpolation: { escapeValue: false },
    detection: { order: ['localStorage', 'navigator'], caches: ['localStorage'] },
  });

export function I18nProvider({ children }: { children: React.ReactNode }) {
  return <I18nextProvider i18n={i18n}>{children}</I18nextProvider>;
}
```

```tsx
// apps/web/src/components/shared/LanguageSwitcher.tsx
'use client';
import { useTranslation } from 'react-i18next';
import { GlobeIcon } from 'lucide-react';

export function LanguageSwitcher() {
  const { i18n } = useTranslation();
  const toggle = () => i18n.changeLanguage(i18n.language === 'en' ? 'es' : 'en');

  return (
    <button
      id="language-switcher"
      onClick={toggle}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-secondary)] transition-colors"
      title={i18n.language === 'en' ? 'Cambiar a Español' : 'Switch to English'}
    >
      <GlobeIcon className="w-4 h-4" />
      <span>{i18n.language.toUpperCase()}</span>
    </button>
  );
}
```

---

## 14. Notification / Toast System

```tsx
// apps/web/src/components/ui/Toaster.tsx
'use client';
import { Toaster as SonnerToaster } from 'sonner';

export function Toaster() {
  return (
    <SonnerToaster
      position="bottom-right"
      toastOptions={{
        style: {
          background: 'var(--color-bg-card)',
          border: '1px solid var(--color-border)',
          color: 'var(--color-text-primary)',
          fontFamily: 'Inter, sans-serif',
          fontSize: '14px',
          boxShadow: 'var(--shadow-lg)',
        },
      }}
    />
  );
}

// Usage anywhere:
// import { toast } from 'sonner';
// toast.success(t('tasks.completed'));
// toast.error(t('errors.save_failed'));
// toast.loading(t('common.saving'));
```

---

## 15. Key Dependencies (`apps/web/package.json`)

```json
{
  "dependencies": {
    "next": "14.2.x",
    "react": "^18.3.0",
    "react-dom": "^18.3.0",
    "typescript": "^5.4.0",

    "better-auth": "^1.x",
    "@ranchos/db": "workspace:*",
    "@ranchos/shared": "workspace:*",
    "@ranchos/i18n": "workspace:*",

    "mapbox-gl": "^3.x",
    "react-map-gl": "^7.x",
    "@mapbox/mapbox-gl-draw": "^1.4.x",
    "@turf/turf": "^6.x",

    "i18next": "^23.x",
    "react-i18next": "^14.x",
    "i18next-browser-languagedetector": "^8.x",

    "lucide-react": "^0.400.x",
    "sonner": "^1.x",
    "clsx": "^2.x",
    "tailwind-merge": "^2.x",
    "@hello-pangea/dnd": "^16.x",

    "recharts": "^2.x",
    "date-fns": "^3.x",
    "stripe": "^14.x",
    "@stripe/stripe-js": "^3.x"
  },
  "devDependencies": {
    "@tailwindcss/forms": "^0.5.x",
    "@tailwindcss/typography": "^0.5.x",
    "tailwindcss": "^3.4.x",
    "autoprefixer": "^10.x",
    "postcss": "^8.x"
  }
}
```

---

## 16. Design Tokens Checklist

| Token Category | Status | Notes |
|---|---|---|
| Colors — brand | ✅ | Soil, leaf, sky, sun |
| Colors — status | ✅ | 5-state mapped |
| Colors — crop | ✅ | Per crop type + organic |
| Colors — surface | ✅ | Light + dark mode |
| Typography scale | ✅ | 6 levels defined |
| Spacing scale | ✅ | 4px base grid |
| Border radius | ✅ | sm → full |
| Shadows | ✅ | sm → xl + special |
| Animations | ✅ | fade, slide, shimmer |
| Focus states | ✅ | Branded, WCAG AA |
| Dark mode | ✅ | System preference + manual |

---

*Continued in `RanchOS_Frontend_B.md` — Dashboard, Blocks, Tasks pages.*
