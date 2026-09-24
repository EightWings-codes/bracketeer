import { findIcon, findTheme, iconArtwork, iconLabelIsMeaningful } from "@/lib/themes";

/**
 * A team's emblem. Where the label carries the meaning — a brewery, say — the
 * name is shown beside the badge, because "FS" alone tells nobody which beer
 * the team picked. Sets where the badge *is* the meaning (a red circle) stay
 * as a badge only.
 */
export default function TeamIcon({
  theme,
  icon,
  size = "sm",
  withLabel = false,
  art = {},
  className = "",
}: {
  theme: string;
  icon: string | null;
  /** Organiser-supplied artwork per emblem id; wins over the drawn one. */
  art?: Record<string, string>;
  /** `xl` and `2xl` are sized in vh, for the projector board. */
  size?: "sm" | "md" | "lg" | "xl" | "2xl";
  /** Show the emblem's name when the theme's names mean something. */
  withLabel?: boolean;
  className?: string;
}) {
  const found = findIcon(theme, icon);
  if (!found) return null;
  const artwork = iconArtwork(found, art);
  const box = {
    sm: "h-5 w-5 text-[10px]",
    md: "h-7 w-7 text-xs",
    lg: "h-10 w-10 text-sm",
    xl: "h-[3.4vh] w-[3.4vh] text-[1.5vh]",
    "2xl": "h-[5.5vh] w-[5.5vh] text-[2.4vh]",
  }[size];

  const shell = `inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full font-semibold leading-none ${box} ${withLabel ? "" : className}`;

  // Drawn artwork where a theme has it; the coloured monogram otherwise.
  const badge = artwork ? (
    <span title={found.label} className={shell}>
      {/* eslint-disable-next-line @next/next/no-img-element -- a static, already-sized SVG */}
      <img src={artwork} alt="" aria-hidden="true" className="h-full w-full object-cover" />
      <span className="sr-only">{found.label}</span>
    </span>
  ) : (
    <span title={found.label} className={`${shell} ${found.tone}`}>
      <span aria-hidden="true">{found.mark}</span>
      <span className="sr-only">{found.label}</span>
    </span>
  );

  if (!withLabel || !iconLabelIsMeaningful(findTheme(theme))) return badge;

  const text = { sm: "text-[10px]", md: "text-xs", lg: "text-sm", xl: "text-[1.3vh]", "2xl": "text-[1.8vh]" }[size];
  return (
    <span className={`inline-flex min-w-0 items-center gap-1.5 ${className}`}>
      {badge}
      <span className={`truncate font-medium text-zinc-500 dark:text-zinc-400 ${text}`} aria-hidden="true">
        {found.label}
      </span>
    </span>
  );
}
