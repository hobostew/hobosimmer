// Tests never talk to the real world.
//
// Several things Simmer does fall back on the model when they can't work something out (where a grocery item is
// filed, what a typed idea needs). With a key in the environment those calls really went to Google during a test run,
// so the suite passed or failed on the day's quota and the network — it failed about half the time. Here the key is
// taken away, so that code takes its own fallback path every time and the tests measure Simmer, not Google.
//
// A test that wants the model stubs it itself (vi.mock of ./google/gemini), which still works: this only removes the
// key the real one would need.
import { beforeAll } from "vitest";

beforeAll(() => {
  delete process.env.GEMINI_API_KEY;
  // Redis too: without these, the app reads data/*.csv, which is what the tests are written against.
  delete process.env.KV_REST_API_URL;
  delete process.env.KV_REST_API_TOKEN;
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
});
