import { findIcon } from "@/lib/themes";

/** A team's emblem, or nothing at all when they never picked one. */
export default function TeamIcon({
  theme,
  icon,
  size = "sm",
  className = "",
}: {
  theme: string;
  icon: string | null;
  /** `xl` and `2xl` are sized in vh, for the projector board. */
  size?: "sm" | "md" | "lg" | "xl" | "2xl";
  className?: string;
}) {
  const found = findIcon(theme, icon);
  if (!found) return null;
  const box = {
    sm: "h-5 w-5 text-[10px]",
    md: "h-7 w-7 text-xs",
    lg: "h-10 w-10 text-sm",
    xl: "h-[3.4vh] w-[3.4vh] text-[1.5vh]",
    "2xl": "h-[5.5vh] w-[5.5vh] text-[2.4vh]",
  }[size];
  return (
    <span
      title={found.label}
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-semibold leading-none ${box} ${found.tone} ${className}`}
    >
      <span aria-hidden="true">{found.mark}</span>
      <span className="sr-only">{found.label}</span>
    </span>
  );
}
