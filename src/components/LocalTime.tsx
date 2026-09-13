"use client";

import { useEffect, useState } from "react";

/** Formats an ISO timestamp in the viewer's timezone (server renders UTC). */
export default function LocalTime({
  iso,
  withDate = false,
  className,
}: {
  iso: string;
  withDate?: boolean;
  className?: string;
}) {
  const [text, setText] = useState<string>("");
  useEffect(() => {
    const d = new Date(iso);
    const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    setText(withDate ? `${d.toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" })} ${time}` : time);
  }, [iso, withDate]);
  return (
    <time dateTime={iso} className={className} suppressHydrationWarning>
      {text || "…"}
    </time>
  );
}
