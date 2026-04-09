# RanchOS — Frontend Implementation Plan
## Part D: Auth Pages & Onboarding Wizard

> **Prerequisite:** Parts A, B, C · **Continued in:** `RanchOS_Frontend_E.md`

---

## 1. Auth Layout

```tsx
// app/(auth)/layout.tsx
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#1C1917] via-[#292524] to-[#1C1917] px-4 py-12">
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-[var(--color-ranch-leaf)] rounded-full opacity-5 blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-[var(--color-ranch-sky)] rounded-full opacity-5 blur-3xl pointer-events-none" />
      <div className="relative w-full max-w-md animate-slide-up">
        <div className="flex items-center justify-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[var(--color-ranch-leaf)] to-[var(--color-ranch-sun)] flex items-center justify-center shadow-lg">
            <LeafIcon className="w-5 h-5 text-white" />
          </div>
          <span className="text-white text-2xl font-bold tracking-tight">RanchOS</span>
        </div>
        {children}
      </div>
    </div>
  );
}
```

---

## 2. Login Page

```tsx
// app/(auth)/login/page.tsx
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { authClient } from '@/lib/auth/client';
import { Button } from '@/components/ui/Button';
import { toast } from 'sonner';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';

const inputCls = 'w-full px-4 py-3 rounded-xl border border-white/15 bg-white/10 text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-sky/50 transition-all text-sm';

export default function LoginPage() {
  const router = useRouter();
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await authClient.signIn.email({ email, password });
    setLoading(false);
    if (error) toast.error(t('auth.invalid_credentials'));
    else router.push('/');
  };

  return (
    <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl shadow-xl p-8 space-y-6">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-white">{t('auth.welcome_back')}</h1>
        <p className="mt-2 text-sm text-white/60">{t('auth.sign_in_subtitle')}</p>
      </div>
      <form id="login-form" onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-semibold text-white/60 uppercase tracking-wider mb-1.5">{t('auth.email')}</label>
          <input id="login-email" type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} className={inputCls} placeholder="you@yourranch.com" />
        </div>
        <div>
          <div className="flex justify-between mb-1.5">
            <label className="text-xs font-semibold text-white/60 uppercase tracking-wider">{t('auth.password')}</label>
            <Link href="/forgot-password" className="text-xs text-sky/80 hover:text-sky transition-colors">{t('auth.forgot_password')}</Link>
          </div>
          <input id="login-password" type="password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} className={inputCls} placeholder="••••••••" />
        </div>
        <Button id="login-submit" type="submit" loading={loading} className="w-full !py-3">{t('auth.sign_in')}</Button>
      </form>
      <p className="text-center text-sm text-white/50">
        {t('auth.no_account')}{' '}
        <Link href="/signup" className="text-sky/80 hover:text-sky font-medium">{t('auth.start_trial')}</Link>
      </p>
      <p className="text-center text-xs text-white/30">También disponible en Español</p>
    </div>
  );
}
```

---

## 3. Signup Page

```tsx
// app/(auth)/signup/page.tsx — same card structure as login
// Fields: Full Name, Email, Password (8+ chars)
// On success → router.push('/onboarding')
// Show: "14-day free trial · No credit card required"
```

---

## 4. Onboarding Wizard Controller

```tsx
// app/(auth)/onboarding/page.tsx
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { OrgStep } from './steps/OrgStep';
import { RanchStep } from './steps/RanchStep';
import { BlockStep } from './steps/BlockStep';

const STEPS = ['organization', 'ranch', 'block'] as const;
type Step = typeof STEPS[number];

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('organization');
  const [data, setData] = useState({});
  const stepIndex = STEPS.indexOf(step);

  const merge = (partial: object) => setData(d => ({ ...d, ...partial }));
  const next = () => setStep(STEPS[stepIndex + 1]);
  const complete = async () => {
    await apiClient.post('/onboarding', data);
    router.push('/?welcome=1');
  };

  return (
    <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl shadow-xl overflow-hidden">
      {/* Progress bar */}
      <div className="h-1 bg-white/10">
        <div className="h-full bg-gradient-to-r from-[var(--color-ranch-leaf)] to-[var(--color-ranch-sky)] transition-all duration-500"
          style={{ width: `${(stepIndex / (STEPS.length - 1)) * 100}%` }} />
      </div>

      {/* Step pills */}
      <div className="flex items-center justify-center gap-6 py-5 border-b border-white/10">
        {STEPS.map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
              i < stepIndex ? 'bg-leaf text-white' : i === stepIndex ? 'bg-sky text-white ring-4 ring-sky/30' : 'bg-white/10 text-white/40'
            }`}>
              {i < stepIndex ? '✓' : i + 1}
            </div>
            <span className={`text-xs font-medium hidden sm:block ${i === stepIndex ? 'text-white' : 'text-white/40'}`}>{s}</span>
          </div>
        ))}
      </div>

      <div className="p-8">
        {step === 'organization' && <OrgStep onNext={(org) => { merge({ org }); next(); }} />}
        {step === 'ranch' && <RanchStep onNext={(ranch) => { merge({ ranch }); next(); }} onBack={() => setStep('organization')} />}
        {step === 'block' && <BlockStep onComplete={(block) => { merge({ block }); complete(); }} onSkip={complete} onBack={() => setStep('ranch')} />}
      </div>
    </div>
  );
}
```

---

## 5. OrgStep (Step 1)

```tsx
// Fields: Ranch/Company Name, County (dropdown), Language toggle EN/ES,
//         Primary Crop (radio: Almond / Citrus / Both),
//         Organic toggle → if on: certification body dropdown

// Key UI details:
// - County options: Fresno, Tulare, Kings, Kern, Madera, Merced, San Joaquin, Riverside, Ventura
// - Language toggle: pill-style EN | ES, sets i18n.changeLanguage immediately on change
// - Organic section animates in with animate-slide-up when toggle is enabled
// - All inputs use: white/10 bg, white/15 border, sky/50 focus ring
```

---

## 6. RanchStep (Step 2)

```tsx
// Fields: Ranch Name *, Address (text, optional), Total Acres *
//
// Live pricing preview card below the acres field:
//   - Recalculates using calculateMonthlyPrice() from @ranchos/shared on input change
//   - Shows: "Estimated $149/mo · 14-day free trial"
//
// Back button (ghost) + Continue button (primary, full width on mobile)
```

---

## 7. BlockStep (Step 3)

```tsx
// Two choices presented as large clickable cards:
//   Card 1: "✏️ Draw on Map" → href="/blocks/new?fromOnboarding=1"
//   Card 2: "📝 Enter Manually" → opens minimal BlockForm inline
//
// Skip link: "I'll add blocks later" → calls onSkip()
// Note shown: "You can always add blocks from the Blocks page"
//
// If user draws → acreage auto-calculated from polygon → BlockForm pre-filled
// If user manually enters → minimal fields: Name, Crop, Variety, Acreage, Is Organic
```

---

## 8. Welcome Banner (Post-Onboarding)

```tsx
// components/dashboard/WelcomeBanner.tsx
// Shown when URL has ?welcome=1
// Gradient banner: leaf → sky gradient
// Content: "🎉 Welcome to RanchOS!" + CTA buttons:
//   - "Add your first block" → /blocks/new
//   - "Invite crew members" → /settings/team
// Dismiss (X) → router.replace('/') removes query param
```

---

*Continued in `RanchOS_Frontend_E.md` — Settings, Billing, i18n keys, accessibility, and implementation checklist.*
