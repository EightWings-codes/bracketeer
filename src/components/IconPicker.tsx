"use client";

import { useState } from "react";
import type { ThemeIcon } from "@/lib/themes";

/** Grid of the theme's emblems; picking one is optional. */
export default function IconPicker({
  icons,
  name = "icon",
  value = null,
}: {
  icons: ThemeIcon[];
  name?: string;
  value?: string | null;
}) {
  const [picked, setPicked] = useState<string | null>(value);
  return (
    <div className="flex flex-wrap gap-2">
      {icons.map((i) => {
        const on = picked === i.id;
        return (
          <label
            key={i.id}
            title={i.label}
            className={[
              "flex cursor-pointer items-center gap-2 rounded-full border py-1 pl-1 pr-3 text-xs transition",
              on
                ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40"
                : "border-zinc-200 hover:border-emerald-400 dark:border-zinc-800",
            ].join(" ")}
          >
            <input
              type="radio"
              name={name}
              value={i.id}
              checked={on}
              onChange={() => setPicked(i.id)}
              className="sr-only"
            />
            {i.art ? (
              // eslint-disable-next-line @next/next/no-img-element -- static SVG
              <img src={i.art} alt="" aria-hidden="true" className="h-7 w-7 rounded-full" />
            ) : (
              <span
                aria-hidden="true"
                className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-semibold ${i.tone}`}
              >
                {i.mark}
              </span>
            )}
            <span className={on ? "font-medium" : "text-zinc-600 dark:text-zinc-400"}>{i.label}</span>
          </label>
        );
      })}
      {picked !== null && (
        <button
          type="button"
          onClick={() => setPicked(null)}
          className="rounded-full px-3 py-1 text-xs text-zinc-500 underline hover:text-zinc-900 dark:hover:text-zinc-100"
        >
          clear
        </button>
      )}
      {picked === null && <input type="hidden" name={name} value="" />}
    </div>
  );
}
