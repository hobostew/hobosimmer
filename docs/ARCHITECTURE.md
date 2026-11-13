# Simmer: how it's built

Simmer plans a week of dinners from the recipes the house already loves, finds a couple of new ones on the web to try,
and puts everything they need on the grocery list. This page is the shape of the app and the lessons behind it, so
they don't have to be learned twice.

## The shape

- **A home-screen web app for iPhone.** Next.js 16 (App Router, React 19, TypeScript, Tailwind v4) on Vercel. One page
  (`src/app/page.tsx` → `components/App.tsx`); screens are views inside it, not routes. It installs to the home screen
  (`app/manifest.ts`, `public/icon*.png`) and works offline (`public/sw.js`).
- **No accounts.** One household passcode, typed once per phone and sent as the `x-passcode` header. Every API route
  checks it (`lib/auth.ts`, fails closed). `/api/version` is the exception: it's only a build id. There is no notion of
  separate users or households: one deployment is one family's.
- **The data is a set of tabs.** Each is rows, as a spreadsheet would hold them, kept in Upstash Redis
  (`lib/google/redis-tabs.ts`). Parsing is forgiving: columns are matched by header name in any order, values in any
  capitalization, and a bad row is skipped and reported, never fatal (`lib/parse.ts`). Without Redis (local dev, tests)
  the app reads `data/*.csv` instead, so `npm run dev` needs no setup at all. A new Redis starts empty:
  `node scripts/seed.mjs --write` fills it from `data/*.csv`. Settings → Copy to Google Sheet writes everything out to
  a Sheet as a backup; the Sheet is never read.
- **Code owns facts; the model writes words.** This is the rule the whole app leans on. Anything checkable — dates,
  times, quantities, what's in a recipe — comes from code. Gemini (`lib/google/gemini.ts`) suggests and phrases, and is
  never believed on its own. People's names are swapped for roles ("Adult A", "Child, 10") before anything is sent.
- **Errors in plain words.** Server failures become "That didn't load. Try again in a minute." (`lib/friendly.ts`);
  problems written for people are thrown as `AppError` and shown as is. A dropped connection reads "No connection…".

## A week

The Meals tab is the week. With nothing planned it offers one thing: **Plan the week**, which is
`WEEK.favorites` dinners from the favorites and `WEEK.fresh` new ones to try (2 and 2, in `lib/week.ts`).

1. **What's missing is found first.** `needNew` counts how many untried recipes are already in the collection; only the
   shortfall is looked for (`api.discover` → `/api/recipes/discover` → `lib/discover.ts`). This is the slowest thing
   Simmer does — a web search, then several pages opened — so the button rests while it runs.
2. **The week itself is plain code.** `planWeek` picks the favorites, then the new ones, each pick shaping the next
   (the same protein twice running counts against the second). The same collection always gives the same week, and it's
   all unit-tested (`lib/week.test.ts`). Each dinner is still written down as quick or regular, so the rest of the app
   is unchanged: what decides a week is favorite or new, not quick or regular.
3. **The list follows.** Saving the week runs every dinner through `needFor` → `addItems` (`lib/plan.ts`,
   `lib/groceries.ts`): fresh things to buy, pantry things to check in Stock, amounts summed where two dinners share an
   ingredient, tap water and anything in the freezer left out.

## Finding new recipes (`lib/taste.ts`, `lib/discover.ts`)

The risk here is obvious: a model asked for recipes will invent them, and an invented recipe would put invented food on
a real shopping list. So the model is never trusted with a fact:

- **What the house likes is worked out in code.** `tasteOf` tallies the favorites' tags, proteins and usual cooking
  time, and carries the household's allergies and dislikes. No model involved, and tested.
- **The model may answer with links and nothing else.** Its schema has three fields: url, title, why. There is nowhere
  for it to put an ingredient, a time or a serving count.
- **Every link is then opened and read by our own code** — `readLink`, the same reader Add recipes uses, which prefers
  the page's own recipe data. A link that doesn't answer, a page with no recipe on it, a recipe already in the
  collection, one that isn't a dinner, and anything with a household allergy in it all drop out silently
  (`lib/discover.test.ts` covers each). What's left came off a real page.
- **A recipe found this way is saved untried and not a favorite.** That's what makes it one of the week's new ones.

## Learning (the loop that makes it better)

A new recipe's page asks one question after it's cooked: **We loved it** (a favorite: it shapes what's looked for next,
and two favorites go into every week), **It was fine** (tried, so it stops being new), or **Not for us** (hidden: off
every list, never looked for again, and kept so it can't be found a second time). The heart at the top of any recipe
does the same thing at any time. Favorites are the only input to taste, so this one tap is how Simmer learns.

## The interface

Everything comes from `components/ui.tsx`, so every screen looks and behaves the same:

- `TopBar` on every screen: the Simmer lockup top left (it never moves), at most one action then the same Settings
  button top right (`OpenSettings`, set once in `App.tsx`), then one large title in the same place. Drill-in screens
  get a round back chevron before the title, named for the screen below; swiping right also goes back (`useSwipe`).
- Navigation is one back stack in `App.tsx`: a tab (Recipes, Meals, Stock, Lists) with screens pushed on it. Back pops;
  a tab tap starts that tab fresh. Sheets name what they show rather than holding a copy, so a refresh shows in them. A
  passcode turned down by any request (the client sends `SIGNED_OUT`) closes everything and asks for it again.
- `Group`/`Row` (inset grouped lists), `Button` (primary is tinted glass; no gradients on anything you tap), `Sheet`
  (one grabber, pull down to close, rides above the keyboard), `EmptyState`, `IconBadge`.
- Problems are one `Alert` over the page (a short headline, the reason, OK), never a bar that pushes the page; risky
  actions ask first with one `ConfirmSheet`. No Undo, no toasts, no "Saving…": a change shows at once and saves behind
  it; one that fails is put back and the alert says why. A first load with nothing saved here shows `Held`, grey rows
  with a `.shimmer`; no loading words, no spinners.
- Settings ends with the release as YY.M.D (`NEXT_PUBLIC_VERSION`, worked out in `next.config.ts`).
- Type scale `t-*` utilities and colors as CSS variables in `app/globals.css`. Themes set `--accent` and a brand
  gradient (`--g1..g3`) used only on non-interactive brand surfaces.
- One line-icon set (`components/icons.tsx`). No emoji anywhere.

## Lessons worth keeping

- **Dates by the calendar.** Never add 24 hours to get tomorrow: on the nights the clocks change it's wrong. Use
  `addDays`/`dateIn`. Use `hourCycle: "h23"` (some browsers write midnight as 24). The household's zone is `TZ`
  (`HOUSEHOLD_TZ`, baked in at build time so the server and the phone always agree).
- **Updates while the app is open.** An iPhone can keep the app in memory for days. When it comes back to the front on
  a screen at rest, it checks `/api/version` (at most once a minute) and reloads into a new build, returning to the
  same screen.
- **Waits.** Anything slow shows at once and settles behind; never a spinner with no way out. Finding new recipes is
  the one long wait, and the button says what it's doing.
- **Offline.** The shell is cached; data saved on the phone still shows. Coming back online reloads what's needed.
  `localStorage` reads and writes are always wrapped in try/catch.
- **Wrong passcode says so.** The passcode screen shows it as the alert; the button waits for a passcode.
- **Swipes inside a sheet stay in the sheet.**
- **Test at iPhone size (390×844, also 375), light and dark, at clock edges**, offline then online, slow and failed
  requests, and double taps. In headless Chrome with mobile emulation, `dblclick` doesn't tap and two simultaneous taps
  become one two-finger touch: tap twice in sequence instead.

## Standing preferences

- No technical words in anything a person sees: no "Gemini", "Google", "Sheet", "tab", "web", "API".
- No device names either: not "iPhone", "iPad" or "phone". Say "saved", "here" or "your settings" instead.
- No scheduled background jobs. Work happens while someone is using the app (or right after a response, with `after()`).
- No maintenance screens. The data is managed in the app, or in the CSVs before it's seeded.
- Secrets live only in Vercel and on the machine that deploys. Never print them, never commit them.
- Commits and PRs never name the AI model.

## Running it

- `npm run dev` for local work: no Redis, no keys, no setup — it reads `data/*.csv`. Only finding new recipes needs
  `GEMINI_API_KEY`.
- `npm test` (vitest), `npm run lint`, `npx tsc --noEmit`, `npm run build`.
- Browser smoke test (sample data, phone and iPad sizes): start a server with `HOUSEHOLD_PASSCODE=test123`
  (e.g. `npx next dev -p 3202`), then `URL=http://localhost:3202/ node scripts/smoke.cjs`. It needs Playwright, which
  isn't a dependency: `npm install --no-save playwright && npx playwright install chromium`.
- After changing `public/icon.svg`: `npm run icons`.

## Deploying it

Everything below is done once. Steps 1–3 need a browser; the rest is here.

1. **A Gemini key.** [aistudio.google.com/apikey](https://aistudio.google.com/apikey) → Create API key. The free tier
   is plenty for a household. It's only needed to find new recipes and to read a page that won't open for us.
2. **The Vercel project.** `npx vercel login`, then `npx vercel link` (or import the repo at vercel.com). The project
   builds with no configuration: `next build`, nothing else.
3. **A Redis store.** In the project on vercel.com: Storage → Create → Upstash Redis (the free tier is ample: this is
   a few kilobytes of rows). Connecting it sets `KV_REST_API_URL` and `KV_REST_API_TOKEN` for you.
4. **The three variables**, in Settings → Environment Variables, for Production, Preview and Development:
   `HOUSEHOLD_PASSCODE` (what each phone types once), `HOUSEHOLD_TZ` (an IANA name like `America/Los_Angeles`), and
   `GEMINI_API_KEY`. The passcode and the key are secrets: they stay in Vercel, never in the repo, because code is
   copied everywhere and git keeps every version forever.
5. **Deploy**, with `npx vercel --prod` or by pushing to the default branch.
6. **Fill the new Redis**, which starts empty — including the household, without which nobody can be planned for:
   `npx vercel env pull .env.local` then `node --env-file=.env.local scripts/seed.mjs` to see what it would write, and
   again with `--write` to do it. (`.env.local` is git-ignored; delete it afterwards if you like.)
7. **Open it, type the passcode, and add the favorites**: Recipes → Add recipes → From links, pasting as many recipe
   links as you like, one per line. Those become the taste Simmer plans and searches from. Then Meals → Plan the week.
8. **Add it to the home screen** on each phone: open the address in Safari, Share, Add to Home Screen.

A note on timing: finding new recipes is a web search followed by several pages being opened, and Vercel's free plan
stops a request at 60 seconds. `/api/recipes/discover` works to a 50-second budget and answers with whatever it found
by then, so a slow search comes back with one recipe rather than an error. On a paid plan both numbers can go up.
