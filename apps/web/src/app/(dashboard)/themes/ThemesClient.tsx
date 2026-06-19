'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ExternalLink, Leaf, Moon, Palette, Sun } from 'lucide-react';

import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils/cn';
import type { ThemeSummary } from '@/lib/theme-specs';

const ICONS = {
  leaf: Leaf,
  palette: Palette,
  moon: Moon,
} as const;

type ThemesClientProps = {
  themes: ThemeSummary[];
};

export default function ThemesClient({ themes }: ThemesClientProps) {
  const [currentTheme, setCurrentTheme] = useState<string | null>(() => {
    if (typeof window === 'undefined') {
      return null;
    }

    return localStorage.getItem('ranchos-theme');
  });

  const handleApplyTheme = (themeId: string) => {
    themes.forEach((theme) => document.documentElement.classList.remove(theme.id));
    document.documentElement.classList.add(themeId);
    localStorage.setItem('ranchos-theme', themeId);
    setCurrentTheme(themeId);
  };

  return (
    <div className="p-8 max-w-7xl mx-auto w-full animate-fade-in flex flex-col gap-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Visual Themes</h1>
        <p className="theme-text-muted mt-1">
          Select a design system from the Markdown specs in <code>reference_folder/theme</code>.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {themes.map((theme) => {
          const Icon = ICONS[theme.icon];

          return (
            <Card key={theme.id} className="overflow-hidden group hover:shadow-xl transition-all duration-300 border-2 hover:border-sky/50">
              <div
                className="h-32 flex items-center justify-center relative overflow-hidden"
                style={{ background: theme.previewBackground }}
              >
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.32),transparent_45%)]" />
                <Icon className="w-16 h-16 text-white/20 absolute -right-4 -bottom-4 group-hover:scale-110 transition-transform" />
                <Icon className="w-12 h-12 text-white relative z-10" />
              </div>
              <CardHeader>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-xl font-bold">{theme.name}</h3>
                    <p className="theme-text-muted text-sm mt-1">{theme.description}</p>
                  </div>
                  <span
                    className="mt-1 h-3 w-3 rounded-full shrink-0"
                    style={{ backgroundColor: theme.previewAccent }}
                    aria-hidden="true"
                  />
                </div>
              </CardHeader>
              <CardContent className="pt-0 flex flex-col gap-4">
                <div className="flex gap-2">
                  <Button
                    className="w-full"
                    variant={currentTheme === theme.id ? 'secondary' : 'primary'}
                    onClick={() => handleApplyTheme(theme.id)}
                  >
                    {currentTheme === theme.id ? 'Active Theme' : 'Apply Theme'}
                  </Button>
                  <Link
                    href={`/themes/${theme.id}`}
                    className={cn(
                      'inline-flex h-9 w-9 items-center justify-center rounded-lg border transition-colors',
                      'theme-button-outline'
                    )}
                    title={`View ${theme.fileName}`}
                  >
                    <ExternalLink size={16} />
                  </Link>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="bg-sky/5 border border-sky/20 p-6 rounded-2xl flex items-start gap-4">
        <Sun className="text-sky w-6 h-6 shrink-0 mt-1" />
        <div>
          <h4 className="font-bold text-sky-dark text-lg">Theme Specs Are Now Live</h4>
          <p className="text-sm text-[color:var(--color-sky-dark)]/80 mt-1">
            Each theme class is generated from the CSS token block inside its Markdown spec, so updating the file in
            <code> reference_folder/theme</code> updates the app theme source.
          </p>
        </div>
      </div>
    </div>
  );
}
