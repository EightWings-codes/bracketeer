# Projector Board — specification

A full-screen, read-only view of a running tournament, meant for a beamer or a
TV in the room. Not a responsive variant of `/t/[slug]`: that page is a phone
page — swipeable rail, tap targets, score forms. The board is the opposite.
Nothing to touch, nothing to scroll, readable from ten metres, filling a 16:9
canvas edge to edge.

Status: built. Route `/board/[slug]`; logic in `src/lib/board.ts`,
components under `src/components/board/`.

## 1. Route and access

`/board/[slug]`, guarded by `requireAdmin()`.

Deliberately **not** under `src/app/admin/[slug]/`: that layout wraps its
children in a nav bar and `max-w-5xl`, which is precisely what a board must not
have. A top-level route also stays short enough to type on a borrowed projector
laptop. The tournament header gets a `Board ↗` link next to
`Public dashboard ↗`.

Admin-only means the projector machine signs in once; the session cookie does
the rest. Nothing on the board is secret, but there is no reason to widen the
public surface for it either.

## 2. Data

`loadTournamentView(slug)`, unchanged. The board must never be able to disagree
with what a player is holding in their hand, so it derives everything from the
same read model — including `projectSchedule()`, which already propagates
over-runs, and `describeSide()`, which already renders an unresolved side as
`Winner of QF T2`.

Refresh is the existing `<AutoRefresh intervalMs={APP.pollIntervalMs}>` (5 s).
Cycle position and other client state live in components, so a refresh never
yanks the screen mid-rotation.

## 3. Structure

Two layers: **persistent chrome** that stays put, and **one stage** that
changes.

```
┌────────────────────────────────────────────────────────────────┐
│ BAND  🍺 Bierpong Cup · Quarter-finals · round 6/9    ⏱ 04:12  │  chrome
├────────────────────────────────────────────────────────────────┤
│                                                                │
│                         S T A G E                              │  games │
│              (games · standings · schedule)                    │ stand. │
│                                                                │ sched. │
│                                                       ┌──────┐ │
│                                                       │ ▞▚▞▚ │ │  chrome
│                                                       │ QR   │ │
└───────────────────────────────────────────────────────┴──────┘─┘
        ▁▁▁▁▁▁▁▁▁▁▁▁▁▁░░░░░░░░░░░░░░  ← cycle progress hairline
```

Everything is sized in `vh`/`vmin`, so the board scales with the projector
rather than snapping at breakpoints. `overflow: hidden`; a scrollbar on a
projector is a bug.

## 4. Persistent chrome

Independently toggleable, and never rotated away — when on, they are visible in
every stage view and every cycle step.

### Timer (`timer=on|off`, default on)

Counts down to the end of the running round, from
`slot.projection.projectedEnd`, using the existing `<Countdown>`: it corrects
for the viewer's clock skew and flips to a red **over** label on overrun. The
delay figure (`fmtDelay`) sits next to it once `delaySec > 60`.

Between rounds it counts down to the *next* round's start instead, captioned
"next round in".

With `manualRounds` it reads `v.clock` (`roundClock` in `src/lib/schedule.ts`)
instead: "time left" counts from the round's Start to start + game length,
"break" from its Stop to stop + break length, "starts in" to the tournament
start. All three hold at 00:00 rather than running negative — nothing moves
until the organiser presses the next button.

### QR (`qr=on|off`, default on)

Bottom-right, white card — a dark-mode QR does not scan. Encodes
`publicTournamentUrl(slug)` through the existing `<QrCode>` server component,
with the bare URL printed underneath and a caption that follows the phase:

- `REGISTRATION` — "Scan to register" (and the code grows: during signup this
  is the point of the whole screen)
- running — "Scan for your next match"
- `FINISHED` — "Scan for the final table"

### Band (`band=on|off`, default on)

Theme emblem, tournament name, current round label, round N of M, status badge,
test-mode badge, and the `msg=` free-text line when set.

## 5. The three stage views

### a) `games` — current and upcoming, over the venue map

The hero view. Matches of the running round in big type — table label, team
emblems, names, live reported score — then the next round's fixtures beneath as
cards of their own: dimmer than the live games, but still sized to be read from
the back of the room, with unresolved sides in italic.

Behind it sits the venue backdrop: the organiser's pasted image, dimmed and
slightly blurred under a scrim so contrast never suffers. A hand-drawn table
plan is usually more useful here than a real map. Blank falls back to a gradient
in the theme accent. `map=on|off` forces it either way.

New fields on `Tournament`:

```prisma
venueName     String?
venueImageUrl String?
```

Edited under a **Venue** block in tournament settings. `venueName` also reads
out in the band. The URL is rendered as a CSS background only, never as
user-controlled markup.

### b) `standings` — group tables or tree, by round

`standings=auto` (default) picks by the stage of the currently running round:

- `GROUP` → every group table at once, qualification line drawn from
  `format.advancePerGroup`, same rules as `<StandingsTable>`
- anything else → the bracket, auto-fitted to the canvas by a measured scale
  transform, current round's column highlighted; double elimination keeps the
  winners / losers / grand-final row stacking from `<Bracket>`

`standings=groups|bracket` pins it — useful late in a group stage when you want
the tree up already.

Before a draw exists, this view shows the roster wall with emblems rather than
an empty frame.

### c) `schedule` — when each set of games starts

A column of rounds with projected **start** times, break included, straight
from `projectSchedule()`. It is delay-aware, so a round that over-runs pushes
every later time forward on its own and the board stays in step with the phone
dashboard.

Each round carries its fixtures, with a side that is still being decided
reading as what it is waiting for:

```
   now     Quarter-finals                    running · 04:12 left
           Table 1  Hopfen – Malz
           Table 2  Gerste – Sudhaus
   20:16   Semi-finals                       2 games
           Table 1  Winner of QF T1 – Winner of QF T2
   20:31   3rd place · Final                 2 games
           Table 1  TBD – TBD
```

Every round carries its fixtures. Room is made by the layout rather than by
dropping teams: past six rounds the list runs in two columns, and the type
steps down a notch as the plan gets longer.

The cadence is *end of round → break → next start*: with 10-minute games, a
5-minute break and 4 minutes left at 20:07, the current round ends 20:11 and the
semis start 20:16, the final 20:31. Start times, not end times — "when do I
play?" is the question people ask a screen.

Under `manualRounds` the times stay — they are the same projection, so they
follow every Start and Stop — but the "late" labels are dropped: the organiser
sets the pace, so a delay is not news.

## 6. Modes

- **`view=cycle` (default)** — games → standings → schedule → …, **10 s each**.
  Overridable globally (`dwell=15`) or per view
  (`dwell=games:15,standings:10,schedule:8`), with a slider each in the settings
  panel. **Zero seconds drops a view from the cycle** — `dwell=standings:0` runs
  games and schedule only. Zeroing all three would leave an empty screen, so
  that is read as no preference rather than obeyed. A hairline progress bar runs
  along the bottom edge. A view with nothing to say is skipped too — no bracket
  drawn yet, no rounds planned — so a two-view or one-view cycle just works.

  **Before the tournament starts there is no cycling.** While the status is
  `DRAFT` or `REGISTRATION`, `cycle` pins itself to `games` and stays there:
  nothing has happened yet, so rotating a half-empty draw and a plan nobody has
  read past is just movement. The screen is a poster — the name, the countdown,
  the teams arriving, and the QR code — and it holds still. The progress
  hairline is hidden, and cycling resumes on its own at `LOCKED`.

  An explicit pin still wins: `?view=schedule` during registration shows the
  schedule, because you asked for it.
- **`view=games|standings|schedule`** — pinned, no cycling.
- **`view=all`** — the experimental combined board. All three at once, chrome
  unchanged:

```
┌────────────────────────────────────────────────────────────────┐
│ BAND  🍺 Bierpong Cup · Quarter-finals · round 6/9    ⏱ 04:12  │
├───────────────────────────────────┬────────────────────────────┤
│  NOW PLAYING        (map behind)  │  BRACKET                   │
│   T1  Hopfen  3                   │    ▸QF ─┐                  │
│       Malz    2                   │     QF ─┴─ SF ┐            │
│   T2  Gerste  1                   │     QF ─┐     ├─ 🏆        │
│       Sudhaus 4                   │     QF ─┴─ SF ┘            │
│  NEXT  Winner QF T1 vs Winner T2  │                            │
├───────────────────────────────────┴───────────────────┬────────┤
│ 20:16 Semi-finals · 20:31 3rd place + Final           │  QR    │
└───────────────────────────────────────────────────────┴────────┘
```

Experimental because it is the one layout that can genuinely run out of room: a
32-team double-elimination tree beside four live matches at 1080p is tight. It
degrades in a fixed order — schedule strip collapses to one line, then the
next-up band drops — before any type is allowed below the size floor.

## 7. Every stage has something to show

| Status | `games` | `standings` | `schedule` |
|---|---|---|---|
| `DRAFT` † | name + countdown to start | planned format | planned rounds |
| `REGISTRATION` † | roster filling live, theme flourish | roster wall, "draw not made" | planned rounds from `startsAt` |
| `LOCKED` / `READY` | round 1 fixtures + countdown | the draw — groups or tree | full plan |
| `RUNNING` group | live + next matches | group tables | projected times |
| `RUNNING` knockout | live + next matches | the tree | projected times |
| `FINISHED` | 🥇🥈🥉 podium + final score | final tables / completed tree | what actually happened |

† `games` only — the cycle is suppressed until the field is locked (see §6).
The other two columns are still reachable by pinning them in the URL.

## 8. Configuration

A settings panel lives on the board itself: move the mouse and a ⚙ appears
bottom-left, or press <kbd>S</kbd>. It offers every parameter below as a
control, and holds the rotation still while it is open.

It changes nothing but the address bar. The URL stays the single description
of what a screen is showing, so a board tuned on the panel can be copied
straight to the second projector or bookmarked for next time — and
**Copy board URL** in the panel is there for exactly that. **Reset to
defaults** clears the query string.

The whole surface is the query string — one screen, one URL, no saved state:

| Param | Values | Default |
|---|---|---|
| `view` | `cycle` \| `games` \| `standings` \| `schedule` \| `all` | `cycle` (pinned to `games` before `LOCKED`) |
| `dwell` | seconds, or `games:15,standings:10,schedule:8`; `0` skips a view | `10` |
| `timer` | `on` \| `off` | `on` |
| `qr` | `on` \| `off` | `on` |
| `map` | `on` \| `off` | on when `venueImageUrl` is set |
| `band` | `on` \| `off` | `on` |
| `standings` | `auto` \| `groups` \| `bracket` | `auto` |
| `look` | `midnight` · `slate` · `dusk` · `forest` · `ember` · `paper` · `daylight` · `tuermli` · `contrast` | `midnight` |
| `contrast` | `high` — the older spelling of `look=contrast`; `look` wins | — |
| `scale` | `0.8`–`1.4` type scale | `1` |
| `inset` | `0`–`10` (% safe area per axis, for beamers that crop edges) | `0` |
| `msg` | free text in the band | — |

Two projectors can therefore show different things from one tournament: the
stage screen on `?view=games&qr=off`, the bar screen on
`?view=cycle&dwell=8&contrast=high`.

No `boardConfig` column and no builder UI in v1. The only migration is the two
venue fields.

## 9. Projection ergonomics

The details that decide whether it is usable in a real hall:

- Its own palette, not the site's: the `zinc-50` page washes out under a beamer.
  Eight looks ship — five dark (Midnight, Slate, Dusk, Forest, Ember), two
  light (Paper, Daylight, for a bright room or a TV) and High contrast for a
  weak lamp. A look is one block of custom properties in `globals.css` under
  `[data-look="…"]` plus a row in `BOARD_LOOKS`, so adding one is a five-minute
  job. Swatches for all of them sit in the settings panel.
- A look can be built around a picture: **Türmli** puts the house drawing from
  `public/board/tuermli.jpg` under the whole board as a watermark, with
  translucent panels so it keeps showing through, and a palette sampled from
  the drawing itself — its ink runs at hue 30°, and the accent is that hue
  taken down until a name reads against it.
- Cursor hides after 3 s idle; `f` toggles fullscreen.
- Screen Wake Lock, so the laptop does not sleep mid-tournament.
- Long team names shrink to fit; nothing is silently ellipsed into
  `Schützengarte…`.
- Type floor: captions ≥ 2.2vh, team names 3.5–6vh depending on how many fit.
- Keyboard: `s` opens the settings panel, `space` pauses the cycle, `←`/`→`
  step it, `1`/`2`/`3` jump to a view, `f` fullscreen. The shortcuts stand down
  while a field in the settings panel has focus.
- Nothing depends on hover or click.
- `prefers-reduced-motion` respected for every transition.

## 10. Non-goals for v1

No score entry from the board. No audio. No saved board config or admin builder
UI. No multi-tournament wall. No custom CSS.
