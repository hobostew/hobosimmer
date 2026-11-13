import type { NextConfig } from "next";
import { execSync } from "node:child_process";

// The household's time zone, in one place (src/lib/time.ts reads the same variable).
const TZ = process.env.HOUSEHOLD_TZ || "America/Los_Angeles";

// The release as YY.M.D, with .1, .2 for later releases the same day: counted from today's commits on main.
function version() {
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: TZ }));
  const base = `${now.getFullYear() % 100}.${now.getMonth() + 1}.${now.getDate()}`;
  try {
    const n = Number(execSync("git rev-list --count --first-parent --since=midnight HEAD", { env: { ...process.env, TZ } }).toString().trim());
    return n > 1 ? `${base}.${n - 1}` : base;
  } catch { return base; }
}

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  // Baked into both the app and the server at build time; the app compares them to notice a newer version (see App.tsx).
  env: { NEXT_PUBLIC_BUILD: process.env.VERCEL_GIT_COMMIT_SHA || `local-${Date.now()}`, NEXT_PUBLIC_VERSION: version(), NEXT_PUBLIC_TZ: TZ },
  partialPrefetching: true,
  // Simmer may be framed only by itself, never by other sites.
  headers() {
    return [{ source: "/:path*", headers: [{ key: "Content-Security-Policy", value: "frame-ancestors 'self'" }] }];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
