// opencode-hlwm-orchestrator — the ORCHESTRATOR CONTRACT plugin.
//
// One job, no duplication (the machinery lives in herbctl's
// lib/track.ts + the `track`/`sentry` verbs; the skill binds the
// agent-side discipline):
//
//   THE PIPELINE IS THE TURN:
//   - TURN START (a user message): kill the previous pipeline; spawn
//     a FRESH one, detached — it lives OUTSIDE opencode's process:
//       herbctl track --quiet | herbctl sentry <wid>
//     The tracker captures the calling terminal's window (focus is
//     authoritative exactly at the turn's first tool call) and
//     streams state events; the SENTRY — composed over the
//     tracker's stream — owns the notification surface (spawn on
//     loss, hide on healthy, the persistent reopen on death).
//   - TURN END (the agent goes idle): CANCEL — close the pipeline's
//     stdin: the tracker sees EOF and ends; the sentry DEGRADES to
//     its own event-driven watch and keeps covering the risk
//     window (it survives opencode's exit).
//
// The plugin holds no notification code, no wid state, no
// filesystem — the process tree is the entire state.
import { Plugin } from "@opencode/plugin";

let pipeline: Bun.Subprocess<"pipe", "ignore", "ignore"> | null = null;

function killPipeline(): void {
    if (pipeline === null) return;
    try { pipeline.kill(); } catch { /* gone */ }
    pipeline = null;
}

export default Plugin.define({
    id: "orchestrate-hlwm",
    async setup(ctx) {
        try {
            ctx.event.subscribe(async (event) => {
                const type = (event as { type?: string }).type ?? "";

                // ── TURN START: a fresh pipeline ──
                if (type === "message.updated") {
                    const msg = (event as {
                        properties?: { message?: { role?: string } };
                    }).properties?.message;
                    if (msg?.role !== "user") return;
                    killPipeline();
                    try {
                        // the wid: the focused client right now (the
                        // trusted implicit) — ONE read, passed to the
                        // sentry; the tracker captures its own
                        const focus = Bun.spawnSync(
                            ["herbstclient", "attr", "clients.focus.winid"],
                            { stdout: "pipe", stderr: "ignore" },
                        ).stdout.toString().trim();
                        const wid = (focus.match(/0x[0-9a-fA-F]+/) ?? [""])[0];
                        pipeline = Bun.spawn(
                            ["sh", "-c",
                             `herbctl track --quiet | herbctl sentry ${wid}`],
                            { stdin: "pipe", stdout: "ignore", stderr: "ignore" },
                        );
                    } catch {
                        // no herbctl/herbstclient — inert (the skill's
                        // contract stands)
                    }
                    return;
                }

                // ── TURN END: the agent goes idle — the cancel ──
                if (type === "session.idle") {
                    const p = pipeline;
                    pipeline = null;
                    if (p === null) return;
                    // closing the write end = EOF for the tracker =
                    // the end-of-turn cancel; the SENTRY degrades to
                    // its own watch and keeps the coverage
                    try {
                        p.stdin?.end();
                    } catch {
                        // already gone
                    }
                }
            });
        } catch {
            // no event surface — inert
        }
    },
});
