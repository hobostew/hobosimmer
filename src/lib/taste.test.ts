import { describe, expect, it } from "vitest";
import { fromDraft, type Draft, type Recipe } from "./recipes";
import { hasAllergen, tasteOf } from "./taste";
import type { Profile } from "./types";

const base: Draft = { name: "", effort: "quick", minutes: null, serves: null, protein: "", ingredients: [], steps: [], store: "", season: [], for: "everyone", kidOk: "", makeAhead: false, tags: [], source: "", rating: null, notes: "" };
const r = (name: string, p: Partial<Draft>): Recipe => fromDraft({ ...base, name, id: name, ...p });

const profile: Profile = {
  household: [],
  people: [
    { key: "a", name: "Alex", role: "Adult", isAdult: true, likes: [], dislikes: ["Olives"], allergies: ["Peanuts"], notes: [], rules: [] },
    { key: "b", name: "Sam", role: "Child, 8", isAdult: false, likes: [], dislikes: ["Mushrooms"], allergies: [], notes: [], rules: [] },
  ],
};

const favorites = [
  r("Chicken tacos", { tags: ["tacos", "mexican", "easy"], protein: "chicken", minutes: 30 }),
  r("Beef tacos", { tags: ["tacos", "mexican", "dinner"], protein: "ground beef", minutes: 25 }),
  r("Sheet pan chicken", { tags: ["one-pan", "roasting"], protein: "chicken", minutes: 40 }),
  r("Stir fry", { tags: ["one-pan", "quick"], protein: "chicken", minutes: 20, effort: "quick" }),
  r("Braise", { tags: ["sunday"], protein: "beef chuck", minutes: 240, effort: "regular" }),
];

describe("what the house likes", () => {
  it("takes the words that come up most, and leaves the vague ones out", () => {
    const t = tasteOf(favorites, profile);
    expect(t.tags).toContain("tacos");
    expect(t.tags).toContain("one-pan");
    // "easy", "dinner" and "quick" describe anything, so they're no use in a search.
    expect(t.tags).not.toContain("easy");
    expect(t.tags).not.toContain("dinner");
    expect(t.tags).not.toContain("quick");
  });

  it("takes the proteins they cook most, commonest first", () => {
    expect(tasteOf(favorites, profile).proteins[0]).toBe("chicken");
  });

  it("uses the middle cooking time, so one long braise doesn't move it", () => {
    expect(tasteOf(favorites, profile).minutes).toBe(30);
  });

  it("notices when most of what they cook is quick", () => {
    const quick = favorites.map((x) => ({ ...x, effort: "quick" as const }));
    expect(tasteOf(quick, profile).mostlyQuick).toBe(true);
    const slow = favorites.map((x) => ({ ...x, effort: "regular" as const }));
    expect(tasteOf(slow, profile).mostlyQuick).toBe(false);
  });

  it("carries the allergies and dislikes through, and what's already here", () => {
    const t = tasteOf(favorites, profile);
    expect(t.allergies).toEqual(["Peanuts"]);
    expect(t.dislikes).toEqual(expect.arrayContaining(["Olives", "Mushrooms"]));
    expect(t.known).toContain("Chicken tacos");
  });

  it("leaves out what was turned down for good, and remembers where it came from", () => {
    const withHidden = [...favorites, r("Never again", { tags: ["liver"], favorite: true, hidden: true, source: "https://example.com/liver" })];
    const t = tasteOf(withHidden, profile);
    expect(t.tags).not.toContain("liver");
    expect(t.seen).toContain("https://example.com/liver");
  });

  it("falls back to the whole collection before anything is marked a favorite", () => {
    const none = favorites.map((x) => ({ ...x, favorite: false }));
    expect(tasteOf(none, profile).tags).toContain("tacos");
  });
});

describe("the allergy check", () => {
  const peanut = r("Thai noodles", { ingredients: ["2 tbsp peanut butter", "8 oz rice noodles"] });
  it("finds the allergen in an ingredient, not just the name", () => {
    // However it's written in the Profile: "Peanuts" still catches "peanut butter".
    expect(hasAllergen(peanut, ["Peanuts"])).toBe(true);
    expect(hasAllergen(peanut, ["peanut"])).toBe(true);
    expect(hasAllergen(peanut, ["shellfish"])).toBe(false);
    expect(hasAllergen(peanut, [])).toBe(false);
  });
  it("finds it in the name too", () => {
    expect(hasAllergen(r("Shrimp scampi", { ingredients: ["1 lb pasta"] }), ["shrimp"])).toBe(true);
  });
});
