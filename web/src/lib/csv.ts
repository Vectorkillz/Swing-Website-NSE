// Minimal parser for the committed OHLCV CSVs (date,open,high,low,close,volume).

export interface OhlcvBar {
  date: string;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

export function parseOhlcvCsv(text: string): OhlcvBar[] {
  const lines = text.split("\n").filter((l) => l.trim().length > 0);
  if (lines.length <= 1) return [];
  const header = lines[0].split(",").map((h) => h.trim().toLowerCase());
  const idx = (name: string) => header.indexOf(name);
  const iDate = idx("date"), iO = idx("open"), iH = idx("high"), iL = idx("low"), iC = idx("close"), iV = idx("volume");
  const out: OhlcvBar[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",");
    if (cols.length < 6) continue;
    out.push({ date: cols[iDate], o: Number(cols[iO]), h: Number(cols[iH]), l: Number(cols[iL]), c: Number(cols[iC]), v: Number(cols[iV]) });
  }
  return out;
}
