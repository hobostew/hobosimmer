@AGENTS.md

# Simmer

A family meal planner. Read `docs/ARCHITECTURE.md` before changing anything: it covers the shape of the app, how a week
is planned, how new recipes are found safely, the interface building blocks, and the standing preferences (no technical
words on screen, no background jobs, secrets only in Vercel, no model names in commits or PRs).

**What it does.** Plan the week gives two dinners from the favorites and two new ones found on the web, then puts
everything they need on the grocery list. Cooking a new one and saying whether you liked it is how Simmer learns.

**The one rule that matters most.** Code owns facts; the model writes words. When finding recipes, the model may answer
with links and nothing else (`lib/discover.ts`), and every link is then opened and read by our own code before anything
reaches a shopping list. Never widen that schema to let the model return ingredients.

The screens: `components/Week.tsx` (Meals: the week, and Plan the week), `Lists.tsx` (a checklist per store),
`Stock.tsx` (what the house keeps, and the freezer), `Recipes.tsx` (the collection, the heart, and Add recipes).
The planning rules are plain code with tests in `lib/week.ts` (`planWeek`, `needNew`), what the house likes in
`lib/taste.ts`, and finding new recipes in `lib/discover.ts`. Keep them there.

`npm run dev` needs no setup: it reads `data/*.csv`. Production keeps the same rows in Upstash Redis, which starts
empty — `node scripts/seed.mjs --write` fills it.
