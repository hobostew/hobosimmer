import { describe, expect, it } from "vitest";
import { buyAmount } from "./shop";

describe("what a list row shows for an amount", () => {
  it("keeps weights and counts, in nice fractions", () => {
    expect(buyAmount("2")).toBe("2");
    expect(buyAmount("1 1/2 lb")).toBe("1½ lb");
    expect(buyAmount("1/2 lb")).toBe("½ lb");
    expect(buyAmount("1 dozen")).toBe("1 dozen");
  });
  it("drops amounts that don't change what's bought", () => {
    expect(buyAmount("2 tbsp")).toBe("");
    expect(buyAmount("1/4 cup")).toBe("");
    expect(buyAmount("2 cloves")).toBe("");
    expect(buyAmount("to taste")).toBe("");
    // A can's size is what the package holds, not how many to buy.
    expect(buyAmount("15 oz")).toBe("");
    expect(buyAmount("")).toBe("");
  });
  it("leaves the recipe's name out of it", () => {
    expect(buyAmount("2 (Tacos)")).toBe("2");
    expect(buyAmount("1 lb, for chili")).toBe("1 lb");
  });
});
