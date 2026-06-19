import ThemesClient from './ThemesClient';
import { getThemeSummaries } from '@/lib/theme-specs';

export default function ThemesPage() {
  return <ThemesClient themes={getThemeSummaries()} />;
}
