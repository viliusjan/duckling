import { useEffect, useState } from 'preact/hooks';
import type { Theme } from '@/lib/storage';

const HINT_KEY = 'duckling-theme';

/** Last chosen theme, so the popup opens in the right colours before settings load. Not secret. */
export const themeHint = (): Theme => {
  try {
    const v = localStorage.getItem(HINT_KEY);
    return v === 'light' || v === 'dark' ? v : 'system';
  } catch {
    return 'system';
  }
};

const apply = (theme: Theme) => {
  if (theme === 'system') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(HINT_KEY, theme);
  } catch {
    // storage unavailable: the hint is only a convenience
  }
};

const systemDark = () => matchMedia('(prefers-color-scheme: dark)').matches;

/** Applies the theme to the page and reports whether it's currently dark. */
export function useTheme(theme: Theme): boolean {
  const [sysDark, setSysDark] = useState(systemDark);
  useEffect(() => {
    const mq = matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => setSysDark(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  useEffect(() => apply(theme), [theme]);
  return theme === 'dark' || (theme === 'system' && sysDark);
}
