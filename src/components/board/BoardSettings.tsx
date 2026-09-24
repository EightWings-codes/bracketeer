"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { BOARD_LOOKS, BOARD_VIEWS, DEFAULT_DWELL_SEC, DEFAULT_LOOK, type BoardConfig, type BoardViewId } from "@/lib/board";

/**
 * The board's own settings, over the board. Everything it changes is written
 * straight into the query string — the URL stays the single description of
 * what a screen is showing, so a board tuned here can be bookmarked, copied to
 * the second projector, or reopened tomorrow exactly as it was.
 *
 * Meant to be used by someone standing at the laptop, not read from the far
 * side of the room, so it ignores the board's type scale and stays small.
 */
export default function BoardSettings({
  cfg,
  open,
  onClose,
}: {
  cfg: BoardConfig;
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [copied, setCopied] = useState(false);

  const set = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, val] of Object.entries(patch)) {
      if (val === null) next.delete(k);
      else next.set(k, val);
    }
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  // Sliders and the message line would otherwise navigate on every keystroke.
  const commit = useDebounced(set, 300);

  const [scale, setScale] = useState(cfg.scale);
  const [inset, setInset] = useState(cfg.inset);
  const [msg, setMsg] = useState(cfg.msg ?? "");
  const [dwell, setDwell] = useState(() => seconds(cfg));
  useEffect(() => setScale(cfg.scale), [cfg.scale]);
  useEffect(() => setInset(cfg.inset), [cfg.inset]);
  useEffect(() => setMsg(cfg.msg ?? ""), [cfg.msg]);
  useEffect(() => setDwell(seconds(cfg)), [cfg.dwellMs.games, cfg.dwellMs.standings, cfg.dwellMs.schedule]);

  /**
   * One number while all three agree, `games:15,standings:10,schedule:8` the
   * moment they do not — so a board left on the defaults keeps a clean URL.
   */
  const dwellRef = useRef(dwell);
  dwellRef.current = dwell;
  const setOneDwell = (id: BoardViewId, sec: number) => {
    // Through a ref, so dragging one slider straight after another cannot
    // read a value React has not committed yet and drop the earlier change.
    const next = { ...dwellRef.current, [id]: sec };
    dwellRef.current = next;
    setDwell(next);
    const same = new Set(Object.values(next)).size === 1;
    commit({
      dwell: same
        ? next.games === DEFAULT_DWELL_SEC
          ? null
          : String(next.games)
        : BOARD_VIEWS.map((v) => `${v}:${next[v]}`).join(","),
    });
  };

  if (!open) return null;

  const view = cfg.mode === "cycle" ? "cycle" : cfg.mode === "all" ? "all" : cfg.pinned;

  return (
    <>
      <button
        type="button"
        aria-label="Close settings"
        onClick={onClose}
        className="fixed inset-0 z-40 cursor-default bg-black/50"
      />
      <div
        role="dialog"
        aria-label="Board settings"
        className="fixed right-[2vh] top-[2vh] z-50 max-h-[92vh] w-[27rem] max-w-[92vw] overflow-y-auto rounded-xl border p-4 text-sm shadow-2xl"
        style={{ background: "var(--board-panel)", borderColor: "var(--board-line)", color: "var(--board-fg)" }}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-bold">Board settings</h2>
          <button type="button" onClick={onClose} className="board-dim px-2 text-lg leading-none hover:opacity-70">
            ✕
          </button>
        </div>

        <Field label="Show">
          <Segments
            value={view}
            options={[
              ["cycle", "Cycle"],
              ...BOARD_VIEWS.map((v) => [v, v === "games" ? "Games" : v === "standings" ? "Standings" : "Schedule"] as [string, string]),
              ["all", "All at once"],
            ]}
            onPick={(v) => set({ view: v === "cycle" ? null : v })}
          />
        </Field>

        {view === "cycle" && (
          <Field label="Seconds on each view — 0 skips it">
            <div className="space-y-1.5">
              {BOARD_VIEWS.map((id) => (
                <div key={id} className={`flex items-center gap-3 ${dwell[id] === 0 ? "opacity-50" : ""}`}>
                  <span className="w-20 shrink-0 capitalize">{id}</span>
                  <input
                    type="range"
                    min={0}
                    max={60}
                    step={1}
                    value={dwell[id]}
                    onChange={(e) => setOneDwell(id, Number(e.target.value))}
                    className="flex-1"
                  />
                  <span className="w-10 shrink-0 text-right tabular-nums">
                    {dwell[id] === 0 ? "skip" : `${dwell[id]}s`}
                  </span>
                </div>
              ))}
              {BOARD_VIEWS.every((v) => dwell[v] === 0) ? (
                <p className="board-warn text-xs">
                  Everything is skipped, so the board is showing all three anyway. Give at least one of them a time.
                </p>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    const all = dwell.games || DEFAULT_DWELL_SEC;
                    dwellRef.current = { games: all, standings: all, schedule: all };
                    setDwell(dwellRef.current);
                    commit({ dwell: all === DEFAULT_DWELL_SEC ? null : String(all) });
                  }}
                  className="board-dim text-xs underline underline-offset-2 hover:opacity-70"
                >
                  Set all three to {dwell.games || DEFAULT_DWELL_SEC}s
                </button>
              )}
            </div>
          </Field>
        )}

        <Field label="Standings show">
          <Segments
            value={cfg.standings}
            options={[
              ["auto", "By round"],
              ["groups", "Tables"],
              ["bracket", "Tree"],
            ]}
            onPick={(v) => set({ standings: v === "auto" ? null : v })}
          />
        </Field>

        <Field label="Always on screen">
          <div className="flex flex-wrap gap-2">
            <Toggle on={cfg.timer} label="Timer" onPick={() => set({ timer: cfg.timer ? "off" : "on" })} />
            <Toggle on={cfg.qr} label="QR code" onPick={() => set({ qr: cfg.qr ? "off" : "on" })} />
            <Toggle on={cfg.band} label="Title band" onPick={() => set({ band: cfg.band ? "off" : "on" })} />
            <Toggle on={cfg.map} label="Backdrop" onPick={() => set({ map: cfg.map ? "off" : "on" })} />
          </div>
        </Field>

        <Field label="Look">
          <div className="grid grid-cols-2 gap-1.5">
            {BOARD_LOOKS.map((l) => (
              <button
                key={l.id}
                type="button"
                onClick={() => set({ look: l.id === DEFAULT_LOOK.id ? null : l.id, contrast: null })}
                aria-pressed={l.id === cfg.look}
                title={l.blurb}
                className="flex items-center gap-2 rounded-lg border px-2 py-1.5 text-left"
                style={{
                  borderColor: l.id === cfg.look ? "var(--board-accent)" : "var(--board-line)",
                  borderWidth: l.id === cfg.look ? 2 : 1,
                }}
              >
                <span
                  aria-hidden="true"
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border"
                  style={{ background: l.swatch[0], borderColor: "var(--board-line)" }}
                >
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: l.swatch[1] }} />
                </span>
                <span className="min-w-0">
                  <span className="block truncate">{l.label}</span>
                  <span className="board-dim block truncate text-xs">{l.blurb}</span>
                </span>
              </button>
            ))}
          </div>
        </Field>

        <Field label="Text size">
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={0.8}
              max={1.4}
              step={0.05}
              value={scale}
              onChange={(e) => {
                setScale(Number(e.target.value));
                commit({ scale: Number(e.target.value) === 1 ? null : e.target.value });
              }}
              className="flex-1"
            />
            <span className="w-10 text-right tabular-nums">{Math.round(scale * 100)}%</span>
          </div>
        </Field>

        <Field label="Edge margin — for a beamer that crops">
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={0}
              max={10}
              step={1}
              value={inset}
              onChange={(e) => {
                setInset(Number(e.target.value));
                commit({ inset: Number(e.target.value) === 0 ? null : e.target.value });
              }}
              className="flex-1"
            />
            <span className="w-10 text-right tabular-nums">{inset}%</span>
          </div>
        </Field>

        <Field label="Message in the band">
          <input
            value={msg}
            maxLength={120}
            placeholder="Bar closes at 23:00"
            onChange={(e) => {
              setMsg(e.target.value);
              commit({ msg: e.target.value.trim() ? e.target.value : null });
            }}
            className="w-full rounded-lg border bg-transparent px-2 py-1 outline-none"
            style={{ borderColor: "var(--board-line)" }}
          />
        </Field>

        <div className="mt-4 flex flex-wrap items-center gap-2 border-t pt-3" style={{ borderColor: "var(--board-line)" }}>
          <button
            type="button"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(window.location.href);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              } catch {
                setCopied(false);
              }
            }}
            className="rounded-lg px-3 py-1.5 font-medium"
            style={{ background: "var(--board-accent)", color: "var(--board-on-accent)" }}
          >
            {copied ? "Copied" : "Copy board URL"}
          </button>
          <button
            type="button"
            onClick={() => router.replace(pathname, { scroll: false })}
            className="board-dim rounded-lg border px-3 py-1.5"
            style={{ borderColor: "var(--board-line)" }}
          >
            Reset to defaults
          </button>
          <p className="board-dim mt-2 w-full text-xs">
            Every change lands in the address bar, so copy the URL to set a second screen up the same way. Keys:{" "}
            <Key>S</Key> settings · <Key>F</Key> fullscreen · <Key>Space</Key> pause · <Key>←</Key> <Key>→</Key> step ·{" "}
            <Key>1</Key>–<Key>3</Key> jump.
          </p>
        </div>
      </div>
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-3">
      <div className="board-dim mb-1 text-xs uppercase tracking-wide">{label}</div>
      {children}
    </div>
  );
}

function Segments({
  value,
  options,
  onPick,
}: {
  value: string;
  options: [string, string][];
  onPick: (v: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1">
      {options.map(([v, label]) => (
        <button
          key={v}
          type="button"
          onClick={() => onPick(v)}
          aria-pressed={v === value}
          className="rounded-lg border px-2.5 py-1"
          style={
            v === value
              ? { background: "var(--board-accent)", borderColor: "var(--board-accent)", color: "var(--board-on-accent)" }
              : { borderColor: "var(--board-line)" }
          }
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function Toggle({ on, label, onPick }: { on: boolean; label: string; onPick: () => void }) {
  return (
    <button
      type="button"
      onClick={onPick}
      aria-pressed={on}
      className="rounded-lg border px-2.5 py-1"
      style={
        on
          ? { background: "var(--board-accent)", borderColor: "var(--board-accent)", color: "var(--board-on-accent)" }
          : { borderColor: "var(--board-line)", opacity: 0.6 }
      }
    >
      {on ? "✓ " : "✕ "}
      {label}
    </button>
  );
}

function Key({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded border px-1" style={{ borderColor: "var(--board-line)" }}>
      {children}
    </kbd>
  );
}

const seconds = (cfg: BoardConfig): Record<BoardViewId, number> =>
  Object.fromEntries(BOARD_VIEWS.map((v) => [v, cfg.dwellMs[v] / 1000])) as Record<BoardViewId, number>;

/** Ranges and text fields would otherwise push a history entry per keystroke. */
function useDebounced<T extends (...args: never[]) => void>(fn: T, ms: number): T {
  const latest = useRef(fn);
  latest.current = fn;
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  return ((...args: Parameters<T>) => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => latest.current(...args), ms);
  }) as T;
}
