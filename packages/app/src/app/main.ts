import { NodeContext, NodeRuntime } from "@effect/platform-node"
import { Effect, pipe } from "effect"

import { program } from "./program.js"

// CHANGE: run the OpenClaw panel through the Node platform runtime
// WHY: keep all Node resources scoped under the platform runtime
// QUOTE(TZ): "Implement the plan."
// REF: user-2026-05-04-openclaw-panel
// SOURCE: n/a
// FORMAT THEOREM: runMain(program) -> managed server lifecycle
// PURITY: SHELL
// EFFECT: Effect<never, Error, NodeContext>
// INVARIANT: program executed with NodeContext.layer
// COMPLEXITY: O(1)/O(1)
const main = pipe(program, Effect.scoped, Effect.provide(NodeContext.layer))

NodeRuntime.runMain(main)
