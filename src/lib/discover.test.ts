// Finding new recipes, with the model and the web both stood in for. What matters here is that nothing the model says
// is believed: a link it made up, a page without a recipe, one they already have, or one with an allergen in it all
// drop out, and only what our own code read off a real page comes back.
import { beforeEach, describe, expect, it, vi } from "vitest";

const generateJson = vi.fn();
vi.mock("./google/gemini", async (actual) => {
  const real = await actual<typeof import("./google/gemini")>();
  return { ...real, generateJson };
});

const PROFILE = ["who,type,value", "Alex,role,Adult", "Alex,allergy,Peanuts"].join("\n");
const RECIPES = [
  "id,name,effort,ingredients,tags,protein,minutes,favorite,tried",
  'have-1,Chicken tacos,quick,"1 lb chicken\n8 tortillas",tacos,chicken,30,yes,yes',
].join("\n");
vi.mock("node:fs/promises", async (actual) => {
  const real = await actual<typeof import("node:fs/promises")>();
  const readFile = (async (p: string, enc: BufferEncoding) => {
    const name = String(p).split(/[\\/]/).pop()!;
    if (name === "profile.csv") return PROFILE;
    if (name === "recipes.csv") return RECIPES;
    return real.readFile(p, enc);
  }) as typeof real.readFile;
  return { ...real, default: { ...real, readFile }, readFile };
});

/** A page with ordinary recipe data on it, as most recipe sites have. */
const page = (name: string, ingredients: string[], tags: string[] = ["dinner"]) => `<html><head>
  <script type="application/ld+json">${JSON.stringify({
    "@type": "Recipe", name, recipeIngredient: ingredients, recipeInstructions: ["Cook it."], totalTime: "PT30M", keywords: tags.join(","),
  })}</script></head><body></body></html>`;

const PAGES: Record<string, string> = {
  "https://example.com/harissa": page("Harissa chicken thighs", ["2 lb chicken thighs", "2 tbsp harissa"]),
  "https://example.com/miso": page("Miso salmon", ["4 salmon fillets", "2 tbsp miso"]),
  "https://example.com/satay": page("Chicken satay", ["1 lb chicken", "1/2 cup peanut butter"]), // an allergy
  "https://example.com/tacos": page("Chicken tacos", ["1 lb chicken", "8 tortillas"]), // already here
  "https://example.com/cake": page("Chocolate cake", ["2 cups flour", "1 cup cocoa"], ["dessert"]), // not a dinner
  "https://example.com/empty": "<html><body>No recipe here.</body></html>",
};

const fetchMock = vi.fn(async (url: URL | string) => {
  const html = PAGES[String(url)];
  // A link the model invented: nothing answers.
  if (!html) return new Response("Not found", { status: 404 });
  return new Response(html, { status: 200, headers: { "content-type": "text/html" } });
});
vi.stubGlobal("fetch", fetchMock);

const links = (...urls: string[]) => ({ data: { links: urls.map((url) => ({ url, title: url, why: "like yours" })) }, model: "test", sources: [] });

describe("finding new recipes", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("asks for links only: the prompt's schema has nowhere to put ingredients", async () => {
    const { findNew } = await import("./discover");
    generateJson.mockResolvedValue(links("https://example.com/harissa"));
    await findNew(1);
    const [prompt, schema, opts] = generateJson.mock.calls[0];
    expect(opts.search).toBe(true);
    const fields = Object.keys((schema as { properties: { links: { items: { properties: object } } } }).properties.links.items.properties);
    expect(fields.sort()).toEqual(["title", "url", "why"]);
    expect(prompt).toContain("links only");
  });

  it("reads each page itself, so the ingredients are the page's own", async () => {
    const { findNew } = await import("./discover");
    generateJson.mockResolvedValue(links("https://example.com/harissa"));
    const { drafts } = await findNew(1);
    expect(drafts).toHaveLength(1);
    expect(drafts[0].name).toBe("Harissa chicken thighs");
    expect(drafts[0].ingredients).toEqual(["2 lb chicken thighs", "2 tbsp harissa"]);
    expect(drafts[0].source).toBe("https://example.com/harissa");
    expect(drafts[0].foundAt).toBe("example.com");
    // Found, not cooked: that's what makes it new when the week is planned.
    expect(drafts[0].favorite).toBe(false);
    expect(drafts[0].tried).toBe(false);
  });

  it("drops a link that doesn't answer (one the model made up)", async () => {
    const { findNew } = await import("./discover");
    generateJson.mockResolvedValue(links("https://example.com/invented", "https://example.com/harissa"));
    const { drafts } = await findNew(2);
    expect(drafts.map((d) => d.name)).toEqual(["Harissa chicken thighs"]);
  });

  it("drops a page with no recipe on it", async () => {
    const { findNew } = await import("./discover");
    generateJson.mockResolvedValue(links("https://example.com/empty", "https://example.com/miso"));
    const { drafts } = await findNew(2);
    expect(drafts.map((d) => d.name)).toEqual(["Miso salmon"]);
  });

  it("never brings back something nobody can eat", async () => {
    const { findNew } = await import("./discover");
    generateJson.mockResolvedValue(links("https://example.com/satay", "https://example.com/miso"));
    const { drafts } = await findNew(2);
    expect(drafts.map((d) => d.name)).toEqual(["Miso salmon"]); // the peanut one is gone
  });

  it("drops one they already have, and anything that isn't a dinner", async () => {
    const { findNew } = await import("./discover");
    generateJson.mockResolvedValue(links("https://example.com/tacos", "https://example.com/cake", "https://example.com/harissa"));
    const { drafts } = await findNew(3);
    expect(drafts.map((d) => d.name)).toEqual(["Harissa chicken thighs"]);
  });

  it("stops once it has enough, rather than opening every link", async () => {
    const { findNew } = await import("./discover");
    generateJson.mockResolvedValue(links("https://example.com/harissa", "https://example.com/miso"));
    const { drafts, looked } = await findNew(1);
    expect(drafts).toHaveLength(1);
    expect(looked).toBeLessThanOrEqual(2);
  });

  it("comes back empty, not broken, when the search finds nothing", async () => {
    const { findNew } = await import("./discover");
    generateJson.mockResolvedValue({ data: { links: [] }, model: "test", sources: [] });
    await expect(findNew(2)).resolves.toEqual({ drafts: [], looked: 0 });
  });

  it("gives back what it has when the time's up, rather than nothing", async () => {
    const { findNew } = await import("./discover");
    generateJson.mockResolvedValue(links("https://example.com/harissa", "https://example.com/miso"));
    // A moment already past: it stops before opening anything and still answers.
    const { drafts } = await findNew(2, undefined, Date.now() - 1);
    expect(drafts).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
