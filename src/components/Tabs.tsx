"use client";

import { useEffect, useState, type ReactNode } from "react";

export interface Tab {
  id: string;
  label: string;
  content: ReactNode;
}

/**
 * Server-rendered panels, client-side switching: the tab survives the
 * dashboard's 5s refresh, and the hash (#stages) survives a reload and can be
 * shared. Panels stay mounted so switching back doesn't re-scroll the bracket.
 */
export default function Tabs({ tabs }: { tabs: Tab[] }) {
  const [active, setActive] = useState(tabs[0]?.id);
  const ids = tabs.map((t) => t.id).join(",");

  useEffect(() => {
    const fromHash = () => {
      const h = decodeURIComponent(window.location.hash.replace(/^#/, ""));
      if (ids.split(",").includes(h)) setActive(h);
    };
    fromHash();
    window.addEventListener("hashchange", fromHash);
    return () => window.removeEventListener("hashchange", fromHash);
  }, [ids]);

  const select = (id: string) => {
    setActive(id);
    window.history.replaceState(null, "", `#${id}`);
  };

  const first = tabs[0];
  if (!first) return null;
  const current = tabs.some((t) => t.id === active) ? active : first.id;

  return (
    <div>
      <div role="tablist" aria-label="Tournament views" className="flex gap-1 overflow-x-auto border-b border-zinc-200 dark:border-zinc-800">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`tab-${t.id}`}
            aria-selected={t.id === current}
            aria-controls={`panel-${t.id}`}
            onClick={() => select(t.id)}
            className={[
              "-mb-px shrink-0 border-b-2 px-4 py-2 text-sm font-medium transition-colors",
              t.id === current
                ? "border-emerald-600 text-emerald-600 dark:text-emerald-400"
                : "border-transparent text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200",
            ].join(" ")}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tabs.map((t) => (
        <div
          key={t.id}
          role="tabpanel"
          id={`panel-${t.id}`}
          aria-labelledby={`tab-${t.id}`}
          hidden={t.id !== current}
          className="pt-5"
        >
          {t.content}
        </div>
      ))}
    </div>
  );
}
