import { findTheme } from "@/lib/themes";

/**
 * The decorative motion behind the registration phase, chosen by theme.
 * Purely ornamental: aria-hidden, absolutely positioned, and disabled for
 * anyone with prefers-reduced-motion. The parent must be `relative`.
 *
 * Deterministic offsets rather than Math.random(), so the server and client
 * markup agree and React does not complain about a hydration mismatch.
 */
export default function SignupFlourish({ theme }: { theme: string }) {
  const t = findTheme(theme);

  if (t.id === "beerpong") {
    const bubbles = [
      { left: 6, size: 10, delay: 0, dur: 5.5 },
      { left: 18, size: 6, delay: 1.4, dur: 4.2 },
      { left: 31, size: 13, delay: 2.6, dur: 6.4 },
      { left: 44, size: 7, delay: 0.8, dur: 5.0 },
      { left: 57, size: 11, delay: 3.2, dur: 6.9 },
      { left: 69, size: 5, delay: 2.0, dur: 4.6 },
      { left: 81, size: 9, delay: 1.1, dur: 5.8 },
      { left: 93, size: 12, delay: 3.8, dur: 6.1 },
    ];
    return (
      <div className="flourish text-amber-400" aria-hidden="true">
        {bubbles.map((b, i) => (
          <span
            key={i}
            className="bubble"
            style={{
              left: `${b.left}%`,
              width: b.size,
              height: b.size,
              animationDelay: `${b.delay}s`,
              animationDuration: `${b.dur}s`,
            }}
          />
        ))}
      </div>
    );
  }

  if (t.id === "toeggele") {
    return (
      <div className="flourish" aria-hidden="true">
        <span className="roller">⚽</span>
        <span className="roller" style={{ animationDelay: "3.5s", fontSize: 12 }}>
          ⚽
        </span>
      </div>
    );
  }

  return (
    <div className="flourish text-emerald-500" aria-hidden="true">
      <span className="sweep" />
    </div>
  );
}
