"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import StatusBadge from "./StatusBadge";

export interface Round {
  id: string;
  label: string;
  /** Slot projection state — drives the badge and the dot colour. */
  state: string;
  caption?: ReactNode;
  content: ReactNode;
}

/**
 * The whole schedule as one swipeable strip: the live round is what you land
 * on, and every other round — played or still to come — is one swipe away in
 * the direction you'd expect. Native scroll-snap does the swiping, so it feels
 * right on a phone; the arrows and arrow keys cover desktop.
 */
export default function RoundRail({ rounds, startIndex = 0 }: { rounds: Round[]; startIndex?: number }) {
  const track = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(startIndex);
  // The landing jump must happen once, not on every 5s refresh — otherwise it
  // would yank a player back off the round they swiped to.
  const landed = useRef(false);

  useEffect(() => {
    const el = track.current;
    if (!el || landed.current) return;
    landed.current = true;
    el.scrollTo({ left: el.clientWidth * startIndex });
    setActive(startIndex);
  }, [startIndex]);

  useEffect(() => {
    const el = track.current;
    if (!el) return;
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const i = Math.round(el.scrollLeft / Math.max(1, el.clientWidth));
        setActive(Math.max(0, Math.min(rounds.length - 1, i)));
      });
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(raf);
    };
  }, [rounds.length]);

  // Slides sit side by side, so the track would otherwise stand as tall as the
  // busiest round and leave a hole under the quiet ones. Follow the round in
  // view instead, and keep following it while its content grows.
  const [height, setHeight] = useState<number>();
  useEffect(() => {
    const el = track.current;
    const slide = el?.children[active] as HTMLElement | undefined;
    if (!el || !slide) return;
    const measure = () => setHeight(slide.offsetHeight);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(slide);
    return () => ro.disconnect();
  }, [active, rounds]);

  const go = useCallback(
    (i: number) => {
      const el = track.current;
      if (!el) return;
      const target = Math.max(0, Math.min(rounds.length - 1, i));
      el.scrollTo({ left: el.clientWidth * target, behavior: "smooth" });
      setActive(target);
    },
    [rounds.length],
  );

  const current = rounds[Math.min(active, rounds.length - 1)];
  if (!current) return null;
  const arrow = "rounded-lg px-2 py-1 text-lg text-zinc-500 enabled:hover:bg-zinc-100 disabled:opacity-25 dark:enabled:hover:bg-zinc-800";

  return (
    <section
      aria-roledescription="carousel"
      aria-label="Rounds"
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft") go(active - 1);
        if (e.key === "ArrowRight") go(active + 1);
      }}
      className="rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900"
    >
      <div className="flex items-center gap-2 border-b border-zinc-200 px-2 py-2 dark:border-zinc-800">
        <button type="button" onClick={() => go(active - 1)} disabled={active === 0} aria-label="Previous round" className={arrow}>
          ◀
        </button>
        <div className="min-w-0 flex-1 text-center">
          <div className="flex items-center justify-center gap-2">
            <h2 className="truncate text-lg font-semibold">{current.label}</h2>
            <StatusBadge value={current.state} />
          </div>
          {current.caption && <div className="truncate text-xs tabular-nums text-zinc-500">{current.caption}</div>}
        </div>
        <button
          type="button"
          onClick={() => go(active + 1)}
          disabled={active === rounds.length - 1}
          aria-label="Next round"
          className={arrow}
        >
          ▶
        </button>
      </div>

      <div
        ref={track}
        style={height ? { height } : undefined}
        className="flex snap-x snap-mandatory items-start overflow-x-auto overscroll-x-contain transition-[height] duration-200 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {rounds.map((r, i) => (
          <div
            key={r.id}
            role="group"
            aria-roledescription="slide"
            aria-label={r.label}
            aria-hidden={i !== active}
            className="w-full shrink-0 snap-center p-3"
          >
            {r.content}
          </div>
        ))}
      </div>

      <div className="flex items-center justify-center gap-1.5 pb-3 text-xs text-zinc-500">
        {/* Past a dozen rounds the dots stop being readable — count instead. */}
        {rounds.length > 12 ? (
          <span className="tabular-nums">
            {active + 1} / {rounds.length}
          </span>
        ) : (
          rounds.map((r, i) => (
            <button
              key={r.id}
              type="button"
              onClick={() => go(i)}
              aria-label={`Go to ${r.label}`}
              aria-current={i === active}
              className={[
                "h-2 rounded-full transition-all",
                i === active ? "w-5" : "w-2",
                i === active
                  ? "bg-emerald-600"
                  : r.state === "done"
                    ? "bg-zinc-400 dark:bg-zinc-600"
                    : "bg-zinc-300 dark:bg-zinc-700",
              ].join(" ")}
            />
          ))
        )}
      </div>
    </section>
  );
}
