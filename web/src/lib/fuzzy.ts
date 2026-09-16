// Dependency-free fuzzy matcher for symbol / company / sector search.
// Score: exact symbol > symbol prefix > word prefix > ordered-subsequence with gap penalty. 0 = no match.

export function fuzzyScore(query: string, text: string): number {
  const q = query.trim().toLowerCase();
  if (!q) return 1;
  const t = text.toLowerCase();
  if (t === q) return 1000;
  if (t.startsWith(q)) return 800 - t.length;
  const words = t.split(/[\s.,&()-]+/);
  if (words.some((w) => w.startsWith(q))) return 600 - t.length;
  if (t.includes(q)) return 400 - t.indexOf(q);
  // ordered subsequence
  let ti = 0, gaps = 0, last = -1;
  for (const ch of q) {
    const idx = t.indexOf(ch, ti);
    if (idx < 0) return 0;
    if (last >= 0) gaps += idx - last - 1;
    last = idx; ti = idx + 1;
  }
  return Math.max(1, 200 - gaps * 8 - t.length);
}

/** Best score across several fields; the symbol field gets a bonus so ticker hits rank first. */
export function fuzzyRow(query: string, fields: { symbol: string; name?: string | null; sector?: string | null }): number {
  const s = fuzzyScore(query, fields.symbol) * 1.5;
  const n = fields.name ? fuzzyScore(query, fields.name) : 0;
  const c = fields.sector ? fuzzyScore(query, fields.sector) * 0.6 : 0;
  return Math.max(s, n, c);
}
