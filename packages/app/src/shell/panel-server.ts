import http from "node:http"

import {
  createPanelRuntime,
  handlePanelRequestSafely,
  handlePanelUpgrade,
  type PanelRuntime,
  readPanelConfig
} from "@effect-template/lib"
import { Console, Effect, pipe } from "effect"

import { panelPage } from "./panel-page.js"
import { readTerminalAsset } from "./terminal-assets.js"

const panelAdapter = {
  readTerminalAsset,
  renderPanelPage: panelPage
}

const serve = (runtime: PanelRuntime) =>
  Effect.acquireRelease(
    Effect.async<http.Server, Error>((resume) => {
      const server = http.createServer((request, response) => {
        handlePanelRequestSafely(runtime, panelAdapter, request, response)
      })
      server.on("upgrade", (request, socket, head) => {
        handlePanelUpgrade(runtime, request, socket, head)
      })
      server.on("error", (error: Error) => {
        resume(Effect.fail(error))
      })
      server.listen(runtime.config.port, runtime.config.host, () => {
        resume(Effect.succeed(server))
      })
      return Effect.sync(() => {
        server.close()
      })
    }),
    (server) =>
      Effect.sync(() => {
        server.close()
      })
  )

export const panelServer = pipe(
  readPanelConfig,
  Effect.map((config): PanelRuntime => createPanelRuntime(config)),
  Effect.flatMap((runtime) =>
    pipe(
      serve(runtime),
      Effect.tap(() => Console.log(`OpenClaw panel: http://${runtime.config.host}:${runtime.config.port}`)),
      Effect.flatMap(() => Effect.never)
    )
  )
)
