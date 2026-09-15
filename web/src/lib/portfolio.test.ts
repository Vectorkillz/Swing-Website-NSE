import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { applyPortfolioConstraints, rankCandidates, type ConstraintConfig, type SlimCandidate } from "./portfolio";

interface Vector {
  case: number;
  config: ConstraintConfig;
  candidates: SlimCandidate[];
  open_positions: { symbol: string; side: "long" | "short"; sector: string | null; qty: number; entry: number; stop: number; position_value: number; risk_amount: number }[];
  expected: { results: { symbol: string; side: string; rank: number | null; rank_status: string | null }[]; budget: Record<string, unknown> };
}

const file = resolve(__dirname, "../../../data/test_vectors/portfolio_constraints.json");
const vectors = JSON.parse(readFileSync(file, "utf-8")) as { cases: Vector[] };

describe("apply_portfolio_constraints port matches the Python engine", () => {
  for (const v of vectors.cases) {
    it(`case ${v.case}`, () => {
      const ranked = rankCandidates(v.candidates, v.config);
      const { results, budget } = applyPortfolioConstraints(ranked, v.open_positions, v.config);
      const got = results.map((r) => ({ symbol: r.symbol, side: r.side, rank: r.rank, rank_status: r.rank_status }));
      expect(got).toEqual(v.expected.results);
      expect(budget).toEqual(v.expected.budget);
    });
  }
});
