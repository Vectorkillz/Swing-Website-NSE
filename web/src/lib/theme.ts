// Dark (default) / light theme, persisted per browser. Colours live as CSS variables in styles.css and
// Tailwind reads them, so a theme switch is a single attribute flip on <html>.
import { useSyncExternalStore } from "react";

export type Theme = "dark" | "light";
const KEY = "nse-swing.theme";
const listeners = new Set<() => void>();
let current: Theme | null = null;

function read(): Theme {
  if (current) return current;
  try { const v = localStorage.getItem(KEY); current = v === "light" ? "light" : "dark"; } catch { current = "dark"; }
  return current;
}
export function applyTheme(t: Theme) {
  current = t;
  document.documentElement.dataset.theme = t;
  document.documentElement.classList.toggle("dark", t === "dark");
  try { localStorage.setItem(KEY, t); } catch { /* ignore */ }
  for (const l of listeners) l();
}
export function initTheme() { applyTheme(read()); }
export function useTheme(): [Theme, () => void] {
  const t = useSyncExternalStore((l) => { listeners.add(l); return () => { listeners.delete(l); }; }, read, read);
  return [t, () => applyTheme(t === "dark" ? "light" : "dark")];
}
