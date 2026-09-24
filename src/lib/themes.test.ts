import { describe, expect, it } from "vitest";
import {
  DEFAULT_THEME,
  findIcon,
  findTheme,
  iconArtwork,
  isValidIcon,
  parseIconArt,
  pickIcon,
  tableLabel,
  THEMES,
} from "./themes";

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

describe("organiser-supplied emblem artwork", () => {
  it("keeps http(s) urls for emblems the theme has", () => {
    const art = parseIconArt("beerpong", {
      calanda: "https://example.test/calanda.png",
      eichhof: " http://example.test/eichhof.svg ",
    });
    expect(art).toEqual({
      calanda: "https://example.test/calanda.png",
      eichhof: "http://example.test/eichhof.svg",
    });
  });

  it("drops anything that could not be a safe image source", () => {
    const art = parseIconArt("beerpong", {
      calanda: "javascript:alert(1)",
      eichhof: "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=",
      falken: "/local/path.png",
      boxer: "",
      cardinal: 42,
      // Not an emblem of this theme at all.
      rot: "https://example.test/rot.png",
    });
    expect(art).toEqual({});
  });

  it("survives junk where an object was expected", () => {
    expect(parseIconArt("beerpong", null)).toEqual({});
    expect(parseIconArt("beerpong", "nope")).toEqual({});
    expect(parseIconArt("beerpong", ["https://example.test/a.png"])).toEqual({});
  });

  it("prefers the organiser's artwork, then ours, then nothing", () => {
    const calanda = findIcon("beerpong", "calanda")!;
    expect(iconArtwork(calanda, { calanda: "https://example.test/x.png" })).toBe("https://example.test/x.png");
    // Falls back to the emblem shipped with the theme. The file format is not
    // the point here, so do not pin it — only that it is Calanda's own art.
    expect(iconArtwork(calanda)).toMatch(/^\/emblems\/beerpong\/calanda\.\w+$/);
    // Töggele ships no artwork, so it stays a coloured badge.
    expect(iconArtwork(findIcon("toeggele", "rot"))).toBeNull();
    expect(iconArtwork(null)).toBeNull();
  });
});

describe("shipped emblem artwork", () => {
  it("every beer pong emblem has a file that actually exists", async () => {
    const { existsSync } = await import("node:fs");
    const { join } = await import("node:path");
    // An emblem may ship without a photo — it falls back to the monogram —
    // but one that claims artwork must actually have the file.
    for (const icon of findTheme("beerpong").icons) {
      if (!icon.art) continue;
      expect(existsSync(join(process.cwd(), "public", icon.art)), `missing ${icon.art}`).toBe(true);
    }
  });

  it("has an emblem for every can image in the folder", async () => {
    const { readdirSync } = await import("node:fs");
    const { join } = await import("node:path");
    const onDisk = readdirSync(join(process.cwd(), "public", "emblems", "beerpong"))
      .filter((f) => f.endsWith(".jpg"))
      .map((f) => f.replace(/\.jpg$/, ""))
      .sort();
    const wired = findTheme("beerpong").icons.map((i) => i.id);
    // Dropping a can in the folder and forgetting to wire it should fail here.
    for (const id of onDisk) expect(wired, `${id}.jpg is not wired up`).toContain(id);
  });

  it("leaves themes without artwork on their coloured badges", () => {
    for (const id of ["basic", "toeggele"]) {
      expect(findTheme(id).icons.every((i) => !i.art)).toBe(true);
    }
  });
});
