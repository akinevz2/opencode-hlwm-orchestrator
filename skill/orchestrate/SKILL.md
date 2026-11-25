---
name: orchestrate
description: >
  Mandatory discipline for ANY session that manipulates the
  herbstluftwm session (windows, frames, tags, layout) or runs
  live/probe tests on it: how to grab the orchestrator, how to arm
  the focus-loss watcher, and the ONLY sanctioned window/frame
  removal path.
---

# orchestrate — the orchestrator contract

The ORCHESTRATOR is the opencode window running the session that
drives the current work — the terminal whose TUI you are speaking
through. Its wid is durably persisted at
`$XDG_RUNTIME_DIR/screencast/orchestrator.winid`; herbctl and the
orchestration plugin agree on that one file.

## THE THREE RULES

### 1. GRAB FIRST — on the first tool call after EVERY user response

    herbctl orchestrate grab

Focus is authoritative EXACTLY ONCE per user turn: the user just
typed into the orchestrator TUI, so the focused client IS the
orchestrator. `grab` captures and persists it — AND ARMS THE WATCHER.
The opencode plugin also arms it on every user message (event hook),
so the handle is re-validated every turn. After the first call, focus
means nothing until the next user response.

### 2. THE FOUR STATES (asserted event-driven ONLY — never by polling)

- **staleness** — the recorded wid's window TITLE no longer matches
  THIS session's title (the TUI titles its window
  "OC | <session title>"): the handle points at a foreign window.
  EVERY hlwm/tool call in the orchestrate layer REFUSES on staleness
  until a fresh grab.
- **death** — the window is closed. The notification reports it and
  the watch daemon EXITS (the turn is over — no lock is held); the
  click re-focuses/interrupts, respawning the session once via
  `herbctl terminal` in the directory OPENCODE's API reports.
- **abandonment** — the window is alive but not on the focused tag.
- **drop** — alive, on the focused tag, but not focused.

### 3. WATCH — the daemon (armed on every user message, or manually)

    herbctl orchestrate watch [tag]

Single-instance per session (session-keyed lock, session-keyed
notification replace-id — parallel sessions never fight). It tails
`herbstclient -i` (purely event-driven) and owns the transient loss
notification: loss opens it (naming the state), regain closes it,
death ends it.

### 4. CLOSE ONLY THROUGH THE GUARD — never raw herbstclient

    herbctl orchestrate close [wid]      # window
    herbctl orchestrate close --frame    # frame removal

This is the ONLY sanctioned window/frame removal mechanism. The
staleness guard runs first; it REFUSES (exit 2) whenever the
orchestrator holds focus or IS the target; after a window close it
re-focuses the orchestrator. Raw `herbstclient close`/`remove` by an
agent is FORBIDDEN — a bare `close` kills whatever the user has
focused.

## LIVE TESTS

Probe/live suites (HERBCTL_LIVE_TESTS=1) use `lib/orchestrate.ts`:
`ensureTestTag` (brings + floats the orchestrator over the probe tag),
`resetTestTag` (per-test reset — collapses splits, re-floats the
orchestrator, closes nothing), `ensureOrchestratorOn` (the gate:
waits through pauses, raises the emergency after budget), and the
post-attach geometry corrector pins floating surfaces to the focused
frame (see tests/live.test.ts).
