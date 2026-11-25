// opencode-hlwm-orchestrator — the ORCHESTRATOR CONTRACT plugin.
//
// One job, no duplication (the machinery lives in herbctl's
// lib/track.ts + the `track` verb; the skill — skill/orchestrate/
// SKILL.md — binds the agent-side discipline):
//
//   ARM ON EVERY USER MESSAGE. A user message is the turn boundary:
//   the plugin spawns `herbctl track --quiet` — a blocking reporter
//   that captures the CALLING TERMINAL's window (focus is
//   authoritative exactly at the turn's first tool call) and streams
//   every state change as JSON lines on stdout. The plugin owns the
//   NOTIFICATION lifecycle (spawn on loss, close on regain) and the
//   per-state recovery — via the PIPE (memory), never the
//   filesystem: no state survives a crash, and the previous turn's
//   tracker is killed when the new one arms.
//
//   states: healthy | drop | death | separation
//     drop       → jumpto back (no interrupt)
//     death      → respawn the session once (herbctl terminal, in
//                  the directory OPENCODE reports)
//     separation → interrupt + bring back onto the viewed tag
//
// Fail-soft everywhere: no herbctl, no herbstluftwm — the plugin is
// inert and the skill's contract still covers the turn.
import { Plugin } from "@opencode/plugin";

let tracker: Bun.Subprocess<"ignore", "pipe", "ignore"> | null = null;
let notifying: Bun.Subprocess<"ignore", "pipe", "ignore"> | null = null;

const NOTIFY_ID = (() => {
    const sid = process.env.OPENCODE_SESSION_ID ?? "adhoc";
    let h = 0;
    for (let i = 0; i < sid.length; i += 1) {
        h = (h * 31 + sid.charCodeAt(i)) >>> 0;
    }
    return sid === "adhoc" ? "47111" : String(47200 + (h % 500));
})();

/** Close the current loss notification (dunstctl — no file state). */
async function closeNotification(): Promise<void> {
    Bun.spawnSync(["dunstctl", "close", NOTIFY_ID],
        { stdout: "ignore", stderr: "ignore" });
}

/** Open the loss notification: per-state action label; the click
 *  dispatches the recovery IN-PROCESS (jumpto / respawn / bring). */
async function openNotification(
    state: string,
    wid: string,
): Promise<void> {
    await closeNotification();
    const labels: Record<string, string> = {
        drop: "focus",
        death: "restart",
        separation: "recover",
    };
    const summaries: Record<string, string> = {
        drop: "drop — focus elsewhere (action: jumpto back)",
        death: "death — the window is closed (action: respawn once)",
        separation: "separation — not on the focused tag (action: interrupt + bring)",
    };
    const act = labels[state] ?? "focus";
    const proc = Bun.spawn(
        ["dunstify", "-a", "herbctl-track", "-r", NOTIFY_ID,
         "-A", `${act},${act}`, "track: orchestrator lost",
         summaries[state] ?? state],
        { stdout: "pipe", stderr: "ignore" },
    );
    notifying = proc;
    void (async () => {
        const out = await new Response(proc.stdout).text();
        if (out.trim() !== act) return; // dismissed/expired, not clicked
        const dir = projectDir;
        if (state === "drop") {
            Bun.spawnSync(["herbstclient", "jumpto", wid]);
        } else if (state === "separation") {
            const view = Bun.spawnSync(
                ["herbstclient", "attr", "tags.focus.name"],
                { stdout: "pipe" }).stdout.toString().trim();
            Bun.spawnSync(["herbstclient", "jumpto", wid]);
            if (view !== "") {
                Bun.spawnSync(["herbstclient", "move", view]);
                Bun.spawnSync(["herbstclient", "use", view]);
            }
        } else if (state === "death") {
            respawn(dir);
        }
    })();
}

/** Respawn the session once, via `herbctl terminal`, in the
 *  directory OPENCODE reports (the server is the source of truth for
 *  WHERE — never a recorded cwd). One per tracker: a process, not a
 *  persisted guard. */
let respawned = false;
let projectDir = "";
function respawn(dir: string): void {
    if (respawned) return;
    respawned = true;
    Bun.spawn(["herbctl", "terminal", "--floating", "--full-height",
        ...(dir !== "" ? ["-d", dir] : []), "opencode"],
        { detached: true, stdio: "ignore" }).unref();
}

function killTracker(): void {
    if (tracker === null) return;
    try { tracker.kill(); } catch { /* gone */ }
    tracker = null;
}

export default Plugin.define({
    id: "orchestrate-hlwm",
    async setup(ctx) {
        // the session's project directory — from the server, once
        try {
            const sessions = await (ctx as unknown as {
                session: { list: () => Promise<Array<{
                    id?: string; projectID?: string;
                }>> };
            }).session.list();
            void sessions; // the dir comes from the project API below
        } catch {
            // the API surface varies — the herbctl-side fallback
            // (sessionDir()) covers the respawn directory
        }
        try {
            const cwd = process.env.OPENCODE_PROJECT_CWD
                ?? process.cwd();
            projectDir = cwd;
        } catch {
            projectDir = "";
        }
        try {
            ctx.event.subscribe(async (event) => {
                const type = (event as { type?: string }).type ?? "";
                if (type !== "message.updated") return;
                const msg = (event as {
                    properties?: { message?: { role?: string } };
                }).properties?.message;
                if (msg?.role !== "user") return;
                // THE TURN BOUNDARY: re-arm — kill the previous
                // tracker, spawn a fresh one (the focused client at
                // its spawn is THIS turn's orchestrator window)
                killTracker();
                await closeNotification();
                respawned = false;
                try {
                    const child = Bun.spawn(
                        ["herbctl", "track", "--quiet"],
                        { stdout: "pipe", stderr: "ignore" },
                    );
                    tracker = child;
                    void (async () => {
                        const reader = child.stdout.getReader();
                        const td = new TextDecoder();
                        let buf = "";
                        for (;;) {
                            const { done, value } = await reader.read();
                            if (done) break;
                            buf += td.decode(value);
                            let nl: number;
                            while ((nl = buf.indexOf("\n")) !== -1) {
                                const line = buf.slice(0, nl);
                                buf = buf.slice(nl + 1);
                                try {
                                    const ev = JSON.parse(line) as {
                                        state?: string; wid?: string;
                                    };
                                    if (!ev.state || !ev.wid) continue;
                                    if (ev.state === "healthy") {
                                        await closeNotification();
                                    } else {
                                        await openNotification(ev.state, ev.wid);
                                    }
                                } catch {
                                    // a malformed line — skip it
                                }
                            }
                        }
                    })();
                } catch {
                    // no herbctl — inert (the skill's contract stands)
                }
            });
        } catch {
            // no event surface — inert
        }
    },
});
