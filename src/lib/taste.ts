// What the house likes, worked out from the favorites in plain code (no model): the words that describe them, the
// proteins and the usual cooking time. This is the "facts" half of finding new recipes: discover.ts turns it into a
// search, but nothing here is ever guessed.
import type { Profile } from "./types";
import type { Recipe } from "./recipes";
import { norm } from "./words";

export type Taste = {
  /** The tags that come up most across the favorites, commonest first ("tacos", "one-pan"). */
  tags: string[];
  /** The proteins they're built on, commonest first ("chicken thighs", "ground beef"). */
  proteins: string[];
  /** A few favorites by name, so a search can say "like these". */
  examples: string[];
  /** About how long a favorite takes, when enough of them say: for "about 30 minutes" in a search. */
  minutes: number | null;
  /** Most favorites are quick: then new ones should be too. */
  mostlyQuick: boolean;
  /** Nobody in the house eats these (an allergy is a hard no; a dislike only counts against). */
  allergies: string[];
  dislikes: string[];
  /** Recipes already in the collection, by name, so the same one isn't found again. */
  known: string[];
  /** Hosts already turned down or hidden, so the same page isn't offered twice. */
  seen: string[];
};

/** Words too general to search by: every recipe is "dinner" or "easy". */
const VAGUE = /^(dinner|dinners|lunch|supper|main|mains|main course|entree|entrees|easy|quick|simple|recipe|recipes|food|meal|meals|weeknight|homemade|best|favorite|favourite|healthy|american)$/;

/**
 * The commonest values first, ignoring anything that only turns up once when there's plenty to choose from. Counted by
 * norm (so "taco" and "tacos" are one thing) but answered in the words they were written in, since these go into a
 * search.
 */
function commonest(values: string[], keep: number): string[] {
  const n = new Map<string, { count: number; word: string }>();
  for (const v of values) {
    const k = norm(v), word = v.trim();
    if (!k || !word) continue;
    const at = n.get(k);
    if (at) at.count++;
    else n.set(k, { count: 1, word });
  }
  const sorted = [...n.values()].sort((a, b) => b.count - a.count || a.word.localeCompare(b.word));
  const many = sorted.filter((x) => x.count > 1);
  return (many.length >= 3 ? many : sorted).slice(0, keep).map((x) => x.word.toLowerCase());
}

/** The middle of a set of numbers (the median, so one long braise doesn't drag the usual time up). */
function middle(ns: number[]): number | null {
  if (ns.length < 3) return null;
  const s = [...ns].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
}

/**
 * The house's taste, from the favorites it's been given. `all` is the whole collection: everything in it is already
 * known (so it isn't found again), and what's hidden is remembered as turned down.
 */
export function tasteOf(all: Recipe[], profile: Profile): Taste {
  const favorites = all.filter((r) => r.favorite && !r.hidden);
  // Nothing marked yet: the collection itself is the best guess at what they like.
  const from = favorites.length ? favorites : all.filter((r) => !r.hidden);
  const tags = commonest(from.flatMap((r) => r.tags).filter((t) => !VAGUE.test(norm(t))), 8);
  const proteins = commonest(from.map((r) => r.protein).filter(Boolean), 5);
  const minutes = middle(from.map((r) => r.minutes).filter((m): m is number => typeof m === "number" && m > 0));
  const quick = from.filter((r) => r.effort === "quick").length;
  return {
    tags,
    proteins,
    examples: from.slice(0, 6).map((r) => r.name),
    minutes,
    mostlyQuick: from.length > 0 && quick * 2 > from.length,
    allergies: [...new Set(profile.people.flatMap((p) => p.allergies).map((a) => a.trim()).filter(Boolean))],
    dislikes: [...new Set(profile.people.flatMap((p) => p.dislikes).map((d) => d.trim()).filter(Boolean))],
    known: all.map((r) => r.name),
    seen: [...new Set(all.filter((r) => r.hidden).map((r) => r.source).filter(Boolean))],
  };
}

/** Does a recipe have something nobody in the house can eat? Checked in code, never left to the model. */
export const hasAllergen = (r: Pick<Recipe, "name" | "ingredients">, allergies: string[]) =>
  allergies.some((a) => {
    const n = norm(a);
    return Boolean(n) && (norm(r.name).includes(n) || r.ingredients.some((i) => norm(i.item).includes(n) || norm(i.line).includes(n)));
  });
