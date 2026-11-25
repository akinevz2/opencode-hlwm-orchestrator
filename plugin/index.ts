// opencode-hlwm-orchestrator — the ORCHESTRATOR CONTRACT plugin.
//
// Two responsibilities (the machinery lives in herbctl's lib/track.ts
// + the `track` verb; the skill binds the agent-side discipline):
//
//   1. THE PIPELINE IS THE TURN:
//   - TURN START (a user message): END the previous pipeline; spawn
//     a FRESH one, detached — it lives OUTSIDE opencode's process:
//       herbctl track --quiet | herbctl track --sentry <wid>
//     The tracker captures the calling terminal's window (focus is
//     authoritative exactly at the turn's first tool call) and
//     streams state events; the SENTRY MODE — composed over the
//     tracker's stream — owns the notification surface (spawn on
//     loss, hide on healthy, the persistent reopen on death).
//   - TURN END (the agent goes idle): CANCEL — WRITE one character
//     to the pipeline's stdin, then close it: the tracker treats
//     any byte (or EOF) as the exit signal and ends, the sentry
//     sees the tracker's EOF and follows, the sh wrapper is gone —
//     the WHOLE tree exits without signals (a kill(2) on the sh
//     parent does NOT reach the a|b grandchildren — the orphan
//     generations that leaked before). If opencode itself dies, the
//     write end closes with it → EOF → the tree still exits. The
//     sentry mode DEGRADES to its own event-driven watch and keeps
//     covering the risk window (it survives opencode's exit).
//
//   2. THE AGENT'S OPERATION OF THE ORCHESTRATOR WINDOW (the window
//   that OWNS the agent's lifetime) — the tools moved in from
//   opencode-screencast:
//   - orchestrator: the wid + state of the orchestrator window
//     (resolved LIVE: clients.focus verified against the session
//     title from OPENCODE's API — no filesystem state);
//   - relocate: move the orchestrator (or a given window) to a tag —
//     created when missing — WITHOUT focus/view theft (the atomic
//     four-step: focus → move → restore view → restore focus).
import { Plugin } from "@opencode/plugin";

let pipeline: Bun.Subprocess<"pipe", "ignore", "ignore"> | null = null;
let turnActive = false; // the turn state machine: idle → step → idle
let projectDir = "";    // the session's directory (the plugin context)

function endPipeline(): void {
    if (pipeline === null) return;
    // ONE character of stdin = the tracker's exit message; the EOF
    // behind it is the backup. No kill(2): it lands on the sh parent
    // and orphans the a|b grandchildren (the leak).
    try { pipeline.stdin?.write("x"); } catch { /* gone */ }
    try { pipeline.stdin?.end(); } catch { /* gone */ }
    pipeline = null;
}

// ── the orchestrator resolution (live, no filesystem) ──────────────

let cachedTitle: string | null = null;
function sessionTitle(): string {
    if (cachedTitle !== null) return cachedTitle;
    const sid = process.env.OPENCODE_SESSION_ID ?? "";
    cachedTitle = "";
    if (sid === "") return cachedTitle;
    try {
        const proc = Bun.spawnSync(["opencode", "api", "session.list"],
            { stdout: "pipe", stderr: "ignore" });
        const sessions = JSON.parse(proc.stdout.toString()).data ?? [];
        cachedTitle = sessions.find((s: { id: string }) => s.id === sid)
            ?.title ?? "";
    } catch {
        cachedTitle = "";
    }
    return cachedTitle;
}

function titleMatchesWindow(sTitle: string, winTitle: string): boolean {
    if (winTitle.includes(sTitle)) return true;
    const stripped = winTitle
        .replace(/^OC \| /, "")
        .replace(/…/g, "")
        .trim();
    return stripped !== "" && sTitle.startsWith(stripped);
}

/** The orchestrator wid: the FOCUSED client when its title matches
 *  THIS session's title (the trusted implicit at the turn boundary);
 *  else the title-validated client among all clients. "" when none. */
function resolveOrchestrator(): string {
    const title = sessionTitle();
    const attr = (path: string): string => Bun.spawnSync(
        ["herbstclient", "attr", path],
        { stdout: "pipe", stderr: "ignore" },
    ).stdout.toString().trim();
    const wids = attr("clients.").match(/0x[0-9a-fA-F]+/g) ?? [];
    if (title === "") return (attr("clients.focus.winid").match(/0x[0-9a-fA-F]+/) ?? [""])[0];
    for (const w of wids) {
        const t = attr(`clients.${w}.title`);
        if (titleMatchesWindow(title, t)) return w;
    }
    return "";
}

interface ToolDef {
    name: string;
    description: string;
    input: Record<string, unknown>;
    execute: (input: never) => Promise<{ content: string }>;
}

export default Plugin.define({
    id: "orchestrate-hlwm",
    async setup(ctx) {
        const tools: ToolDef[] = [
            // ── the agent's operation of the orchestrator window ──
            {
                name: "orchestrator",
                description:
                    "The orchestrator window: its wid, title, tag, and whether it currently holds focus (resolved LIVE — clients.focus verified against THIS session's title from OPENCODE's API; no filesystem state).",
                input: { type: "object", properties: {}, additionalProperties: false },
                execute: async () => {
                    const attr = (path: string): string => Bun.spawnSync(
                        ["herbstclient", "attr", path],
                        { stdout: "pipe", stderr: "ignore" },
                    ).stdout.toString().trim();
                    const wid = resolveOrchestrator();
                    if (wid === "") {
                        return { content: "orchestrator: NOT RESOLVED (no window title-matches this session)" };
                    }
                    const title = attr(`clients.${wid}.title`);
                    const tag = attr(`clients.${wid}.tag`);
                    const focused = attr("clients.focus.winid").includes(wid);
                    return { content: `orchestrator ${wid} — "${title}" on tag '${tag}'${focused ? " (focused)" : ""}` };
                },
            },
            {
                name: "relocate",
                description:
                    "Relocate the orchestrator window (or a given wid) to a tag — created when missing — WITHOUT changing the viewed tag or stealing focus (the atomic four-step: focus → move → restore view → restore focus). Use this to move the agent's terminal to a new workspace and keep working where you are.",
                input: {
                    type: "object",
                    properties: {
                        tag: { type: "string", description: "target tag (an hlwm tag; created when missing)" },
                        winid: { type: "string", description: "window to move (default: the orchestrator window)" },
                    },
                    required: ["tag"],
                    additionalProperties: false,
                },
                execute: async ({ tag, winid }: { tag: string; winid?: string }) => {
                    const id = winid ?? resolveOrchestrator();
                    if (id === "") {
                        return { content: "relocate: no orchestrator window resolved" };
                    }
                    const attr = (path: string): string => Bun.spawnSync(
                        ["herbstclient", "attr", path],
                        { stdout: "pipe", stderr: "ignore" },
                    ).stdout.toString().trim().replaceAll("\"", "");
                    const hc = (args: string[]): number => Bun.spawnSync(
                        ["herbstclient", ...args],
                        { stdout: "ignore", stderr: "ignore" },
                    ).exitCode ?? 1;
                    const viewBefore = attr("tags.focus.name");
                    if (attr(`tags.by-name.${tag}.client_count`) === "" &&
                        attr(`tags.by-name.${tag}`) === "") {
                        if (hc(["add", tag]) !== 0) {
                            return { content: `relocate: could not create tag '${tag}'` };
                        }
                    }
                    const focusBefore = attr("clients.focus.winid");
                    // hlwm 0.9.5's `move` moves the FOCUSED window: the
                    // ATOMIC four-step procedure — focus (the view
                    // follows), move, restore the view, restore the
                    // focus — every step unconditional so a failure is
                    // visible and recoverable
                    hc(["jumpto", id]);
                    if (hc(["move", tag]) !== 0) {
                        return { content: `relocate: move failed for ${id} -> ${tag}` };
                    }
                    if (viewBefore !== "") hc(["use", viewBefore]);
                    if (focusBefore !== "") hc(["jumpto", focusBefore]);
                    return { content: `relocated ${id} to tag '${tag}' (view + focus preserved)` };
                },
            },
        ];
        await ctx.tool.transform((editor) => {
            editor.namespace({
                name: "orchestrate",
                description: "Drive the orchestrator window: live status, focus-steal-free relocation across tags.",
            });
            for (const t of tools) {
                editor.add({
                    name: t.name,
                    description: t.description,
                    input: t.input as never,
                    options: { namespace: "orchestrate", codemode: true },
                    execute: async (input: unknown) => t.execute(input as never),
                });
            }
        });        try {
            // event.subscribe returns an ASYNC ITERABLE — it must be
            // consumed (a handler argument is ignored; the iterable
            // drives)
            const events = ctx.event.subscribe();
            void (async () => {
                for await (const event of events) {
                    const type = (event as { type?: string }).type ?? "";

                    // ── TURN START: a fresh pipeline ──
                    // (session.execution.started: ONCE per turn — the
                    // step events fire per model round-trip. The v2
                    // stream has NO message.updated event.)
                    if (type === "session.execution.started") {
                        const sid = (event as {
                            data?: { sessionID?: string };
                        }).data?.sessionID
                            ?? (event as { properties?: { sessionID?: string } }).properties?.sessionID;
                        if (sid && process.env.OPENCODE_SESSION_ID
                            && sid !== process.env.OPENCODE_SESSION_ID) return;
                        turnActive = true;
                        endPipeline();
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
                                 `herbctl track --quiet | herbctl track --sentry ${wid}`],
                                { stdin: "pipe", stdout: "ignore", stderr: "ignore",
                                  env: { ...process.env,
                                      // the respawn directory, injected:
                                      // the sentry's recover() reads it
                                      // (the server env lacks the
                                      // session id for the API route)
                                      OPENCODE_PROJECT_DIR: projectDir } },
                            );
                        } catch {
                            // no herbctl/herbstclient — inert (the skill's
                            // contract stands)
                        }
                        continue;
                    }

                    // ── TURN END: the execution finished — the cancel
                    // (session.idle DOES NOT EXIST in the v2 stream; the
                    // execution events are the turn boundary) ──
                    if (type === "session.execution.succeeded"
                        || type === "session.execution.failed"
                        || type === "session.execution.interrupted") {
                        const sid = (event as {
                            data?: { sessionID?: string };
                        }).data?.sessionID
                            ?? (event as { properties?: { sessionID?: string } }).properties?.sessionID;
                        if (sid && process.env.OPENCODE_SESSION_ID
                            && sid !== process.env.OPENCODE_SESSION_ID) return;
                        turnActive = false;
                        const p = pipeline;
                        pipeline = null;
                        if (p === null) continue;
                        // ONE character + close: the tracker exits on
                        // the byte (or the EOF behind it); the sentry
                        // follows the tracker's EOF; the sentry MODE
                        // degrades to its own watch and keeps the
                        // coverage
                        try {
                            p.stdin?.write("x");
                        } catch {
                            // already gone
                        }
                        try {
                            p.stdin?.end();
                        } catch {
                            // already gone
                        }
                    }
                }
            })();
        } catch {
            // no event surface — inert
        }
    },
});
