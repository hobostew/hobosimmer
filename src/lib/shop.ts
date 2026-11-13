// The Lists tab's logic, kept out of the screens so it can be tested: how a list item's amount reads on a row.

// Amounts that don't change what's bought: a recipe's spoons, cups and pinches, and parts of a thing (a clove of garlic
// still means one head). Weights and counts do ("1½ lb", "8").
/** Can, tub and bag sizes from a recipe ("15 ounce", "16 oz", "500 g"): what the package holds, not how many to buy. */
const PACKAGE_SIZE = /\b(?:ounces?|oz|fl|ml|millilit(?:er|re)s?|grams?|g|kg|kilograms?|lit(?:er|re)s?|l)\b/i;
const NOT_BUYING = /\b(?:cups?|tablespoons?|tbsps?|tbs|tbsp|teaspoons?|tsps?|tsp|pinch(?:es)?|dash(?:es)?|splash(?:es)?|sprinkles?|drizzles?|handfuls?|cloves?|sprigs?|leaves|leaf|to taste|as needed)\b/i;
const FRACTIONS: Record<string, string> = { "1/2": "½", "1/4": "¼", "3/4": "¾", "1/3": "⅓", "2/3": "⅔", "1/8": "⅛" };

/**
 * A list item's amount as a row shows it: only when it changes what's bought (a weight or a count), never a recipe's
 * name, and "" for spoons, cups and the like. "1 1/2 lb (Tacos)" → "1½ lb", "2 tbsp" → "", "8" → "8".
 */
export function buyAmount(quantity: string): string {
  const q = String(quantity ?? "").replace(/\([^)]*\)/g, " ").split(/,|;|\s+for\s+/i)[0].replace(/\s+/g, " ").trim();
  if (!q || NOT_BUYING.test(q) || PACKAGE_SIZE.test(q) || !/\d|[½¼¾⅓⅔⅛]|\b(?:dozen|couple|few)\b/i.test(q)) return "";
  return q.replace(/\b(\d+)\s+(\d\/\d)\b/g, (m, n, f) => (FRACTIONS[f] ? `${n}${FRACTIONS[f]}` : m)).replace(/\b\d\/\d\b/g, (m) => FRACTIONS[m] ?? m);
}
