"use client";

import { useEffect, useState } from "react";

const toLocalInput = (d: Date) =>
  new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);

/**
 * A datetime-local field that means the organiser's own wall clock. The
 * server renders (and parses) in UTC, so a plain datetime-local would show and
 * save the wrong hour anywhere else; this one converts in the browser and
 * submits an ISO timestamp under `name` instead.
 */
export default function LocalDateTimeInput({
  name,
  iso,
  className,
  required,
}: {
  name: string;
  iso: string;
  className?: string;
  required?: boolean;
}) {
  const [local, setLocal] = useState("");
  const [value, setValue] = useState(iso);
  useEffect(() => {
    setLocal(toLocalInput(new Date(iso)));
    setValue(iso);
  }, [iso]);

  return (
    <>
      <input
        type="datetime-local"
        value={local}
        required={required}
        onChange={(e) => {
          setLocal(e.target.value);
          const d = new Date(e.target.value);
          if (!Number.isNaN(d.getTime())) setValue(d.toISOString());
        }}
        className={className}
        suppressHydrationWarning
      />
      <input type="hidden" name={name} value={value} />
    </>
  );
}
