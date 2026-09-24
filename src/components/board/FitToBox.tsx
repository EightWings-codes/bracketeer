"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Shrinks its child until it fits, and centres it. A 32-team double
 * elimination tree and a four-team bracket are the same component with wildly
 * different natural sizes; on a board neither may scroll and neither may be
 * cropped, so the tree is drawn at its comfortable size and then scaled.
 *
 * Only ever scales down — a four-team bracket blown up to fill 1080p looks
 * like a mistake.
 */
export default function FitToBox({ children }: { children: ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const b = box.current;
    const i = inner.current;
    if (!b || !i) return;
    const measure = () => {
      // Both reads are layout sizes, unaffected by the transform we apply —
      // so measuring cannot feed back into itself.
      const w = i.offsetWidth;
      const h = i.offsetHeight;
      if (!w || !h) return;
      setScale(Math.min(1, b.clientWidth / w, b.clientHeight / h));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(b);
    ro.observe(i);
    return () => ro.disconnect();
  }, [children]);

  return (
    <div ref={box} className="relative h-full w-full overflow-hidden">
      <div
        ref={inner}
        style={{ transform: `translate(-50%, -50%) scale(${scale})` }}
        className="absolute left-1/2 top-1/2 w-max origin-center"
      >
        {children}
      </div>
    </div>
  );
}
