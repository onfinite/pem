import type { SerpShoppingItem } from './serpapi.service';

/**
 * Prefer household-name retailers so product links and images are more trustworthy.
 * Scores are relative only (sort descending).
 */
export function scorePreferredRetailer(item: SerpShoppingItem): number {
  const hay = `${item.source} ${item.link}`.toLowerCase();
  if (!hay.trim()) return 0;
  const tiers: [RegExp, number][] = [
    [/amazon\.|\.amazon\.|amzn\.|wholefoodsmarket\./i, 100],
    [/walmart\.|samsclub\./i, 98],
    [/target\.com/i, 96],
    [/bestbuy\.|best buy/i, 94],
    [/costco\.|costco wholesale/i, 92],
    [/homedepot\.|home depot/i, 90],
    [/lowes\.|lowe's/i, 88],
    [/wayfair\./i, 86],
    [/kohls\.|kohl's/i, 84],
    [/macys\.|macy's|nordstrom\.|nordstrom rack/i, 82],
    [/ebay\./i, 80],
    [/chewy\.|petco\.|petsmart/i, 78],
    [/staples\.|officedepot\.|officemax/i, 76],
    [/newegg\.|bhphotovideo\.|adorama\./i, 74],
    [/rei\.|dickssportinggoods\.|academy\.com/i, 72],
    [/ulta\.|sephora\.|dermstore\./i, 70],
  ];
  for (const [re, score] of tiers) {
    if (re.test(hay)) return score;
  }
  return 0;
}

/** Stable sort: higher retailer score first, then original index. */
export function sortShoppingByPreferredRetailers(
  items: SerpShoppingItem[],
): SerpShoppingItem[] {
  return items
    .map((item, idx) => ({ item, idx, score: scorePreferredRetailer(item) }))
    .sort((a, b) => b.score - a.score || a.idx - b.idx)
    .map(({ item }) => item);
}
