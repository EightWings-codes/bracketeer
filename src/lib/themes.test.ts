import { describe, expect, it } from "vitest";
import { DEFAULT_THEME, findIcon, findTheme, isValidIcon, tableLabel, THEMES } from "./themes";

describe("themes", () => {
  it("ships the three themes with unique ids and non-empty icon sets", () => {
    expect(THEMES.map((t) => t.id)).toEqual(["basic", "beerpong", "toeggele"]);
    expect(new Set(THEMES.map((t) => t.id)).size).toBe(THEMES.length);
    for (const t of THEMES) {
      expect(t.icons.length).toBeGreaterThan(0);
      expect(new Set(t.icons.map((i) => i.id)).size).toBe(t.icons.length);
    }
  });

  it("falls back to basic for an unknown or missing theme", () => {
    expect(findTheme("nope").id).toBe(DEFAULT_THEME.id);
    expect(findTheme(null).id).toBe("basic");
    expect(findTheme("beerpong").id).toBe("beerpong");
  });

  it("keeps emblems inside their own theme", () => {
    expect(isValidIcon("beerpong", "calanda")).toBe(true);
    // A töggele colour is not a brewery, so it must not survive a theme switch.
    expect(isValidIcon("beerpong", "rot")).toBe(false);
    expect(findIcon("beerpong", "rot")).toBeNull();
    expect(findIcon("beerpong", "calanda")?.label).toBe("Calanda");
    expect(findIcon("beerpong", null)).toBeNull();
  });

  it("names the playing surface per theme, but an organiser's own label wins", () => {
    expect(tableLabel(findTheme("basic"), [], 2)).toBe("Table 2");
    expect(tableLabel(findTheme("toeggele"), [], 2)).toBe("Kasten 2");
    expect(tableLabel(findTheme("toeggele"), ["Beim Fenster"], 1)).toBe("Beim Fenster");
  });

  it("gives töggele draws, since 0:0 is a real football result", () => {
    expect(findTheme("toeggele").defaults.allowDraws).toBe(true);
    expect(findTheme("beerpong").defaults.allowDraws).toBe(false);
    expect(findTheme("beerpong").defaults.scoreLabel).toBe("Cups");
  });
});
