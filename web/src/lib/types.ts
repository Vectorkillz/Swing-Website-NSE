// Types mirror engine/types.py and docs/data-contract.md (schema_version 2).

export type Regime = "BULL" | "BULL_HIGH_VIX" | "NEUTRAL" | "BEAR" | "UNKNOWN";
export type Side = "long" | "short";
export type Band = "A" | "B" | "C";
export type RankStatus = "ranked" | "not_in_top_n";
export type CapBucket = "large" | "mid" | "small" | "micro" | "unknown";
export type MultibaggerLevel = "strong" | "watch" | "none";

export interface RegimeResult {
  regime: Regime;
  longs_allowed: boolean;
  shorts_allowed: boolean;
  nifty_close: number | null;
  nifty_ema_fast: number | null;
  nifty_ema_slow: number | null;
  roc_18m: number | null;
  roc_bars_used: number | null;
  vix: number | null;
  smallcap_confirms: boolean | null;
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
  r_value: number;
  risk_reference_price: number;
  target: number;
  target_rule: "structure" | "min_rr" | "fallback";
  target_structure_level: number | null;
  reward_risk: number;
  target_pct: number;
  extended_target: number;
  extended_target_r: number;
  atr14: number;
  prev_bar_low: number | null;
  breakeven_trigger: number | null;
  trail_weekly_ema: number | null;
  trail_weekly_sma: number | null;
  trail_weekly_ema_len: number | null;
  trail_weekly_sma_len: number | null;
  weekly_bars_available: number | null;
  multibagger_arm_price: number | null;
  notes: string[];
}

export interface MultibaggerTag {
  level: MultibaggerLevel;
  technical_met: number;
  technical_total: number;
  growth_met: boolean;
  criteria: Record<string, boolean | null>;
}

export interface PriceContext {
  high_52w: number | null;
  low_52w: number | null;
  pct_from_52w_high: number | null;
  pct_above_52w_low: number | null;
  atr_pct: number | null;
  roc_20: number | null;
  avg_volume_20: number | null;
}

export interface MomentumLeg {
  found: boolean;
  move_pct: number | null;
  max_daily_pct: number | null;
  leg_high: number | null;
  start_date: string | null;
  end_date: string | null;
  age_bars: number | null;
}

export interface VcpResult {
  valid: boolean;
  depth_pct: number | null;
  vol_dry_pct: number | null;
  stage2: boolean;
}

export interface BarPattern {
  kind: "IB" | "MB" | null;
  trigger: number | null;
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
  roe_source: string | null;
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
  cap_bucket: CapBucket;
  market_cap_cr: number | null;
  multibagger: MultibaggerTag | null;
  context: PriceContext | null;
  leg: MomentumLeg | null;
  vcp: VcpResult | null;
  bar_pattern: BarPattern | null;
  colour_change: boolean | null;
  rs_vs_nifty: number | null;
  short_signals: ShortSignals | null;
  fundamentals: Fundamentals | null;
  rank: number | null;
  rank_status: RankStatus | null;
  rank_reason: string | null;
  warnings: string[];
  reason_text: string;
}

export interface UniverseRow {
  symbol: string;
  name: string | null;
  sector: string | null;
  cap_bucket: CapBucket;
  market_cap_cr: number | null;
  close: number | null;
  last_bar_date: string | null;
  outcome: string;
  stage: "stage2" | "stage4" | "transition" | null;
  above_ema50: boolean | null;
  above_ema200: boolean | null;
  rs_vs_nifty: number | null;
  context: PriceContext | null;
  multibagger: MultibaggerTag | null;
  swing_suitable: boolean | null;
  swing_notes: string[];
  setup_side: Side | null;
}

export interface SymbolStatusRow {
  symbol: string;
  stage_reached: string;
  outcome: string;
  reasons: string[];
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
  ban_list: { available: boolean; source: string | null; as_of: string | null; n: number; live_error?: string | null };
  universe: { source: string; as_of: string; n_symbols: number; age_days?: number; stale: boolean };
  warnings: string[];
  failures: { symbol: string; stage: string; error: string }[];
  cap_buckets: { largecap_min_cr: number; midcap_min_cr: number; smallcap_min_cr: number };
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
    target?: number;
    extended_target?: number;
  };
}

export interface ConfigProfile {
  version: string;
  config_hash: string;
  values: Record<string, unknown>;
}

export interface ConfigSchema {
  title: string;
  properties: Record<string, { description?: string; "x-unit"?: string; "x-group"?: string }>;
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
