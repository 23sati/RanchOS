import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';

import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { getThemeById } from '@/lib/theme-specs';

type ThemeSpecPageProps = {
  params: Promise<{
    themeId: string;
  }>;
};

export default async function ThemeSpecPage({ params }: ThemeSpecPageProps) {
  const { themeId } = await params;
  const theme = getThemeById(themeId);

  if (!theme) {
    notFound();
  }

  return (
    <div className="p-8 max-w-5xl mx-auto w-full flex flex-col gap-6">
      <Link
        href="/themes"
        className="inline-flex items-center gap-2 text-sm font-medium theme-text-secondary hover:text-[color:var(--color-text-primary)]"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to themes
      </Link>

      <Card className="overflow-hidden">
        <div className="h-3 w-full" style={{ background: theme.previewBackground }} />
        <CardHeader className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] theme-text-muted">{theme.fileName}</p>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{theme.title}</h1>
            <p className="theme-text-secondary mt-2 max-w-3xl">{theme.summary}</p>
          </div>
        </CardHeader>
        <CardContent>
          <pre className="whitespace-pre-wrap break-words text-sm leading-6 theme-text-secondary font-[var(--font-geist-mono)]">
            {theme.markdown}
          </pre>
        </CardContent>
      </Card>
    </div>
  );
}
