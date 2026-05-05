/**
 * Compose the OpenClaw panel server as a single effect.
 *
 * @returns Effect that starts the local panel server and keeps it alive.
 *
 * @pure false - uses Console output
 * @effect Console
 * @invariant server is bound exactly once while the runtime scope is alive
 * @precondition true
 * @postcondition local HTTP server accepts panel requests until interrupted
 * @complexity O(1)
 * @throws Never - all errors are typed in the Effect error channel
 */
// CHANGE: replace the demo CLI with the OpenClaw panel server
// WHY: the product surface is a local Docker orchestration panel, not a greeting command
// QUOTE(TZ): "Implement the plan."
// REF: user-2026-05-04-openclaw-panel
// SOURCE: n/a
// FORMAT THEOREM: start(program) -> exactly one local HTTP server resource
// PURITY: SHELL
// EFFECT: Effect<never, Error, Console>
// INVARIANT: server lifetime is scoped to NodeRuntime
// COMPLEXITY: O(1)/O(1)

export { panelServer as program } from "../shell/panel-server.js"
