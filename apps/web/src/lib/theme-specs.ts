import 'server-only';

import fs from 'node:fs';
import path from 'node:path';

type ThemeIconKey = 'leaf' | 'palette' | 'moon';
type ThemeVariables = Record<string, string>;

type ThemePresentation = {
  id: string;
  order: number;
  name: string;
  description: string;
  icon: ThemeIconKey;
  previewBackground?: string;
};

const THEME_PRESENTATION: Record<string, ThemePresentation> = {
  'Theme_2_Orchard_Management_System_Frontend_Spec.md': {
    id: 'theme-2',
    order: 1,
    name: 'Orchid Operations',
    description: 'Colorful and modern with soft gradients and rich icon treatments. Professional and polished.',
    icon: 'palette',
  },
  'OrchardOS_Dark_Modern_Theme.md': {
    id: 'theme-dark',
    order: 2,
    name: 'Dark Modern',
    description: 'Deep charcoal and slate minimalist design. High contrast for early morning and late night work.',
    icon: 'moon',
    previewBackground: 'linear-gradient(135deg, #0f0f0f 0%, #1c1c1c 55%, #333333 100%)',
  },
};

export type ThemeSummary = {
  id: string;
  name: string;
  title: string;
  description: string;
  summary: string;
  icon: ThemeIconKey;
  fileName: string;
  previewBackground: string;
  previewAccent: string;
};

type ThemeRecord = ThemeSummary & {
  markdown: string;
  variables: ThemeVariables;
};

type ThemeRecordWithOrder = ThemeRecord & {
  order: number;
};

let themeCache: ThemeRecord[] | null = null;

function getThemeDirectory() {
  const candidates = [
    path.resolve(process.cwd(), 'reference_folder', 'theme'),
    path.resolve(process.cwd(), '..', 'reference_folder', 'theme'),
    path.resolve(process.cwd(), '..', '..', 'reference_folder', 'theme'),
  ];

  return candidates.find((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) ?? null;
}

function extractHeading(markdown: string) {
  const match = markdown.match(/^#\s+(.+)$/m);
  return match?.[1]?.trim() ?? 'Theme Specification';
}

function extractSection(markdown: string, heading: string) {
  const escapedHeading = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = markdown.match(new RegExp(`##\\s+${escapedHeading}[\\s\\S]*?\\n([\\s\\S]*?)(?=\\n##\\s|$)`, 'i'));
  return match?.[1]?.trim() ?? '';
}

function extractFirstParagraph(section: string) {
  if (!section) {
    return '';
  }

  const normalized = section.replace(/\r/g, '');
  const paragraphs = normalized
    .split('\n\n')
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => {
      if (!paragraph) {
        return false;
      }

      if (paragraph.startsWith('```') || paragraph.startsWith('- ') || paragraph.startsWith('### ')) {
        return false;
      }

      return !/^\d+\.\s/.test(paragraph);
    });

  return paragraphs[0]?.replace(/\n/g, ' ') ?? '';
}

function extractCssVariables(markdown: string) {
  const cssBlockMatch = markdown.match(/```css\s*([\s\S]*?)```/i);
  const cssBlock = cssBlockMatch?.[1] ?? '';
  const rootMatch = cssBlock.match(/:root\s*{([\s\S]*?)}/i);
  const cssBody = rootMatch?.[1] ?? cssBlock;
  const variables: Record<string, string> = {};

  for (const match of cssBody.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    variables[match[1]] = match[2].trim();
  }

  return variables;
}

function pickToken(tokens: Record<string, string>, keys: string[], fallback: string) {
  for (const key of keys) {
    if (tokens[key]) {
      return tokens[key];
    }
  }

  return fallback;
}

function buildThemeVariables(tokens: Record<string, string>): ThemeVariables {
  const backgroundPrimary = pickToken(tokens, ['--bg-page', '--surface-primary'], '#FAFAF9');
  const backgroundSecondary = pickToken(tokens, ['--bg-muted', '--bg-page-alt', '--surface-secondary'], '#F5F3F0');
  const backgroundCard = pickToken(tokens, ['--bg-surface', '--bg-card', '--surface-tertiary', '--surface-secondary'], '#FFFFFF');
  const sidebar = pickToken(tokens, ['--bg-sidebar', '--bg-sidebar-alt', '--neutral-950'], '#1C1917');
  const border = pickToken(tokens, ['--border-soft', '--border-subtle'], '#E7E5E4');
  const isDarkFirstTheme = '--surface-primary' in tokens;
  const sidebarText = isDarkFirstTheme
    ? pickToken(tokens, ['--text-primary'], '#FAFAF9')
    : pickToken(tokens, ['--text-inverse', '--text-primary'], '#FAFAF9');
  const sidebarTextMuted = isDarkFirstTheme
    ? pickToken(tokens, ['--text-secondary', '--neutral-200'], '#D6D3D1')
    : pickToken(tokens, ['--text-inverse', '--text-secondary'], '#F8FAFC');

  return {
    '--color-bg-primary': backgroundPrimary,
    '--color-bg-secondary': backgroundSecondary,
    '--color-bg-card': backgroundCard,
    '--color-bg-sidebar': sidebar,
    '--color-sidebar-text': sidebarText,
    '--color-sidebar-text-muted': sidebarTextMuted,
    '--color-bg-overlay': pickToken(tokens, ['--bg-overlay'], 'rgba(15, 23, 32, 0.55)'),
    '--color-text-primary': pickToken(tokens, ['--text-primary'], '#1C1917'),
    '--color-text-secondary': pickToken(tokens, ['--text-secondary'], '#57534E'),
    '--color-text-muted': pickToken(tokens, ['--text-muted'], '#A8A29E'),
    '--color-text-inverse': pickToken(tokens, ['--text-inverse'], '#FAFAF9'),
    '--color-border': border,
    '--color-border-strong': pickToken(tokens, ['--border-strong'], border),
    '--color-leaf': pickToken(tokens, ['--brand-green-500', '--orchid-green-500', '--accent-primary'], '#3D7A4F'),
    '--color-leaf-dark': pickToken(tokens, ['--brand-green-700', '--orchid-green-700', '--accent-dashboard'], '#2A5738'),
    '--color-leaf-light': pickToken(tokens, ['--brand-lime-400', '--orchid-lime-400', '--status-success'], '#D1FAE5'),
    '--color-sky': pickToken(tokens, ['--brand-sky-500', '--orchid-sky-500', '--status-info'], '#3B8BEB'),
    '--color-sky-dark': pickToken(tokens, ['--brand-sky-600', '--orchid-sky-600', '--accent-irrigation'], '#2466C2'),
    '--color-sky-light': pickToken(tokens, ['--brand-sky-400', '--orchid-teal-500', '--status-info'], '#DBEAFE'),
    '--color-sun': pickToken(tokens, ['--brand-citrus-500', '--orchid-gold-500', '--accent-gold'], '#F5A623'),
    '--color-sun-dark': pickToken(tokens, ['--brand-citrus-600', '--orchid-gold-600', '--accent-bronze'], '#D4851A'),
    '--color-sun-light': pickToken(tokens, ['--brand-orange-500', '--orchid-orange-500', '--status-warning'], '#FEF3C7'),
    '--color-status-success': pickToken(tokens, ['--status-success'], '#16A34A'),
    '--color-status-info': pickToken(tokens, ['--status-info'], '#2563EB'),
    '--color-status-warning': pickToken(tokens, ['--status-warning'], '#F59E0B'),
    '--color-status-danger': pickToken(tokens, ['--status-danger'], '#DC2626'),
    '--color-status-neutral': pickToken(tokens, ['--status-neutral'], '#6B7280'),
  };
}

function buildPreviewBackground(presentation: ThemePresentation, variables: Record<string, string>) {
  if (presentation.previewBackground) {
    return presentation.previewBackground;
  }

  return `linear-gradient(135deg, ${variables['--color-leaf-dark']} 0%, ${variables['--color-leaf']} 52%, ${variables['--color-sun']} 100%)`;
}

function loadThemes() {
  if (themeCache) {
    return themeCache;
  }

  const themeDirectory = getThemeDirectory();
  if (!themeDirectory) {
    themeCache = [];
    return themeCache;
  }

  const themes: ThemeRecord[] = fs
    .readdirSync(themeDirectory)
    .filter((fileName) => fileName.endsWith('.md'))
    .map((fileName) => {
      const presentation = THEME_PRESENTATION[fileName];
      if (!presentation) {
        return null;
      }

      const markdown = fs.readFileSync(path.join(themeDirectory, fileName), 'utf8');
      const tokens = extractCssVariables(markdown);
      const variables = buildThemeVariables(tokens);
      const title = extractHeading(markdown);
      const productDirection = extractSection(markdown, '1. Product Direction');
      const summary = extractFirstParagraph(productDirection) || presentation.description;

      return {
        id: presentation.id,
        name: presentation.name,
        title,
        description: presentation.description,
        summary,
        icon: presentation.icon,
        fileName,
        previewBackground: buildPreviewBackground(presentation, variables),
        previewAccent: variables['--color-leaf'],
        markdown,
        variables,
        order: presentation.order,
      };
    })
    .filter((theme): theme is ThemeRecordWithOrder => theme !== null)
    .sort((left, right) => left.order - right.order)
    .map((theme) => ({
      id: theme.id,
      name: theme.name,
      title: theme.title,
      description: theme.description,
      summary: theme.summary,
      icon: theme.icon,
      fileName: theme.fileName,
      previewBackground: theme.previewBackground,
      previewAccent: theme.previewAccent,
      markdown: theme.markdown,
      variables: theme.variables,
    }));

  themeCache = themes;
  return themeCache;
}

export function getThemeSummaries(): ThemeSummary[] {
  return loadThemes().map((theme) => ({
    id: theme.id,
    name: theme.name,
    title: theme.title,
    description: theme.description,
    summary: theme.summary,
    icon: theme.icon,
    fileName: theme.fileName,
    previewBackground: theme.previewBackground,
    previewAccent: theme.previewAccent,
  }));
}

export function getThemeById(themeId: string) {
  return loadThemes().find((theme) => theme.id === themeId) ?? null;
}

export function getThemeIds() {
  return loadThemes().map((theme) => theme.id);
}

export function getThemeStyleSheet() {
  return loadThemes()
    .map((theme) => {
      const declarations = Object.entries(theme.variables)
        .map(([name, value]) => `  ${name}: ${value};`)
        .join('\n');

      return `.${theme.id} {\n${declarations}\n}`;
    })
    .join('\n\n');
}
