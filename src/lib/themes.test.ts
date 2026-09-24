import { describe, expect, it } from "vitest";
import { DEFAULT_THEME, findIcon, findTheme, isValidIcon, pickIcon, tableLabel, THEMES } from "./themes";

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

describe("emblem assignment", () => {
  const taken: Array<string | null> = [];
  it("keeps an explicit, valid pick", () => {
    expect(pickIcon("beerpong", "calanda", taken)).toBe("calanda");
  });

  it("assigns one when nothing was picked, so nobody is faceless", () => {
    const got = pickIcon("beerpong", null, taken, () => 0);
    expect(isValidIcon("beerpong", got)).toBe(true);
  });

  it("ignores a pick from another theme and assigns instead", () => {
    // "rot" is a töggele colour, not a brewery.
    const got = pickIcon("beerpong", "rot", taken, () => 0);
    expect(got).not.toBe("rot");
    expect(isValidIcon("beerpong", got)).toBe(true);
  });

  it("prefers emblems nobody has yet, then falls back to reuse", () => {
    const all = findTheme("toeggele").icons.map((i) => i.id);
    // Everything but the last is taken: the free one must win regardless of rng.
    const used = all.slice(0, -1);
    expect(pickIcon("toeggele", null, used, () => 0)).toBe(all[all.length - 1]);
    expect(pickIcon("toeggele", null, used, () => 0.99)).toBe(all[all.length - 1]);
    // Once every emblem is taken it has to repeat rather than fail.
    expect(isValidIcon("toeggele", pickIcon("toeggele", null, all, () => 0.99))).toBe(true);
  });
});
