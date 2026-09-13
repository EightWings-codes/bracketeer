/**
 * All branding in one place. Renaming the app is a one-line change here.
 */
export const APP = {
  name: "Bracketeer",
  tagline: "Plan and run a tournament live.",
  emoji: "🏆",
  /** Dashboard/team pages poll on this interval. */
  pollIntervalMs: 5000,
  /** Registration throttle: max attempts per IP per window per tournament. */
  registrationMaxPerWindow: 5,
  registrationWindowMs: 10 * 60 * 1000,
} as const;
