---
name: orchestrate
description: >
  Mandatory discipline for ANY session that manipulates the
  herbstluftwm session (windows, frames, tags, layout) or runs
  live/probe tests on it: the track daemon that owns the
  orchestrator's observation, and the ONLY sanctioned window/frame
  removal path.
---

# track — the orchestrator contract

The ORCHESTRATOR is the opencode window running the session that
drives the current work — the terminal whose TUI you are speaking
through. Focus is authoritative EXACTLY ONCE per user turn (the user
just typed into the TUI); every later tool call relies on the tracker
armed at the turn boundary. NO FILESYSTEM STATE exists anywhere in
this contract — the process tree is the state; crashes leave nothing
behind.

## THE THREE RULES

### 1. THE TURN BOUNDARY ARMS THE TRACKER

The opencode plugin (opencode-hlwm-orchestrator) runs on EVERY user
message:

    herbctl track --quiet

a blocking reporter that captures the CALLING TERMINAL's window (the
focused client at spawn — the trusted implicit) and streams every
state change to stdout as JSON lines. The plugin owns the
notification lifecycle and the per-state recovery via that pipe —
memory, never the filesystem. For agent-side sessions launched
without the plugin, run `herbctl track` (bare) — the tracker then
owns the notifications itself.

### 2. THE FOUR STATES (event-driven only — never polled)

- **staleness** — retired: the wid is captured fresh each turn at
  the tracker's spawn; nothing persists to go stale.
- **death** — the tracked window is closed. The tracker reports it
  and ends (the turn is over — no notification lock held past it);
  the recovery respawns the session ONCE via `herbctl terminal` in
  the directory OPENCODE's API reports.
- **separation** — the window is alive but not on the focused tag.
  Recovery: interrupt + bring back onto the viewed tag.
- **drop** — alive, on the focused tag, but not focused (same tag
  ONLY — cross-tag is separation). Recovery: jumpto back, no
  interrupt.

### 3. CLOSE ONLY THROUGH THE GUARD — never raw herbstclient

    herbctl close            (the machines: --window / --tiling / --frame)

The close verb REFUSES whenever the focused window IS the
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
