import { useEffect, useRef, type ReactNode } from "react";
import { IconClose } from "./icons";

/** Right-hand slide-over. Closes on Esc, backdrop click or the close button; locks body scroll while open. */
export default function Drawer({ title, onClose, children, label }: { title?: ReactNode; onClose: () => void; children: ReactNode; label: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    window.addEventListener("keydown", onKey);
    document.body.dataset.drawerOpen = "true";
    ref.current?.focus();
    return () => { window.removeEventListener("keydown", onKey); delete document.body.dataset.drawerOpen; };
  }, [onClose]);

  return (
    <>
      <div className="overlay" onClick={onClose} aria-hidden="true" />
      <div ref={ref} className="slideover" role="dialog" aria-modal="true" aria-label={label} tabIndex={-1} data-testid="drawer">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">{title}</div>
          <button type="button" className="btn shrink-0 px-3" onClick={onClose} aria-label="Close detail"><IconClose /></button>
        </div>
        {children}
      </div>
    </>
  );
}
