// Types mirror engine/types.py and the data contract (docs/data-contract.md).

export type Regime = "BULL" | "BULL_HIGH_VIX" | "NEUTRAL" | "BEAR" | "UNKNOWN";
export type Side = "long" | "short";
export type Band = "A" | "B" | "C";
export type RankStatus =
  | "ranked"
  | "not_in_top_n"
  | "deferred_risk_budget"
  | "deferred_gross_exposure"
  | "deferred_sector_cap"
  | "deferred_max_positions"
  | "already_held";

export interface RegimeResult {
  regime: Regime;
  longs_allowed: boolean;
  shorts_allowed: boolean;
  size_multiplier: number | null;
  nifty_close: number | null;
  nifty_ema_fast: number | null;
  nifty_ema_slow: number | null;
  roc_18m: number | null;
  roc_bars_used: number | null;
  vix: number | null;
  smallcap_confirms: boolean | null;
  smallcap_close: number | null;
  smallcap_ema_fast: number | null;
  smallcap_ema_slow: number | null;
  reasons: string[];
}

export interface ScoreComponent {
  rule_id: string;
  label: string;
  points: number;
  max_points: number;
  matched: boolean;
  value: number | null;
  unit: string | null;
  detail: string | null;
}

export interface ScoreBreakdown {
  side: Side;
  raw: number;
  max_possible: number;
  normalised: number;
  display: number;
  band: Band;
  components: ScoreComponent[];
}

export interface TradePlan {
  side: Side;
  entry: number;
  entry_max: number | null;
  stop: number;
  stop_rule: "pct" | "atr" | "prev_low" | "floor";
  floor_applied: boolean;
  stop_candidates: Record<string, number>;
  stop_distance_pct: number;
  risk_per_share: number;
  sizing_price: number;
  atr14: number;
  prev_bar_low: number | null;
  qty_raw: number;
  qty_after_regime: number;
  qty: number;
  regime_multiplier: number;
  caps_applied: string[];
  position_value: number;
  risk_amount: number;
  r_value: number;
  breakeven_trigger: number | null;
  partial_1_price: number | null;
  partial_1_pct: number | null;
  partial_2_price: number | null;
  partial_2_pct: number | null;
  trail_weekly_ema: number | null;
  trail_weekly_sma: number | null;
  trail_weekly_ema_len: number | null;
  trail_weekly_sma_len: number | null;
  weekly_bars_available: number | null;
  multibagger_arm_price: number | null;
  target_1_price: number | null;
  target_1_pct: number | null;
  target_2_price: number | null;
  target_2_pct: number | null;
  notes: string[];
}

export interface GateCheck {
  field: string;
  value: number | null;
  threshold: number | null;
  op: string;
  outcome: "pass" | "fail" | "missing";
}

export interface MomentumLeg {
  found: boolean;
  move_pct: number | null;
  max_daily_pct: number | null;
  leg_high: number | null;
  leg_mean_volume: number | null;
  start_date: string | null;
  end_date: string | null;
  age_bars: number | null;
  qualifies_by_move: boolean;
  qualifies_by_daily: boolean;
}

export interface VcpResult {
  valid: boolean;
  depth_pct: number | null;
  vol_dry_pct: number | null;
  above_ema10: boolean;
  above_ema20: boolean;
  above_ema50: boolean;
  stage2: boolean;
  recent_mean_volume: number | null;
}

export interface BarPattern {
  kind: "IB" | "MB" | null;
  trigger: number | null;
  pattern_low: number | null;
  bar_date: string | null;
}

export interface ShortSignals {
  stage4: boolean;
  downtrend: boolean;
  double_top: boolean;
  weak_bounce: boolean;
  low_vol_bounce: boolean;
  red_confirm: boolean;
  weak_bounce_method: string;
  bounce_ratio: number | null;
}

export interface Fundamentals {
  market_cap_cr: number | null;
  avg_volume: number | null;
  debt_equity: number | null;
  roe: number | null;
  revenue_growth: number | null;
  eps_growth: number | null;
  fcf_positive: boolean | null;
  sector: string | null;
  industry: string | null;
  name: string | null;
  fetched_at: string | null;
  source: string | null;
}

export interface Candidate {
  symbol: string;
  side: Side;
  sector: string | null;
  name: string | null;
  close: number;
  last_bar_date: string;
  score: ScoreBreakdown;
  plan: TradePlan | null;
  gate: { passed: boolean; checks: GateCheck[]; reason: string | null } | null;
  leg: MomentumLeg | null;
  vcp: VcpResult | null;
  bar_pattern: BarPattern | null;
  colour_change: boolean | null;
  rs_vs_nifty: number | null;
  short_signals: ShortSignals | null;
  fundamentals: Fundamentals | null;
  indicators: Record<string, number | null>;
  rank: number | null;
  rank_status: RankStatus | null;
  rank_reason: string | null;
  warnings: string[];
  reason_text: string;
}

export interface PortfolioBudget {
  capital: number;
  open_positions: number;
  open_gross_value: number;
  open_risk_amount: number;
  accepted_positions: number;
  accepted_gross_value: number;
  accepted_risk_amount: number;
  gross_cap: number;
  risk_cap: number;
  per_sector: Record<string, number>;
}

export interface RunSummary {
  run_id: string;
  session_date: string;
  generated_at: string;
  regime: Regime;
  status: string;
  config_version: string;
  n_longs: number;
  n_shorts: number;
  coverage_pct: number;
}

export interface Run {
  schema_version: number;
  run_id: string;
  session_date: string;
  generated_at: string;
  config_version: string;
  config_hash: string;
  input_hash: string;
  engine_version: string;
  status: string;
  scan_performed: boolean;
  regime: RegimeResult;
  counts: Record<string, number>;
  coverage_pct: number;
  ban_list: { available: boolean; source: string | null; as_of: string | null; n: number; fetch_status?: string; live_error?: string | null };
  universe: { source: string; as_of: string; n_symbols: number; age_days?: number; stale: boolean };
  open_positions_applied: number;
  budget: PortfolioBudget | null;
  warnings: string[];
  failures: { symbol: string; stage: string; error: string }[];
}

export interface SymbolStatus {
  symbol: string;
  stage_reached: string;
  outcome: string;
  reasons: string[];
}

export interface ChartBar {
  d: string; o: number; h: number; l: number; c: number; v: number;
  ema10: number | null; ema20: number | null; ema50: number | null; ema200: number | null;
  sma150: number | null; atr14: number | null; vol20: number | null;
}

export interface ChartPayload {
  symbol: string;
  as_of: string | null;
  daily: ChartBar[];
  weekly: { d: string; c: number; ema: number | null; sma: number | null }[];
  annotations: {
    leg?: { start: string; end: string; high: number; mean_volume: number };
    vcp_depth_pct?: number | null;
    recent_mean_volume?: number | null;
    trigger?: number | null;
    trigger_kind?: string | null;
    entry?: number;
    entry_max?: number | null;
    stop?: number;
  };
}

export interface ConfigProfile {
  version: string;
  config_hash: string;
  values: Record<string, unknown>;
}

export interface ConfigSchema {
  title: string;
  properties: Record<string, { description?: string; "x-unit"?: string; "x-group"?: string; type?: string | string[]; minimum?: number; maximum?: number; exclusiveMinimum?: number; exclusiveMaximum?: number; default?: unknown; enum?: unknown[]; anyOf?: { type: string; enum?: unknown[] }[] }>;
}

export interface JobRecord {
  job: string;
  started_at: string;
  finished_at: string;
  duration_s: number;
  status: string;
  n_errors: number;
  run_id?: string;
  counters: Record<string, unknown>;
}
