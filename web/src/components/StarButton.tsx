import { toggleStar, useWatchlist } from "../lib/watchlist";
import { IconStar } from "./icons";

export default function StarButton({ symbol, size = 14 }: { symbol: string; size?: number }) {
  const list = useWatchlist();
  const on = list.includes(symbol);
  return (
    <button type="button" className="star" aria-pressed={on} aria-label={on ? `Remove ${symbol} from watchlist` : `Add ${symbol} to watchlist`} title={on ? "In watchlist" : "Add to watchlist"} onClick={(e) => { e.stopPropagation(); toggleStar(symbol); }} data-testid={`star-${symbol}`}>
      <IconStar size={size} filled={on} />
    </button>
  );
}
