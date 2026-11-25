// opencode-hlwm-orchestrator — the ORCHESTRATOR CONTRACT plugin.
//
// One job, no duplication (the machinery lives in herbctl's
// lib/orchestrate.ts + the `orchestrate` verb family; the skill —
// skill/orchestrate/SKILL.md — binds the agent-side discipline):
//
//   ARM ON EVERY USER MESSAGE. A user message is the turn boundary:
//   focus is authoritative EXACTLY at its first tool call (the user
//   just typed into the orchestrator TUI). The hook runs
//     herbctl orchestrate grab   → capture + persist the wid
//     herbctl orchestrate watch  → arm the per-session loss daemon
//   …so the orchestrator's handle on the windowid is accurate every
//   turn, and any loss (staleness / death / separation / drop)
//   surfaces through the daemon's notification, never by polling.
//
// Fail-soft everywhere: no herbctl, no herbstluftwm — the plugin is
// inert and the grab-on-first-tool-call contract (the skill) still
// covers the turn.
import { Plugin } from "@opencode/plugin";

export default Plugin.define({
    id: "orchestrate-hlwm",
    async setup(ctx) {
        try {
            ctx.event.subscribe(async (event) => {
                const type = (event as { type?: string }).type ?? "";
                if (type !== "message.updated") return;
                const msg = (event as {
                    properties?: { message?: { role?: string } };
                }).properties?.message;
                if (msg?.role !== "user") return;
                const { execSync } = await import("node:child_process");
                try {
                    execSync(
                        "herbctl orchestrate grab >/dev/null 2>&1"
                        + " && herbctl orchestrate watch >/dev/null 2>&1",
                        { stdio: "ignore", timeout: 15_000 },
                    );
                } catch {
                    // no herbctl — inert (the skill's contract stands)
                }
            });
        } catch {
            // no event surface — inert
        }
    },
});
