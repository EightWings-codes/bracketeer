"use client";

import { useEffect, useState } from "react";

function fmt(totalSec: number): string {
  const sign = totalSec < 0 ? "−" : "";
  const s = Math.abs(totalSec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(sec).padStart(2, "0");
  return h > 0 ? `${sign}${h}:${mm}:${ss}` : `${sign}${mm}:${ss}`;
}

/**
 * Ticks toward `targetIso` once a second. `serverNowIso` is the server's clock
 * at render time, used to correct for the viewer's clock skew.
 */
export default function Countdown({
  targetIso,
  serverNowIso,
  className,
  overrunLabel = "over",
}: {
  targetIso: string;
  serverNowIso: string;
  className?: string;
  overrunLabel?: string;
}) {
  const [skew] = useState(() => new Date(serverNowIso).getTime() - Date.now());
  const target = new Date(targetIso).getTime();
  const [remaining, setRemaining] = useState(() => Math.round((target - (Date.now() + skew)) / 1000));

  useEffect(() => {
    const tick = () => setRemaining(Math.round((target - (Date.now() + skew)) / 1000));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [target, skew]);

  return (
    <span className={className} suppressHydrationWarning>
      {fmt(remaining)}
      {remaining < 0 && <span className="ml-2 text-base font-normal text-red-500">{overrunLabel}</span>}
    </span>
  );
}
