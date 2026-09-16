import type { ReactNode } from "react";
import { NavLink, Route, Routes } from "react-router-dom";
import Scanner from "./pages/Scanner";
import Universe from "./pages/Universe";
import Optionable from "./pages/Optionable";
import TrackRecord from "./pages/TrackRecord";
import DataPage from "./pages/Data";
import { IconBolt, IconCheck, IconDatabase, IconGrid, IconScan } from "./components/icons";

const NAV: [string, string, ReactNode][] = [
  ["/", "Scanner", <IconScan key="s" />],
  ["/optionable", "Optionable Swing Moves", <IconBolt key="o" />],
  ["/universe", "Universe", <IconGrid key="u" />],
  ["/track-record", "Track record", <IconCheck key="t" />],
  ["/data", "Data", <IconDatabase key="d" />],
];

export default function App() {
  return (
    <div className="min-h-screen md:grid md:grid-cols-[14rem_1fr]">
      <aside className="hidden md:flex md:flex-col md:gap-1 md:border-r md:border-white/5 md:p-4 md:sticky md:top-0 md:h-screen">
        <div className="mb-6 flex items-center gap-2 px-2">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-accent/15 text-accent"><IconScan size={18} /></span>
          <div>
            <div className="text-base font-bold tracking-tight">Swing Scanner</div>
            <div className="text-[11px] text-muted">NSE · end of day</div>
          </div>
        </div>
        {NAV.map(([to, label, icon]) => (
          <NavLink key={to} to={to} end={to === "/"} className={({ isActive }) => `flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition ${isActive ? "bg-white/10 text-text" : "text-muted hover:bg-white/5 hover:text-text"}`}>
            <span className="w-4 text-center">{icon}</span>{label}
          </NavLink>
        ))}
        <div className="mt-auto px-2 text-[11px] leading-relaxed text-muted">Rule-match output for study. Not investment advice.</div>
      </aside>

      <div className="min-w-0">
        <header className="flex items-center justify-between px-4 py-3 md:hidden">
          <div className="flex items-center gap-2 text-base font-bold"><span className="text-accent"><IconScan size={18} /></span>Swing Scanner</div>
          <div className="text-[11px] text-muted">NSE · EOD</div>
        </header>
        <main className="mx-auto max-w-6xl px-4 pb-24 pt-2 md:px-8 md:pb-8 md:pt-6">
          <Routes>
            <Route path="/" element={<Scanner />} />
            <Route path="/run/:runId" element={<Scanner />} />
            <Route path="/optionable" element={<Optionable />} />
            <Route path="/universe" element={<Universe />} />
            <Route path="/track-record" element={<TrackRecord />} />
            <Route path="/data" element={<DataPage />} />
          </Routes>
        </main>
        <nav className="fixed inset-x-0 bottom-0 z-20 flex justify-around border-t border-white/5 bg-bg/95 py-2 backdrop-blur md:hidden" aria-label="Main">
          {NAV.map(([to, label, icon]) => (
            <NavLink key={to} to={to} end={to === "/"} className={({ isActive }) => `flex flex-col items-center gap-0.5 px-2 py-1 text-[10px] ${isActive ? "text-text" : "text-muted"}`}>
              <span className="text-base">{icon}</span>{label === "Optionable Swing Moves" ? "Optionable" : label}
            </NavLink>
          ))}
        </nav>
      </div>
    </div>
  );
}
