import { createContext, use } from 'react';

export type Theme = 'light' | 'dark';

export const ThemeContext = createContext<{ theme: Theme; toggle: () => void } | null>(null);

export function useTheme() {
  const ctx = use(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside <ThemeProvider>');
  return ctx;
}
