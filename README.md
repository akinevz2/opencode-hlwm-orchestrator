# opencode-hlwm-orchestrator

Session-observation and manipulation tooling for driving an
[OpenCode](https://github.com/sst/opencode) session from
[herbstluftwm](https://github.com/herbstluftwm/herbstluftwm): the
machinery that watches the ORCHESTRATOR — the opencode window running
the active session — and guarantees it stays intact, on-tag and
focused while agents work.

## What lives here

- **plugin/** — the opencode plugin: arms the contract on EVERY user
  message (`herbctl orchestrate grab` + `watch` — the turn boundary
  is when focus is authoritative), so the orchestrator's handle on
  the windowid is accurate every turn.
- **skill/orchestrate/SKILL.md** — the agent-side discipline:
  grab first, watch always, close only through the guard.
- **docs/STATES.md** — the loss taxonomy: staleness / death /
  separation / drop — event-driven only, never polled.
- **bin/install** / **Makefile** — the external installer (clone
  anywhere, `make install` wires it into `~/.config/opencode`); the
  dots deployment owns the links through stow instead.

## The machinery lives in herbctl

The contract is IMPLEMENTED in
[herbctl](https://github.com/akinevz2/herbctl)
(`src/lib/orchestrate.ts` + the `orchestrate` verb family):

- **orchestrator.winid** — the durable contract file
  (`$XDG_RUNTIME_DIR/screencast/orchestrator.winid`); focus is
  authoritative ONLY on the first tool call after a user's response.
- **the watch daemon** — `herbctl orchestrate watch`: a
  single-instance per-session `herbstclient -i` daemon that owns the
  transient loss notification (the click re-focuses + interrupts the
  session via `orchestrate-reset`; on death it respawns the session
  ONCE via `herbctl terminal` in the directory OPENCODE's API
  reports).
- **the guarded removal** — `herbctl orchestrate close [wid] |
  --frame`: THE window/frame removal tool — refuses whenever the
  orchestrator holds focus or is the target. Raw
  `herbstclient close`/`remove` by agents is forbidden.
- **session-title validation** — the TUI titles its window
  "OC | <session title>" (truncated with an ellipsis); candidates are
  validated against `opencode api session.list` keyed by
  `OPENCODE_SESSION_ID`.

## Install

Through dots (the stow package ships the links), or externally:

    git clone https://github.com/akinevz2/opencode-hlwm-orchestrator
    cd opencode-hlwm-orchestrator && bin/install

then add `"./opencode-hlwm-orchestrator"` to `opencode.jsonc`'s
`plugins` array.

## Tests

`HERBCTL_LIVE_TESTS=1 bun test` (in herbctl) runs the probe-tag
suite: the orchestrator floats over the experiment, losses surface as
notifications, and every geometry claim is measured against hlwm
attrs AND X ground truth.
