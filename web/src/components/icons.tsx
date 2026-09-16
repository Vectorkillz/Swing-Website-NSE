// Inline SVG icons (stroke-based, 24px grid). No icon font, no external asset requests.
import type { SVGProps } from "react";

type P = SVGProps<SVGSVGElement> & { size?: number };
function Svg({ size = 16, children, ...rest }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...rest}>
      {children}
    </svg>
  );
}

export const IconScan = (p: P) => <Svg {...p}><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="3" /><path d="M12 4v2M12 18v2M4 12h2M18 12h2" /></Svg>;
export const IconGrid = (p: P) => <Svg {...p}><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></Svg>;
export const IconBolt = (p: P) => <Svg {...p}><path d="M13 2 4 14h7l-1 8 9-12h-7l1-8z" /></Svg>;
export const IconCheck = (p: P) => <Svg {...p}><path d="M4 12.5l5 5L20 6.5" /></Svg>;
export const IconDatabase = (p: P) => <Svg {...p}><ellipse cx="12" cy="5.5" rx="8" ry="3" /><path d="M4 5.5v13c0 1.7 3.6 3 8 3s8-1.3 8-3v-13" /><path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" /></Svg>;
export const IconRefresh = (p: P) => <Svg {...p}><path d="M20 12a8 8 0 1 1-2.34-5.66" /><path d="M20 4v5h-5" /></Svg>;
export const IconClose = (p: P) => <Svg {...p}><path d="M6 6l12 12M18 6 6 18" /></Svg>;
export const IconSort = (p: P) => <Svg {...p} className={`sort-ico ${p.className ?? ""}`}><path d="M12 5v14M6 13l6 6 6-6" /></Svg>;
export const IconTrendUp = (p: P) => <Svg {...p}><path d="M3 17l6-6 4 4 8-8" /><path d="M14 7h7v7" /></Svg>;
export const IconTrendDown = (p: P) => <Svg {...p}><path d="M3 7l6 6 4-4 8 8" /><path d="M14 17h7v-7" /></Svg>;
export const IconInfo = (p: P) => <Svg {...p}><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></Svg>;
export const IconGauge = (p: P) => <Svg {...p}><path d="M4 15a8 8 0 1 1 16 0" /><path d="M12 15l4-5" /><circle cx="12" cy="15" r="1.2" /></Svg>;
export const IconLayers = (p: P) => <Svg {...p}><path d="M12 3 3 8l9 5 9-5-9-5z" /><path d="M3 12l9 5 9-5" /><path d="M3 16l9 5 9-5" /></Svg>;
export const IconStar = ({ filled = false, ...p }: P & { filled?: boolean }) => <Svg {...p} fill={filled ? "currentColor" : "none"}><path d="M12 3.5l2.7 5.6 6.1.8-4.5 4.3 1.1 6.1L12 17.4l-5.4 2.9 1.1-6.1L3.2 9.9l6.1-.8L12 3.5z" /></Svg>;
export const IconFilter = (p: P) => <Svg {...p}><path d="M4 5h16l-6 8v5l-4 2v-7L4 5z" /></Svg>;
export const IconDownload = (p: P) => <Svg {...p}><path d="M12 4v11M7 10l5 5 5-5" /><path d="M4 19h16" /></Svg>;
export const IconSun = (p: P) => <Svg {...p}><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></Svg>;
export const IconMoon = (p: P) => <Svg {...p}><path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" /></Svg>;
export const IconChevronDown = (p: P) => <Svg {...p}><path d="M6 9l6 6 6-6" /></Svg>;

/** Brand mark: two candles (up green, down red) under a rising trend line, on a rounded dark tile. */
export function Logo({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <rect width="64" height="64" rx="14" fill="#0F0F12" />
      <rect x="14" y="30" width="8" height="18" rx="2" fill="#FF334B" /><path d="M18 26v26" stroke="#FF334B" strokeWidth="2" />
      <rect x="28" y="22" width="8" height="18" rx="2" fill="#00E676" /><path d="M32 16v28" stroke="#00E676" strokeWidth="2" />
      <rect x="42" y="14" width="8" height="18" rx="2" fill="#00E676" /><path d="M46 10v26" stroke="#00E676" strokeWidth="2" />
      <path d="M10 46 L24 36 L36 40 L54 18" stroke="#F3F4F8" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" opacity="0.9" />
      <path d="M46 18h8v8" stroke="#F3F4F8" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" opacity="0.9" />
    </svg>
  );
}

export const IconClock = (p: P) => <Svg {...p}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></Svg>;
