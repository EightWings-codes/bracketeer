/**
 * Tournament themes: one place that decides what a tournament is called,
 * what its emblems look like, and how the signup page moves.
 *
 * A theme is chosen when the tournament is created and can be changed later.
 * It never affects the rules — formats, scoring maths and resolution are
 * identical everywhere. It sets vocabulary, colour, the icon set teams pick
 * their emblem from, and which flourish the registration phase plays.
 *
 * On the beer emblems: the artwork under /public/emblems/beerpong is product
 * photography of the cans, supplied by the organiser who runs this instance.
 * Whoever deploys it is the one asserting they may use those images; the
 * monogram and colour on each entry remain the fallback if the file is gone.
 * Nothing here implies any brewery is involved in this tournament.
 */

export interface ThemeIcon {
  id: string;
  label: string;
  /** Drawn inside the badge — a monogram, or a glyph for pictorial sets. */
  mark: string;
  /** Badge colours, light and dark. */
  tone: string;
  /**
   * Original emblem artwork under /public. Drawn here rather than taken from
   * anyone: a generic object evoking the name — a castle, a peak, an acorn —
   * never a brewery's own logo or wordmark. Falls back to the monogram.
   */
  art?: string;
}

/**
 * Whether the label carries the meaning. A brewery badge is only useful if it
 * says which brewery; "Circle" on a circle is noise.
 */
export function iconLabelIsMeaningful(theme: Theme): boolean {
  return theme.id === "beerpong";
}

/**
 * The emblem a team ends up with. An explicit valid pick wins; otherwise one
 * is assigned, preferring emblems nobody in this tournament has yet so teams
 * stay tellable apart. Falls back to reuse once the set is exhausted.
 */
export function pickIcon(
  themeId: string | null | undefined,
  requested: string | null | undefined,
  taken: Array<string | null>,
  rng: () => number = Math.random,
): string {
  const theme = findTheme(themeId);
  if (requested && isValidIcon(theme.id, requested)) return requested;
  const used = new Set(taken.filter(Boolean) as string[]);
  const free = theme.icons.filter((i) => !used.has(i.id));
  const pool = free.length > 0 ? free : theme.icons;
  return pool[Math.floor(rng() * pool.length) % pool.length]!.id;
}

export interface Theme {
  id: string;
  label: string;
  blurb: string;
  /** Sits next to the tournament name. */
  emblem: string;
  /** Accent used for headings and the signup flourish. */
  accent: string;
  /** What to call the thing teams pick. */
  iconLabel: string;
  iconHint: string;
  /** Applied as creation defaults; the organiser can still override them. */
  defaults: {
    scoreLabel: string;
    allowDraws: boolean;
  };
  /** Word for a playing surface, singular. */
  tableWord: string;
  icons: ThemeIcon[];
}

const neutral = (id: string, label: string, mark: string, tone: string): ThemeIcon => ({ id, label, mark, tone });

/** Beer pong emblems carry a can image; other themes are coloured glyphs. */
const brewed = (id: string, label: string, mark: string, tone: string): ThemeIcon => ({
  id,
  label,
  mark,
  tone,
  art: `/emblems/beerpong/${id}.jpg`,
});

export const THEMES: Theme[] = [
  {
    id: "basic",
    label: "Basic",
    blurb: "Plain and neutral. Works for any sport or game.",
    emblem: "🏆",
    accent: "text-emerald-600 dark:text-emerald-400",
    iconLabel: "Team emblem",
    iconHint: "Pick a shape so your team is easy to spot on the schedule.",
    defaults: { scoreLabel: "Points", allowDraws: false },
    tableWord: "Table",
    icons: [
      neutral("circle", "Circle", "●", "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"),
      neutral("square", "Square", "■", "bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300"),
      neutral("triangle", "Triangle", "▲", "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300"),
      neutral("diamond", "Diamond", "◆", "bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300"),
      neutral("star", "Star", "★", "bg-yellow-100 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-300"),
      neutral("hex", "Hex", "⬢", "bg-teal-100 text-teal-700 dark:bg-teal-950 dark:text-teal-300"),
      neutral("bolt", "Bolt", "⚡", "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300"),
      neutral("heart", "Heart", "♥", "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300"),
    ],
  },
  {
    id: "beerpong",
    label: "Beer pong",
    blurb: "Cups, tables and a beer to play under.",
    emblem: "🍺",
    accent: "text-amber-600 dark:text-amber-400",
    iconLabel: "Your brewery",
    iconHint: "Pick the beer your team plays under — it shows up next to your name.",
    defaults: { scoreLabel: "Cups", allowDraws: false },
    tableWord: "Table",
    icons: [
      brewed("adler-braeu", "Adler Bräu", "AB", "bg-red-700 text-white"),
      brewed("appenzeller-brandloescher", "Appenzeller Brandlöscher", "AP", "bg-blue-700 text-white"),
      brewed("baarer-bier", "Baarer Bier", "BB", "bg-lime-600 text-white"),
      brewed("boxer", "Boxer", "BX", "bg-rose-700 text-white"),
      brewed("calanda", "Calanda", "CA", "bg-amber-600 text-white"),
      brewed("cardinal", "Cardinal", "CD", "bg-emerald-700 text-white"),
      brewed("carlsberg", "Carlsberg", "CB", "bg-indigo-700 text-white"),
      brewed("chopfab", "Chopfab", "CF", "bg-orange-600 text-white"),
      brewed("eichhof", "Eichhof", "EH", "bg-yellow-500 text-yellow-950"),
      brewed("einsiedler", "Einsiedler", "EI", "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"),
      brewed("falken", "Falken", "FK", "bg-teal-600 text-white"),
      brewed("feldschloesschen", "Feldschlösschen", "FS", "bg-violet-700 text-white"),
      brewed("heineken", "Heineken", "HK", "bg-sky-800 text-white"),
      brewed("huerlimann", "Hürlimann", "HU", "bg-green-700 text-white"),
      brewed("ittinger", "Ittinger", "IT", "bg-fuchsia-700 text-white"),
      brewed("quoellfrisch", "Quöllfrisch", "QF", "bg-cyan-700 text-white"),
      brewed("rugenbraeu", "Rugenbräu", "RB", "bg-stone-700 text-white"),
      brewed("schuetzengarten", "Schützengarten", "SG", "bg-pink-700 text-white"),
      brewed("sonnenbraeu", "Sonnenbräu", "SB", "bg-purple-800 text-white"),
      brewed("unser-bier", "Unser Bier", "UB", "bg-slate-700 text-white"),
      // No can photo for these two yet, so they fall back to the monogram.
      // Teams already playing under them keep their beer instead of losing
      // their emblem entirely when the photo set changed.
      neutral("monstein", "Monstein", "MO", "bg-teal-600 text-white"),
      neutral("valaisanne", "Valaisanne", "VL", "bg-yellow-500 text-yellow-950"),
    ],
  },
  {
    id: "toeggele",
    label: "Töggele",
    blurb: "Tischfussball: goals, draws allowed, and a colour on the rods.",
    emblem: "⚽",
    accent: "text-green-700 dark:text-green-400",
    iconLabel: "Your figures",
    iconHint: "Which colour are your little men? Pick the rods you play.",
    defaults: { scoreLabel: "Goals", allowDraws: true },
    tableWord: "Kasten",
    icons: [
      neutral("rot", "Rot", "⚽", "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300"),
      neutral("blau", "Blau", "⚽", "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300"),
      neutral("gelb", "Gelb", "⚽", "bg-yellow-100 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-300"),
      neutral("gruen", "Grün", "⚽", "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300"),
      neutral("schwarz", "Schwarz", "⚽", "bg-zinc-200 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200"),
      neutral("weiss", "Weiss", "⚽", "bg-zinc-100 text-zinc-600 dark:bg-zinc-900 dark:text-zinc-300"),
      neutral("orange", "Orange", "⚽", "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300"),
      neutral("tuerkis", "Türkis", "⚽", "bg-cyan-100 text-cyan-700 dark:bg-cyan-950 dark:text-cyan-300"),
      neutral("pink", "Pink", "⚽", "bg-pink-100 text-pink-700 dark:bg-pink-950 dark:text-pink-300"),
      neutral("violett", "Violett", "⚽", "bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300"),
    ],
  },
];

export const DEFAULT_THEME = THEMES[0]!;

export function findTheme(id: string | null | undefined): Theme {
  return THEMES.find((t) => t.id === id) ?? DEFAULT_THEME;
}

export function findIcon(themeId: string | null | undefined, iconId: string | null | undefined): ThemeIcon | null {
  if (!iconId) return null;
  return findTheme(themeId).icons.find((i) => i.id === iconId) ?? null;
}

/**
 * Artwork the organiser supplied per emblem, as { iconId: url }.
 *
 * Only http(s) survives, and only for emblems the theme actually has, so a
 * stored value cannot turn into a javascript: or data: URL in an <img src>.
 * Nothing here is fetched server-side: the viewer's browser loads it, and the
 * organiser who pasted it is the one deciding they may use that image.
 */
export function parseIconArt(themeId: string | null | undefined, raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const theme = findTheme(themeId);
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value !== "string") continue;
    const url = value.trim();
    if (!url || !/^https?:\/\//i.test(url)) continue;
    if (!theme.icons.some((i) => i.id === key)) continue;
    out[key] = url;
  }
  return out;
}

/** The image to draw for an emblem: the organiser's, ours, or none. */
export function iconArtwork(icon: ThemeIcon | null, overrides: Record<string, string> = {}): string | null {
  if (!icon) return null;
  return overrides[icon.id] ?? icon.art ?? null;
}

/** A team's icon only makes sense inside its own theme; ids are not shared. */
export function isValidIcon(themeId: string | null | undefined, iconId: string): boolean {
  return findTheme(themeId).icons.some((i) => i.id === iconId);
}

/** Table label, theme-aware: "Table 2", "Kasten 2", or the organiser's own. */
export function tableLabel(theme: Theme, labels: string[], n: number): string {
  return labels[n - 1] ?? `${theme.tableWord} ${n}`;
}
