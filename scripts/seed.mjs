// Fills a new Simmer with the data in data/*.csv.
//
// Why this exists: locally Simmer reads data/*.csv directly, but in production it keeps everything in Upstash Redis,
// and a brand-new Redis is empty — including the Profile, without which nobody is in the household. This writes each
// CSV in as the tab it stands for, the same rows the app reads.
//
//   node scripts/seed.mjs                  what it would write, and nothing else
//   node scripts/seed.mjs --write          writes the tabs that aren't there yet
//   node scripts/seed.mjs --write --force  writes them all, over anything there
//
// It needs KV_REST_API_URL and KV_REST_API_TOKEN (or UPSTASH_REDIS_REST_*) in the environment, as Vercel has them:
//   vercel env pull .env.local    then    node --env-file=.env.local scripts/seed.mjs --write
import { readdir, readFile } from "node:fs/promises";

const dir = new URL("../data/", import.meta.url);
const PREFIX = "simmer:tab:";
/** Which tab each file is, where the name isn't just capitalised ("list.csv" → "List"). */
const TABS = { profile: "Profile", list: "List", staples: "Staples", ingredients: "Ingredients", recipes: "Recipes", lunches: "Lunches" };

const write = process.argv.includes("--write");
const force = process.argv.includes("--force");

const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
if (!url || !token) {
  console.error("No Redis to write to. Set KV_REST_API_URL and KV_REST_API_TOKEN (vercel env pull .env.local).");
  process.exit(1);
}

/** One Upstash command over its REST API. */
async function redis(...command) {
  const r = await fetch(url, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(command),
  });
  if (!r.ok) throw new Error(`Redis ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return (await r.json()).result;
}

/** The same reader the app uses (src/lib/parse.ts), so a seeded tab is exactly what the app would have read. */
function parseCsv(text) {
  const rows = [];
  let row = [], cell = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; }
    else if (c !== "\r") cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim()));
}

const files = (await readdir(dir)).filter((f) => f.endsWith(".csv"));
if (!files.length) { console.error("No data/*.csv to read."); process.exit(1); }

let wrote = 0, skipped = 0;
for (const file of files.sort()) {
  const stem = file.replace(/\.csv$/, "");
  const tab = TABS[stem] ?? stem[0].toUpperCase() + stem.slice(1);
  const rows = parseCsv(await readFile(new URL(file, dir), "utf8"));
  const key = `${PREFIX}${tab}`;
  const there = await redis("GET", key);
  if (there && !force) {
    console.log(`${tab}: already there (${JSON.parse(there).length} rows) — left alone`);
    skipped++;
    continue;
  }
  if (!write) {
    console.log(`${tab}: would write ${rows.length} rows${there ? " (over what's there)" : ""}`);
    continue;
  }
  await redis("SET", key, JSON.stringify(rows));
  console.log(`${tab}: wrote ${rows.length} rows`);
  wrote++;
}

if (!write) console.log("\nNothing was written. Run it again with --write.");
else console.log(`\nDone: ${wrote} written, ${skipped} left alone.`);
