---
name: orchestrate
description: >
  Mandatory discipline for ANY session that touches herbstluftwm in
  any way (hlwm commands, windows, frames, tags, layout, live/probe
  tests): TRACKING ON THE ORCHESTRATOR MUST BE ARMED FIRST — no
  hlwm command runs without a tracker; the ONLY sanctioned
  window/frame removal path.
---

# track — the orchestrator contract

The ORCHESTRATOR is the opencode window running the session that
drives the current work — the terminal whose TUI you are speaking
through. Focus is authoritative EXACTLY ONCE per user turn (the user
just typed into the TUI); every later tool call relies on the tracker
armed at the turn boundary. NO FILESYSTEM STATE exists anywhere in
this contract — the process tree is the state; crashes leave nothing
behind.

## THE FOUR RULES

### 0. NO HLWM COMMAND WITHOUT TRACKING — THE PRECONDITION

Dealing with ANY hlwm command — a window move, a frame split, a
`herbctl` verb, a live test — REQUIRES an armed tracker FIRST:

    pgrep -f "herbctl track" >/dev/null || \
        { setsid herbctl track >/dev/null 2>&1 < /dev/null & }

- the opencode plugin normally does this for you (it arms
  `herbctl track --quiet` on every user message);
- if NO tracker is running (another client, a headless session, a
  failed plugin), YOU launch one — detached, bare (it then owns the
  notifications itself);
- the check is a process check (`pgrep`), never a file check —
  there is no filesystem state to consult.

### 1. THE TURN BOUNDARY RE-ARMS THE TRACKER

A user message is the turn boundary: focus is authoritative exactly
at the turn's first tool call. The plugin kills the previous
tracker and spawns a fresh `herbctl track --quiet` — the monitored
wid is re-captured every turn. Manually (no plugin): the same
discipline — kill + re-arm on the first tool call.

### 2. THE STATES (event-driven only — never polled)

- **death** — the tracked window is closed. The tracker reports it
  and ends (the turn is over — no notification lock held past it);
  the recovery respawns the session ONCE via `herbctl terminal` in
  the directory OPENCODE's API reports.
- **separation** — the window is alive but not on the focused tag.
  Recovery: interrupt + bring back onto the viewed tag.
- **drop** — alive, on the focused tag, but not focused (same tag
  ONLY — cross-tag is separation). Recovery: jumpto back, no
  interrupt.
- **healthy** — focused. Any loss notification closes.

### 3. CLOSE ONLY THROUGH THE GUARD — never raw herbstclient

    herbctl remove          (the machines: --tiling / --frame / --tag / --cleanup)

The remove verb REFUSES whenever the focused window IS the
orchestrator (title-matched against the session title from
OPENCODE's API — no filesystem). Raw `herbstclient close`/`remove`
by an agent is FORBIDDEN — a bare `close` kills whatever the user
has focused.

## LIVE TESTS

Probe/live suites (HERBCTL_LIVE_TESTS=1) use `lib/probe.ts`:
`ensureTestTag` (brings + floats the orchestrator over the probe
tag), `resetTestTag` (per-test reset — collapses splits, re-floats
the orchestrator, closes nothing), `ensureOrchestratorOn` (the gate:
event-driven wait for healthy; a pause holds it; a lost cap surfaces
the emergency), and the post-attach geometry corrector pins floating
surfaces to the focused frame (see tests/live.test.ts).
