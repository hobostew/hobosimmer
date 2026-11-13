import { afterEach, describe, expect, it, vi } from "vitest";
import { checkAgainst, guessIdeas, fromDraft, isoMinutes, loadRecipes, looksLikeIdeas, parseIngredient, readLinks, recipeInPage, saveRecipe, searchRecipes } from "./recipes";

describe("the recipe collection", () => {
  it("reads ingredient lines", () => {
    expect(parseIngredient("1 lb ground turkey")).toMatchObject({ quantity: "1", unit: "lb", item: "ground turkey", section: "fresh" });
    expect(parseIngredient("1/2 cup onion, diced")).toMatchObject({ quantity: "1/2", unit: "cup", item: "onion" });
    expect(parseIngredient("1 ½ cups rice")).toMatchObject({ quantity: "1 1/2", unit: "cups", item: "rice", section: "pantry" });
    expect(parseIngredient("15 ounce can canned pumpkin")).toMatchObject({ quantity: "15", unit: "ounce", item: "canned pumpkin" });
    expect(parseIngredient("1 (15 ounce) can canned pumpkin")).toMatchObject({ unit: "can", item: "canned pumpkin" });
    expect(parseIngredient("2 (15 oz) cans black beans")).toMatchObject({ quantity: "2", unit: "cans", item: "black beans", section: "pantry" });
    expect(parseIngredient("Salt to taste")).toMatchObject({ quantity: "", item: "salt" });
    expect(parseIngredient("1 packet taco seasoning")).toMatchObject({ quantity: "1", unit: "packet", item: "taco seasoning", section: "pantry" });
    expect(parseIngredient("a pinch of cumin")).toMatchObject({ quantity: "1", unit: "pinch", item: "cumin" });
  });

  it("searches by name, ingredient, tag, effort, store and who it's for", async () => {
    const all = await loadRecipes();
    expect(searchRecipes(all, "tacos")[0].name).toBe("Tacos");
    expect(searchRecipes(all, "something with salmon").map((r) => r.name)).toEqual(["Salmon and broccoli"]);
    expect(searchRecipes(all, "black beans").map((r) => r.name)).toEqual(["Turkey chili"]);
    expect(searchRecipes(all, "quick").every((r) => r.effort === "quick")).toBe(true);
    expect(searchRecipes(all, "soup").map((r) => r.name)).toEqual(["Turkey chili"]);
    expect(searchRecipes(all, "quick soup")).toEqual([]);
    expect(searchRecipes(all, "kids").map((r) => r.name)).toContain("Mac and cheese");
  });

  it("saves new recipes and edits in place", async () => {
    const r = fromDraft({ name: " Lemon pasta ", effort: "quick", minutes: 20, serves: 4, protein: "", ingredients: ["1 lb spaghetti", "2 lemons"], steps: ["Boil.", "Toss."], store: "", season: [], for: "everyone", kidOk: "", makeAhead: false, tags: ["Pasta"], source: "Typed in", rating: null, notes: "" });
    expect(r.name).toBe("Lemon pasta");
    await saveRecipe(r);
    await saveRecipe({ ...r, effort: "regular" });
    const all = await loadRecipes();
    expect(all.filter((x) => x.name === "Lemon pasta")).toHaveLength(1);
    expect(all.find((x) => x.id === r.id)?.effort).toBe("regular");
    expect(() => fromDraft({ ...r, ingredients: [], name: "  " })).toThrow();
  });

  it("reads a recipe page's own recipe data", () => {
    const html = `<html><script type="application/ld+json">${JSON.stringify({ "@context": "https://schema.org", "@graph": [{ "@type": "WebPage" }, {
      "@type": ["Recipe"], name: "Sheet-Pan Chicken &amp; Potatoes", totalTime: "PT40M", recipeYield: ["4", "4 servings"],
      recipeIngredient: ["1 1/2 lb chicken thighs", "1 lb baby potatoes"], recipeCategory: "Dinner", keywords: "sheet pan, easy",
      recipeInstructions: [{ "@type": "HowToSection", itemListElement: [{ "@type": "HowToStep", text: "Heat oven to 425." }, { "@type": "HowToStep", text: "Roast 35 minutes." }] }],
    }] })}</script></html>`;
    const d = recipeInPage(html, "https://example.com/chicken")!;
    expect(d).toMatchObject({ name: "Sheet-Pan Chicken & Potatoes", minutes: 40, serves: 4, effort: "regular", steps: ["Heat oven to 425.", "Roast 35 minutes."], source: "https://example.com/chicken" });
    expect(d.ingredients).toHaveLength(2);
    expect(d.tags).toContain("sheet pan");
    expect(recipeInPage("<html>no recipe here</html>", "x")).toBeNull();
    expect(isoMinutes("PT1H30M")).toBe(90);
    expect(isoMinutes("")).toBeNull();
  });

  it("tells a list of meal ideas from a recipe", () => {
    expect(looksLikeIdeas("Tacos\nSalmon and broccoli\n- Chicken soup\nPizza night")).toEqual(["Tacos", "Salmon and broccoli", "Chicken soup", "Pizza night"]);
    expect(looksLikeIdeas("Pancakes\n2 cups flour\n1 egg\nMix and cook")).toBeNull();
    expect(looksLikeIdeas("Chicken stir fry")).toEqual(["Chicken stir fry"]);
    expect(looksLikeIdeas("Chicken stir fry\nBreakfast burritos")).toEqual(["Chicken stir fry", "Breakfast burritos"]);
    expect(looksLikeIdeas("Mix the flour and eggs, then bake for 20 minutes")).toBeNull();
  });

  it("never keeps an amount or time the text didn't have", () => {
    const d = checkAgainst("Grandma's soup: 2 carrots, an onion, cook until soft", { name: "Grandma's soup", minutes: 45, serves: 6, ingredients: ["2 carrots", "1 onion", ""], steps: ["Cook until soft."], effort: "regular" }, "Typed in");
    expect(d.minutes).toBeNull();
    expect(d.serves).toBeNull();
    expect(d.ingredients).toEqual(["2 carrots", "onion"]);
  });
});

describe("a list of favorites, read in one go", () => {
  const page = (name: string) => `<html><script type="application/ld+json">${JSON.stringify({
    "@type": "Recipe", name, recipeIngredient: ["1 lb something"], recipeInstructions: ["Cook."], totalTime: "PT25M",
  })}</script></html>`;
  const PAGES: Record<string, string> = {
    "https://example.com/one": page("Recipe one"),
    "https://example.com/two": page("Recipe two"),
    "https://example.com/three": page("Recipe three"),
  };
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
  const serve = () => vi.stubGlobal("fetch", vi.fn(async (url: URL | string) => {
    const html = PAGES[String(url)];
    return html ? new Response(html, { status: 200, headers: { "content-type": "text/html" } }) : new Response("", { status: 404 });
  }));

  it("reads every link, in order", async () => {
    serve();
    const found = await readLinks(["https://example.com/one", "https://example.com/two", "https://example.com/three"]);
    expect(found.map((d) => d.name)).toEqual(["Recipe one", "Recipe two", "Recipe three"]);
  });

  it("skips the same link twice and blank lines", async () => {
    serve();
    const found = await readLinks(["https://example.com/one", "", "  ", "https://example.com/one"]);
    expect(found.map((d) => d.name)).toEqual(["Recipe one"]);
  });

  it("keeps going when one link won't open", async () => {
    serve();
    vi.spyOn(console, "error").mockImplementation(() => {});
    const found = await readLinks(["https://example.com/gone", "https://example.com/two"]);
    expect(found.map((d) => d.name)).toEqual(["Recipe two"]);
  });

  it("says so when none of them could be read", async () => {
    serve();
    vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(readLinks(["https://example.com/gone", "https://example.com/missing"])).rejects.toThrow(/Couldn't open any/);
  });
});

describe("typed meal ideas", () => {
  it("get an ingredient list each, and are kept without one when the writer fails", async () => {
    const gemini = await import("./google/gemini");
    const spy = vi.spyOn(gemini, "generateJson").mockImplementation((async (prompt: string) => {
      if (prompt.includes("ingredient list")) return { data: { ideas: [{ name: "Tacos", ingredients: ["1 lb ground beef", "8 tortillas", ""] }, { name: "Pizza night", ingredients: ["1 pizza dough"] }] }, model: "m", sources: [] };
      return { data: { ideas: [{ name: "Tacos", effort: "quick" }, { name: "Pizza night", effort: "regular" }] }, model: "m", sources: [] };
    }) as never);
    const made = await guessIdeas(["Tacos", "Pizza night"], "Typed in");
    expect(made.map((d) => d.ingredients)).toEqual([["1 lb ground beef", "8 tortillas"], ["1 pizza dough"]]);
    expect(made[0].effort).toBe("quick");
    spy.mockRejectedValue(new Error("no key"));
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const bare = await guessIdeas(["Tacos", "Pizza night"], "Typed in");
    expect(bare.map((d) => [d.name, d.ingredients])).toEqual([["Tacos", []], ["Pizza night", []]]);
    err.mockRestore(); spy.mockRestore();
  });
});
