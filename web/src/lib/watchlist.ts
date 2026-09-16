// Starred symbols, kept in localStorage (per browser). Exposed through useSyncExternalStore so every
// star button and filter pill re-renders together.
import { useSyncExternalStore } from "react";

const KEY = "nse-swing.watchlist.v1";
const listeners = new Set<() => void>();
let cache: string[] | null = null;

function read(): string[] {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(KEY);
    const arr = raw ? (JSON.parse(raw) as unknown) : [];
    cache = Array.isArray(arr) ? arr.filter((x): x is string => typeof x === "string") : [];
  } catch { cache = []; }
  return cache;
}
function write(next: string[]) {
  cache = next;
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* storage blocked: keep in memory */ }
  for (const l of listeners) l();
}
function subscribe(l: () => void) { listeners.add(l); return () => { listeners.delete(l); }; }

export function useWatchlist(): string[] { return useSyncExternalStore(subscribe, read, read); }
export function isStarred(symbol: string): boolean { return read().includes(symbol); }
export function toggleStar(symbol: string): void {
  const cur = read();
  write(cur.includes(symbol) ? cur.filter((s) => s !== symbol) : [...cur, symbol].sort());
}
export function clearWatchlist(): void { write([]); }
export function importWatchlist(symbols: string[]): void { write(Array.from(new Set([...read(), ...symbols.map((s) => s.trim().toUpperCase()).filter(Boolean)])).sort()); }
