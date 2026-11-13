import { AppError } from "@/lib/errors";
import { friendly } from "@/lib/friendly";
import { authorized, unauthorized } from "@/lib/auth";
import { findNew } from "@/lib/discover";
import { fromDraft, loadRecipes, saveRecipes } from "@/lib/recipes";

// A search, then a handful of pages opened and read: the slowest thing Simmer does. The app runs it through wait().
export const maxDuration = 120;

/**
 * POST { want }: that many new recipes found on the web, like the favorites, read from their own pages and saved
 * (not planned: Meals does that). Answers with the ones found and `looked`, how many pages were opened, so the screen
 * can say when a search came back with fewer than were asked for.
 */
export async function POST(req: Request) {
  if (!authorized(req)) return unauthorized();
  const b = await req.json().catch(() => null);
  try {
    const want = Math.max(1, Math.min(6, Math.round(Number(b?.want) || 2)));
    const { drafts, looked } = await findNew(want, req.signal);
    if (!drafts.length) throw new AppError("Couldn't find anything new just now. Try again in a minute.");
    // Saved as found: not favorites and not tried, which is what makes them new when the week is planned.
    const saved = await saveRecipes(drafts.map((d) => fromDraft(d)));
    return Response.json({ recipes: await loadRecipes(), found: saved.map((r) => r.id), looked }, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    return Response.json({ error: friendly(e) }, { status: e instanceof AppError ? 400 : 502 });
  }
}
