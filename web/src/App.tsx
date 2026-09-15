import { NavLink, Route, Routes } from "react-router-dom";
import Dashboard from "./pages/Dashboard";
import Candidates from "./pages/Candidates";
import TradePlanPage from "./pages/TradePlan";
import Journal from "./pages/Journal";
import Analytics from "./pages/Analytics";
import ConfigPage from "./pages/Config";
import Runs from "./pages/Runs";
import Admin from "./pages/Admin";

const NAV = [
  ["/", "Dashboard"],
  ["/candidates", "Candidates"],
  ["/journal", "Journal"],
  ["/analytics", "Analytics"],
  ["/config", "Config"],
  ["/runs", "Runs"],
  ["/admin", "Admin"],
] as const;

export default function App() {
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 border-b border-line bg-bg/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2">
          <span className="mr-2 font-semibold">NSE Swing Scanner</span>
          <nav className="flex flex-wrap gap-1 text-sm" aria-label="Main">
            {NAV.map(([to, label]) => (
              <NavLink
                key={to}
                to={to}
                end={to === "/"}
                className={({ isActive }) => `rounded px-2 py-1 hover:bg-panel ${isActive ? "bg-panel text-accent" : "text-muted"}`}
              >
                {label}
              </NavLink>
            ))}
          </nav>
          <span className="ml-auto text-xs text-muted">Rule-match output. Not investment advice.</span>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-3 py-4">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/candidates" element={<Candidates />} />
          <Route path="/candidates/:runId" element={<Candidates />} />
          <Route path="/plan/:runId/:symbol/:side" element={<TradePlanPage />} />
          <Route path="/journal" element={<Journal />} />
          <Route path="/analytics" element={<Analytics />} />
          <Route path="/config" element={<ConfigPage />} />
          <Route path="/runs" element={<Runs />} />
          <Route path="/admin" element={<Admin />} />
        </Routes>
      </main>
    </div>
  );
}
