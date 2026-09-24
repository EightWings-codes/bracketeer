"use client";

import { useState } from "react";
import { THEMES } from "@/lib/themes";

/**
 * Radio group of themes. Shows the emblem, the blurb and the defaults the
 * choice will apply, so nobody has to guess what "Töggele" changes.
 */
export default function ThemePicker({ name = "theme", value }: { name?: string; value?: string }) {
  const [picked, setPicked] = useState(value ?? THEMES[0]!.id);
  return (
    <div className="grid gap-2 sm:grid-cols-3">
      {THEMES.map((t) => {
        const on = picked === t.id;
        return (
          <label
            key={t.id}
            className={[
              "cursor-pointer rounded-xl border p-3 transition",
              on
                ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30"
                : "border-zinc-200 hover:border-emerald-400 dark:border-zinc-800",
            ].join(" ")}
          >
            <input
              type="radio"
              name={name}
              value={t.id}
              checked={on}
              onChange={() => setPicked(t.id)}
              className="sr-only"
            />
            <div className="flex items-center gap-2">
              <span aria-hidden="true" className="text-xl">
                {t.emblem}
              </span>
              <span className="font-medium">{t.label}</span>
            </div>
            <p className="mt-1 text-xs text-zinc-500">{t.blurb}</p>
            <p className="mt-2 text-[11px] text-zinc-400">
              {t.defaults.scoreLabel} · {t.defaults.allowDraws ? "draws allowed" : "no draws"} · {t.tableWord}s ·{" "}
              {t.icons.length} emblems
            </p>
          </label>
        );
      })}
    </div>
  );
}
