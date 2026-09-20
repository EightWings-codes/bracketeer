import { describe, expect, it } from "vitest";
import { SYMBOLS } from "@/components/StatusBadge";

// The lifecycle is the app's spine; a state without a glyph renders as a dot.
const LIFECYCLE = ["DRAFT", "REGISTRATION", "LOCKED", "READY", "RUNNING", "FINISHED"] as const;

describe("tournament lifecycle", () => {
  it("gives every state its own symbol", () => {
    const glyphs = LIFECYCLE.map((s) => SYMBOLS[s]);
    expect(glyphs.every(Boolean)).toBe(true);
    expect(new Set(glyphs).size).toBe(LIFECYCLE.length);
  });

  it("puts READY between LOCKED and RUNNING", () => {
    expect(LIFECYCLE.indexOf("READY")).toBe(LIFECYCLE.indexOf("LOCKED") + 1);
    expect(LIFECYCLE.indexOf("RUNNING")).toBe(LIFECYCLE.indexOf("READY") + 1);
  });
});
