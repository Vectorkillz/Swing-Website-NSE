import type { ReactNode } from "react";
import { NavLink, Route, Routes } from "react-router-dom";
import Scanner from "./pages/Scanner";
import Universe from "./pages/Universe";
import Optionable from "./pages/Optionable";
import Screeners from "./pages/Screeners";
import TrackRecord from "./pages/TrackRecord";
import DataPage from "./pages/Data";
import { useTheme } from "./lib/theme";
import { IconBolt, IconCheck, IconDatabase, IconFilter, IconGrid, IconMoon, IconScan, IconSun, Logo } from "./components/icons";

const NAV: [string, string, string, ReactNode][] = [
  ["/", "Scanner", "Scanner", <IconScan key="s" />],
  ["/optionable", "Optionable Swing Moves", "Optionable", <IconBolt key="o" />],
  ["/screeners", "Screeners", "Screens", <IconFilter key="f" />],
  ["/universe", "Universe", "Universe", <IconGrid key="u" />],
  ["/track-record", "Track record", "Record", <IconCheck key="t" />],
  ["/data", "Data", "Data", <IconDatabase key="d" />],
];

export const LEGAL = "Educational purposes only. Not SEBI-registered investment advice. Data is end-of-day and may be delayed.";

function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const [theme, toggle] = useTheme();
  return (
    <button type="button" className={`btn ${compact ? "px-2 py-1" : "btn-sm"}`} onClick={toggle} aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`} title="Toggle theme" data-testid="theme-toggle" data-theme={theme}>
      {theme === "dark" ? <IconSun size={14} /> : <IconMoon size={14} />}{!compact && <span>{theme === "dark" ? "Light" : "Dark"}</span>}
    </button>
  );
}

export default function App() {
  return (
    <div className="min-h-screen md:grid md:grid-cols-[14rem_1fr]">
      <aside className="hidden md:flex md:flex-col md:gap-1 md:border-r md:border-ink/5 md:p-4 md:sticky md:top-0 md:h-screen">
        <div className="mb-6 flex items-center gap-2 px-2">
          <Logo size={34} />
          <div>
            <div className="text-base font-bold tracking-tight">Swing Scanner</div>
            <div className="text-[11px] text-muted">NSE · end of day</div>
          </div>
        </div>
        {NAV.map(([to, label, , icon]) => (
          <NavLink key={to} to={to} end={to === "/"} className={({ isActive }) => `flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition ${isActive ? "bg-ink/10 text-text" : "text-muted hover:bg-ink/5 hover:text-text"}`}>
            <span className="w-4 text-center">{icon}</span>{label}
          </NavLink>
        ))}
        <div className="mt-auto space-y-3 px-2">
          <ThemeToggle />
          <p className="legal">{LEGAL}</p>
        </div>
      </aside>

      <div className="min-w-0">
        <header className="flex items-center justify-between px-4 py-3 md:hidden">
          <div className="flex items-center gap-2 text-base font-bold"><Logo size={26} />Swing Scanner</div>
          <ThemeToggle compact />
        </header>
        <main className="mx-auto max-w-6xl px-4 pb-28 pt-2 md:px-8 md:pb-14 md:pt-6">
          <Routes>
            <Route path="/" element={<Scanner />} />
            <Route path="/run/:runId" element={<Scanner />} />
            <Route path="/optionable" element={<Optionable />} />
            <Route path="/screeners" element={<Screeners />} />
            <Route path="/universe" element={<Universe />} />
            <Route path="/track-record" element={<TrackRecord />} />
            <Route path="/data" element={<DataPage />} />
          </Routes>
        </main>
        <footer className="fixed inset-x-0 bottom-14 z-10 hidden border-t border-ink/5 bg-bg/90 px-4 py-1.5 text-center backdrop-blur md:left-[14rem] md:bottom-0 md:block" data-testid="legal-footer">
          <span className="legal">{LEGAL}</span>
        </footer>
        <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-ink/5 bg-bg/95 backdrop-blur md:hidden" aria-label="Main">
          <div className="px-3 pt-1 text-center legal text-[10px]">{LEGAL}</div>
          <div className="flex justify-around py-1">
            {NAV.map(([to, , short, icon]) => (
              <NavLink key={to} to={to} end={to === "/"} className={({ isActive }) => `flex flex-col items-center gap-0.5 px-2 py-1 text-[10px] ${isActive ? "text-text" : "text-muted"}`}>
                <span className="text-base">{icon}</span>{short}
              </NavLink>
            ))}
          </div>
        </nav>
      </div>
    </div>
  );
}
