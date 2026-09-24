"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type { BoardConfig } from "@/lib/board";
import BoardSettings from "./BoardSettings";

export interface BoardSlide {
  id: string;
  label: string;
  dwellMs: number;
  node: ReactNode;
}

/**
 * The frame every board sits in: the chrome that never moves, the one view
 * that does, and the handful of things a screen left running for six hours
 * needs — a wake lock, a hidden cursor, a key to go fullscreen.
 *
 * The views themselves are rendered on the server and handed over as nodes,
 * so cycling costs no round trip and the five-second data refresh flows
 * through without resetting where the rotation had got to.
 */
export default function BoardShell({
  slides,
  band,
  qr,
  qrWide = false,
  cfg,
}: {
  slides: BoardSlide[];
  band: ReactNode;
  qr: ReactNode | null;
  /** Registration is the one phase where the QR is the point of the screen. */
  qrWide?: boolean;
  cfg: BoardConfig;
}) {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const [idle, setIdle] = useState(true);
  const [settings, setSettings] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  // A round can end while the board is on the schedule view, taking a slide
  // with it. Clamp rather than render nothing.
  const index = Math.min(active, slides.length - 1);
  const current = slides[index];
  // Rotating the view out from under whoever is configuring it would be
  // maddening, so the settings panel holds the board still while it is open.
  const cycling = slides.length > 1 && !paused && !settings;

  const go = useCallback(
    (i: number) => {
      setActive(((i % slides.length) + slides.length) % slides.length);
    },
    [slides.length],
  );

  // One timeout per slide rather than a ticking interval: each view sets its
  // own dwell, and restarting it is how a manual step takes over cleanly.
  //
  // The dependencies are primitives on purpose. Fresh data arrives every five
  // seconds and hands this component a whole new `slides` array; depending on
  // the slide object itself would restart the timeout on every refresh, and a
  // ten-second dwell would then never elapse at all.
  const dwellMs = current?.dwellMs ?? 0;
  useEffect(() => {
    if (!cycling || dwellMs <= 0) return;
    const id = setTimeout(() => setActive((i) => (i + 1) % slides.length), dwellMs);
    return () => clearTimeout(id);
  }, [cycling, dwellMs, index, slides.length]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Someone typing the band message must not trip the shortcuts.
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) {
        if (e.key === "Escape") setSettings(false);
        return;
      }
      if (e.key === "Escape") setSettings(false);
      else if (e.key === "s") setSettings((o) => !o);
      else if (e.key === "ArrowRight") go(index + 1);
      else if (e.key === "ArrowLeft") go(index - 1);
      else if (e.key === " ") {
        e.preventDefault();
        setPaused((p) => !p);
      } else if (e.key === "f") void toggleFullscreen(root.current);
      else if (/^[1-9]$/.test(e.key)) {
        const i = Number(e.key) - 1;
        if (i < slides.length) {
          setPaused(true);
          go(i);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, index, slides.length]);

  // The cursor only exists for whoever is setting the board up.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const wake = () => {
      setIdle(false);
      clearTimeout(timer);
      timer = setTimeout(() => setIdle(true), 3000);
    };
    window.addEventListener("mousemove", wake);
    window.addEventListener("mousedown", wake);
    return () => {
      window.removeEventListener("mousemove", wake);
      window.removeEventListener("mousedown", wake);
      clearTimeout(timer);
    };
  }, []);

  // A tournament outlasts any screensaver setting. The lock is dropped by the
  // browser whenever the tab is hidden, so it has to be taken again on return.
  useEffect(() => {
    let lock: WakeLockSentinel | null = null;
    let dead = false;
    const acquire = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        lock = await navigator.wakeLock?.request("screen");
        if (dead) void lock?.release();
      } catch {
        // Denied, unsupported, or no user gesture yet — the board still works.
      }
    };
    void acquire();
    document.addEventListener("visibilitychange", acquire);
    return () => {
      dead = true;
      document.removeEventListener("visibilitychange", acquire);
      void lock?.release().catch(() => {});
    };
  }, []);

  return (
    <div
      ref={root}
      data-look={cfg.look}
      // Per axis on purpose: a CSS percentage padding resolves against the
      // container's *width* on all four sides, so `5%` put ~9% of the height
      // above and below on a 16:9 screen. A safe area has to be the same
      // fraction of the edge it protects.
      style={{ "--bs0": cfg.scale, padding: `${cfg.inset}vh ${cfg.inset}vw` } as React.CSSProperties}
      className={`board fixed inset-0 flex flex-col overflow-hidden ${idle && !settings ? "board-idle" : ""}`}
    >
      {band}

      <div className="flex min-h-0 flex-1 gap-[1.5vh] pt-[1.5vh]">
        <main className="relative min-w-0 flex-1">{current?.node}</main>
        {qr && (
          <aside className={`flex shrink-0 flex-col justify-end ${qrWide ? "w-[32vh] justify-center" : "w-[19vh]"}`}>
            {qr}
          </aside>
        )}
      </div>

      {!idle && !settings && (
        <button
          type="button"
          onClick={() => setSettings(true)}
          aria-label="Board settings"
          title="Board settings (S)"
          className="fixed bottom-4 left-4 z-30 rounded-full border px-3 py-2 text-lg leading-none opacity-70 hover:opacity-100"
          style={{ background: "var(--board-panel)", borderColor: "var(--board-line)", color: "var(--board-fg)" }}
        >
          ⚙
        </button>
      )}

      <BoardSettings cfg={cfg} open={settings} onClose={() => setSettings(false)} />

      {slides.length > 1 && (
        <div className="mt-[1vh] flex shrink-0 items-center gap-[0.8vh]">
          {slides.map((s, i) => (
            <span
              key={s.id}
              aria-hidden="true"
              className="h-[0.5vh] flex-1 overflow-hidden rounded-full"
              style={{ background: "var(--board-line)" }}
            >
              <span
                className="block h-full rounded-full"
                style={{
                  background: i === index ? "var(--board-accent)" : "transparent",
                  // No animation: with a five-second refresh a filling bar
                  // would stutter. A lit segment says which of three you are on.
                  width: "100%",
                  opacity: i === index ? 1 : 0,
                }}
              />
            </span>
          ))}
          {paused && (
            <span className="t-xs board-dim shrink-0 pl-[1vh]" aria-hidden="true">
              paused
            </span>
          )}
        </div>
      )}
    </div>
  );
}

async function toggleFullscreen(el: HTMLElement | null) {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await el?.requestFullscreen();
  } catch {
    // Blocked without a gesture; pressing the key again after a click works.
  }
}
