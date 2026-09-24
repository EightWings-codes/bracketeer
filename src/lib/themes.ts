/**
 * Tournament themes: one place that decides what a tournament is called,
 * what its emblems look like, and how the signup page moves.
 *
 * A theme is chosen when the tournament is created and can be changed later.
 * It never affects the rules — formats, scoring maths and resolution are
 * identical everywhere. It sets vocabulary, colour, the icon set teams pick
 * their emblem from, and which flourish the registration phase plays.
 *
 * On the beer names: these are labels players recognise, drawn as a monogram
 * on a solid colour of our own choosing, with the brewery's name shown beside
 * it wherever there is room. No brewery's logo, wordmark or artwork is
 * reproduced, and nothing here implies any of them are involved.
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

/** Beer pong emblems ship with drawn artwork; the rest are glyphs. */
const brewed = (id: string, label: string, mark: string, tone: string): ThemeIcon => ({
  id,
  label,
  mark,
  tone,
  art: `/emblems/beerpong/${id}.svg`,
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
    blurb: "Cups, tables and a Swiss brewery to play under.",
    emblem: "🍺",
    accent: "text-amber-600 dark:text-amber-400",
    iconLabel: "Your brewery",
    iconHint: "Pick the beer your team plays under — it shows up next to your name.",
    defaults: { scoreLabel: "Cups", allowDraws: false },
    tableWord: "Table",
    icons: [
      brewed("feldschloesschen", "Feldschlösschen", "FS", "bg-red-700 text-white"),
      brewed("calanda", "Calanda", "CA", "bg-blue-700 text-white"),
      brewed("quoellfrisch", "Quöllfrisch", "QF", "bg-lime-600 text-white"),
      brewed("cardinal", "Cardinal", "CD", "bg-rose-700 text-white"),
      brewed("eichhof", "Eichhof", "EH", "bg-amber-600 text-white"),
      brewed("schuetzengarten", "Schützengarten", "SG", "bg-emerald-700 text-white"),
      brewed("rugenbraeu", "Rugenbräu", "RB", "bg-indigo-700 text-white"),
      brewed("falken", "Falken", "FK", "bg-orange-600 text-white"),
      brewed("valaisanne", "Valaisanne", "VL", "bg-yellow-400 text-yellow-950"),
      brewed("chopfab", "Chopfab", "CF", "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"),
      brewed("monstein", "Monstein", "MO", "bg-teal-600 text-white"),
      brewed("boxer", "Boxer", "BX", "bg-violet-700 text-white"),
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

/** A team's icon only makes sense inside its own theme; ids are not shared. */
export function isValidIcon(themeId: string | null | undefined, iconId: string): boolean {
  return findTheme(themeId).icons.some((i) => i.id === iconId);
}

/** Table label, theme-aware: "Table 2", "Kasten 2", or the organiser's own. */
export function tableLabel(theme: Theme, labels: string[], n: number): string {
  return labels[n - 1] ?? `${theme.tableWord} ${n}`;
}
