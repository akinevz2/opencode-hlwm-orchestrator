# opencode-hlwm-orchestrator

Session-observation and manipulation tooling for driving an
[OpenCode](https://github.com/sst/opencode) session from
[herbstluftwm](https://github.com/herbstluftwm/herbstluftwm): the
machinery that watches the ORCHESTRATOR — the opencode window running
the active session — and guarantees it stays intact, on-tag and
focused while agents work.

## The contract (already implemented — in herbctl)

The machinery LIVES in [herbctl](https://github.com/akinevz2/herbctl)
(`src/lib/orchestrate.ts` + the `orchestrate` verb family); this repo
is its home, charter and the plugin-side refactor target. The
opencode-screencast plugin's orchestration API moves onto these
library calls as `opencode-orchestrate-hlwm`.

- **orchestrator.winid** — the durable contract file
  (`$XDG_RUNTIME_DIR/screencast/orchestrator.winid`): focus is
  authoritative ONLY on the first tool call after a user's response;
  `herbctl orchestrate grab` captures and persists it there.
- **the watch daemon** — `herbctl orchestrate watch`: a single-instance
  `herbstclient -i` daemon that owns the transient loss notification
  (loss = dead / off-tag / minimized / unfocused; regain dismisses it;
  the click re-focuses + interrupts the session via
  `orchestrate-reset`).
- **the guarded removal** — `herbctl orchestrate close [wid] |
  --frame`: THE window/frame removal tool — refuses whenever the
  orchestrator holds focus or is the target; re-focuses the session
  after a close. Raw `herbstclient close`/`remove` by agents is
  forbidden.
- **the emergency surface** — after a lost gate budget, the permanent
  notification's action respawns the session ONCE via `herbctl
  terminal` in the directory OPENCODE's API reports (never a recorded
  cwd).
- **session-title validation** — the TUI titles its window
  "OC | <session title>" (truncated with an ellipsis); candidates are
  validated against the session title from `opencode api session.list`
  keyed by `OPENCODE_SESSION_ID`.

## The skill

`orchestrate/SKILL.md` (deployed into the opencode config) binds the
discipline for every session touching the WM: grab first, watch
always, close only through the guard.

## Live tests

`HERBCTL_LIVE_TESTS=1 bun test` (in herbctl) runs the probe-tag suite:
the orchestrator floats over the experiment, loss surfaces notify, and
every geometry claim is measured against hlwm attrs AND X ground
truth.
