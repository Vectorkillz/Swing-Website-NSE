// Minimal toast system: a module-level store (so non-React code like the data layer can raise a toast)
// plus a <Toaster/> that renders it. Toasts auto-dismiss; identical messages within 10s are collapsed.
import { useEffect, useState } from "react";
import { IconClose, IconInfo } from "../components/icons";

export type ToastLevel = "info" | "warn" | "error" | "success";
export interface Toast { id: number; level: ToastLevel; title: string; detail?: string; at: number }

let seq = 0;
let toasts: Toast[] = [];
const listeners = new Set<() => void>();
function emit() { for (const l of listeners) l(); }

export function toast(level: ToastLevel, title: string, detail?: string, ttlMs = 6000): void {
  const now = Date.now();
  if (toasts.some((t) => t.title === title && now - t.at < 10_000)) return;
  const t: Toast = { id: ++seq, level, title, detail, at: now };
  toasts = [...toasts, t].slice(-4);
  emit();
  window.setTimeout(() => dismiss(t.id), ttlMs);
}
export function dismiss(id: number): void { toasts = toasts.filter((t) => t.id !== id); emit(); }

function useToasts(): Toast[] {
  const [, force] = useState(0);
  useEffect(() => { const l = () => force((x) => x + 1); listeners.add(l); return () => { listeners.delete(l); }; }, []);
  return toasts;
}

const CLS: Record<ToastLevel, string> = { info: "border-blue/40", warn: "border-warn/50", error: "border-short/50", success: "border-long/50" };
const DOT: Record<ToastLevel, string> = { info: "bg-blue", warn: "bg-warn", error: "bg-short", success: "bg-long" };

export function Toaster() {
  const list = useToasts();
  if (list.length === 0) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 top-3 z-[70] flex flex-col items-center gap-2 px-3 md:items-end md:pr-6" aria-live="polite" data-testid="toaster">
      {list.map((t) => (
        <div key={t.id} role="status" className={`pointer-events-auto flex w-full max-w-sm items-start gap-2 rounded-xl border bg-panel p-3 text-sm shadow-xl fade-in ${CLS[t.level]}`}>
          <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${DOT[t.level]}`} aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <div className="font-medium">{t.title}</div>
            {t.detail && <div className="text-xs text-muted">{t.detail}</div>}
          </div>
          <button type="button" className="text-muted hover:text-text" onClick={() => dismiss(t.id)} aria-label="Dismiss"><IconClose size={14} /></button>
        </div>
      ))}
      <span className="hidden"><IconInfo /></span>
    </div>
  );
}
