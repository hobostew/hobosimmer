// The icon drawn in the page matches the icon file (public/icon.svg), so changing one without the other fails here.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { APP_ICON } from "./app-icon";

// Line endings differ by machine (git may check the file out with CRLF), so they're not what's being compared.
const sameLines = (s: string) => s.replace(/\r\n/g, "\n");

describe("the app icon", () => {
  it("is the same as public/icon.svg", () => {
    expect(sameLines(APP_ICON)).toBe(sameLines(readFileSync(new URL("../../public/icon.svg", import.meta.url), "utf8")));
  });
});
