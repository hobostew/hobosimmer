// Finding new recipes on the web, like the ones the house already likes.
//
// The rule from docs/ARCHITECTURE.md holds here: code owns facts, the model only writes words. The model is asked for
// links and nothing else (its answers can't carry ingredients, times or servings), and every link is then opened and
// read by our own code, the same way a link pasted into Add recipes is. So a page that doesn't exist, or doesn't have
// a recipe on it, simply drops out, and nothing on the grocery list was ever invented.
import { generateJson, hostOf } from "./google/gemini";
import { loadHousehold } from "./data";
import { loadRecipes, parseIngredient, readLink, sameName, type Draft, type Recipe } from "./recipes";
import { hasAllergen, tasteOf, type Taste } from "./taste";
import { isDinner } from "./week";
import { norm } from "./words";

/** How many links to ask for per new recipe wanted: most will be ones we already have, or won't open. */
const PER_WANT = 3;
const MOST_LINKS = 18;
/** Pages are opened a few at a time, so one slow site doesn't hold up the rest. */
const AT_ONCE = 4;

const LINKS_SCHEMA = {
  type: "OBJECT",
  properties: {
    links: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: { url: { type: "STRING" }, title: { type: "STRING" }, why: { type: "STRING" } },
        required: ["url"],
      },
    },
  },
  required: ["links"],
};
type Candidate = { url: string; title?: string; why?: string };

/** What to ask for, in words, from what the house likes. Built here so it can be read and tested. */
export function searchPrompt(t: Taste, want: number): string {
  const likes = [
    t.tags.length ? `They usually cook: ${t.tags.join(", ")}.` : "",
    t.proteins.length ? `Usually with: ${t.proteins.join(", ")}.` : "",
    t.examples.length ? `Favorites of theirs: ${t.examples.join("; ")}.` : "",
    t.minutes ? `A usual one takes about ${t.minutes} minutes.` : "",
    t.mostlyQuick ? "They prefer weeknight dinners of about 30 minutes." : "",
    t.allergies.length ? `Nobody in the house can eat: ${t.allergies.join(", ")}. Never suggest a recipe with these.` : "",
    t.dislikes.length ? `Avoid where you can: ${t.dislikes.join(", ")}.` : "",
  ].filter(Boolean).join(" ");
  // The names already in the collection, so the search doesn't come back with what they already cook.
  const have = t.known.slice(0, 60).join("; ");
  return [
    `Find ${want * PER_WANT} family dinner recipes on the web that this household would like but does not have yet.`,
    likes,
    have ? `They already have these, so do not suggest them or close variations: ${have}.` : "",
    "Search the web and answer with links only: the address of each recipe's own page, its title, and a few words on why it suits them.",
    "Each link must be a real page you found in the search, on an ordinary recipe website, one recipe per page. Do not invent addresses.",
    "Do not include ingredients, times or servings: they are read from the page itself.",
  ].filter(Boolean).join("\n");
}

/** The links the model found. Only their shape is trusted; whether a page is real is settled by opening it. */
async function candidates(t: Taste, want: number): Promise<Candidate[]> {
  const { data } = await generateJson<{ links: Candidate[] }>(
    searchPrompt(t, want), LINKS_SCHEMA, { search: true, timeoutMs: 45_000 },
  );
  const out: Candidate[] = [];
  const seen = new Set(t.seen.map(norm));
  for (const c of data.links ?? []) {
    const url = String(c?.url ?? "").trim();
    if (!/^https?:\/\//i.test(url) || seen.has(norm(url))) continue;
    seen.add(norm(url));
    out.push({ url, title: String(c?.title ?? "").trim(), why: String(c?.why ?? "").trim() });
  }
  return out.slice(0, MOST_LINKS);
}

/** Why a page that was opened still isn't kept. Only for the log: nobody sees these words. */
type Rejected = "unreadable" | "not-a-dinner" | "already-have" | "allergy";

/** One candidate, opened and read by our own code. null when it isn't a recipe we can use. */
async function verify(c: Candidate, have: Recipe[], t: Taste, signal?: AbortSignal): Promise<Draft | Rejected> {
  if (signal?.aborted) return "unreadable";
  // readLink is the same reader Add recipes uses: the page's own recipe data first, the model only as a fallback.
  const found = await readLink(c.url).catch(() => null);
  const d = found?.[0];
  if (!d?.name || !d.ingredients.length) return "unreadable";
  // Read the same way a saved recipe's lines are, so the allergy check sees the items themselves ("peanut butter").
  const r = { name: d.name, ingredients: d.ingredients.map(parseIngredient), tags: d.tags ?? [] };
  if (!isDinner(r)) return "not-a-dinner";
  if (sameName(have, d.name)) return "already-have";
  if (hasAllergen(r, t.allergies)) return "allergy";
  return { ...d, source: c.url, foundAt: hostOf(c.url), favorite: false, tried: false, hidden: false };
}

/** Runs `work` over `items` a few at a time, stopping as soon as `enough` of them have come back. */
async function someOf<I, O>(items: I[], work: (i: I) => Promise<O | null>, enough: number): Promise<O[]> {
  const out: O[] = [];
  for (let i = 0; i < items.length && out.length < enough; i += AT_ONCE) {
    const batch = await Promise.all(items.slice(i, i + AT_ONCE).map(work));
    for (const r of batch) if (r !== null && out.length < enough) out.push(r);
  }
  return out;
}

/**
 * New recipes to try this week: what the house likes turned into a search, the links it finds opened and read here,
 * and the ones that turn out to be real, new dinners answered as drafts (not saved: the caller decides). `looked` is
 * how many links were opened, so the screen can say when a search came back thin.
 */
export async function findNew(want: number, signal?: AbortSignal): Promise<{ drafts: Draft[]; looked: number }> {
  if (want < 1) return { drafts: [], looked: 0 };
  const [all, hh] = await Promise.all([loadRecipes(), loadHousehold()]);
  const taste = tasteOf(all, hh.profile);
  const links = await candidates(taste, want);
  if (!links.length) return { drafts: [], looked: 0 };
  const have = [...all];
  let looked = 0;
  const drafts = await someOf(links, async (c) => {
    looked++;
    const r = await verify(c, have, taste, signal);
    if (typeof r === "string") { console.error("skipped", c.url, r); return null; }
    // Kept as we go, so two pages for the same dish don't both come back.
    have.push({ name: r.name } as Recipe);
    return r;
  }, want);
  return { drafts, looked };
}
