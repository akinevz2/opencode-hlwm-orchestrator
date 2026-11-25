# The orchestrator state taxonomy

Asserted EVENT-DRIVEN ONLY (the per-session `herbstclient -i` watch
daemon; NO polling, NO periodic staleness checks). Staleness is
additionally a GUARD to every hlwm/tool call in the orchestration
layer.

| state        | condition                                                        | daemon behavior                          |
|--------------|------------------------------------------------------------------|------------------------------------------|
| **staleness** | the recorded wid's window title does not match THIS session's title (the TUI titles "OC | <session title>"; truncation-tolerant match) | every tool call REFUSES until a fresh grab |
| **death**    | the window is closed                                             | notification + the daemon EXITS (the turn is over — no lock held past it) |
| **abandonment** | the window is alive but not on the FOCUSED tag                 | transient notification opens             |
| **drop**     | alive, on the focused tag, but not focused                        | transient notification opens             |
| healthy      | focused                                                          | the notification closes                  |

- the notification: session-keyed replace-id (parallel sessions
  never fight), transient (self-expires when ignored), click =
  `orchestrate-reset` (re-focus + interrupt the session; respawn
  ONCE via `herbctl terminal` in the OPENCODE-reported directory on
  death).
- the daemon is ARMED ON EVERY USER MESSAGE (the plugin's event
  hook): `herbctl orchestrate grab` re-captures the wid — focus is
  authoritative only on the first tool call of a turn.
