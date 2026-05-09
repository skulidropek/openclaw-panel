import type { IncomingMessage, ServerResponse } from "node:http"

import { Effect, pipe } from "effect"

import {
  botResponse,
  createBot,
  exportBotCommand,
  findBot,
  listBotResponses,
  type PanelRuntime,
  parseBotAction,
  previewBotCommand,
  readDockerDiagnostics,
  runBotAction
} from "../backend/panel-runtime.js"
import type { PanelConfig } from "../core/bot.js"
import { parseBotAdminPath, proxyBotAdminHttp } from "./bot-admin-proxy.js"
import { errorMessage } from "./error-message.js"
import { notFound, parseForm, readBody, requestPathname, sendJson, sendText } from "./http-utils.js"

export type ServedPanelAsset = {
  readonly body: string
  readonly contentType: string
}

export type PanelHttpAdapter = {
  readonly readTerminalAsset: (pathname: string) => Effect.Effect<ServedPanelAsset, object>
  readonly renderPanelPage: (config: PanelConfig) => string
}

const trimFormValue = (form: URLSearchParams, key: string): string => (form.get(key) ?? "").trim()

const inputFromForm = (form: URLSearchParams) => ({
  name: trimFormValue(form, "name"),
  rawIntent: trimFormValue(form, "rawIntent")
})

const formFromRequest = (request: IncomingMessage) =>
  pipe(
    readBody(request),
    Effect.map((body) => parseForm(body))
  )

const actionBotId = (pathname: string): string | null => {
  const match = /^\/api\/bots\/([^/]+)\/actions$/u.exec(pathname)
  return match?.[1] ?? null
}

const exportCommandBotId = (pathname: string): string | null => {
  const match = /^\/api\/bots\/([^/]+)\/export-command$/u.exec(pathname)
  return match?.[1] ?? null
}

const handleGetRequest = (
  runtime: PanelRuntime,
  adapter: PanelHttpAdapter,
  pathname: string,
  response: ServerResponse
) => {
  if (pathname.startsWith("/assets/xterm")) {
    return pipe(
      adapter.readTerminalAsset(pathname),
      Effect.flatMap((asset) => sendText(response, 200, asset.contentType, asset.body))
    )
  }
  if (pathname === "/" || pathname === "/create" || pathname === "/bots") {
    return sendText(response, 200, "text/html; charset=utf-8", adapter.renderPanelPage(runtime.config))
  }
  if (pathname === "/api/bots") {
    return pipe(
      listBotResponses,
      Effect.flatMap((bots) => sendJson(response, 200, { bots }))
    )
  }
  const exportBotId = exportCommandBotId(pathname)
  if (exportBotId !== null) {
    return pipe(
      exportBotCommand(runtime, exportBotId),
      Effect.flatMap((command) => sendJson(response, 200, command))
    )
  }
  if (pathname === "/api/diagnostics") {
    return pipe(
      readDockerDiagnostics,
      Effect.flatMap((diagnostics) => sendJson(response, 200, diagnostics))
    )
  }
  return notFound(response)
}

const handlePostRequest = (
  runtime: PanelRuntime,
  pathname: string,
  request: IncomingMessage,
  response: ServerResponse
) => {
  if (pathname === "/api/bots/preview-command") {
    return pipe(
      formFromRequest(request),
      Effect.map((form) => inputFromForm(form)),
      Effect.flatMap((input) => previewBotCommand(runtime, input)),
      Effect.flatMap((command) => sendJson(response, 200, command))
    )
  }
  if (pathname === "/api/bots") {
    return pipe(
      formFromRequest(request),
      Effect.map((form) => inputFromForm(form)),
      Effect.flatMap((input) => createBot(runtime, input)),
      Effect.flatMap(({ bot, session }) => sendJson(response, 200, { bot: botResponse(bot), sessionId: session.id }))
    )
  }
  const botId = actionBotId(pathname)
  if (botId === null) {
    return notFound(response)
  }
  return pipe(
    formFromRequest(request),
    Effect.flatMap((form) => {
      const action = parseBotAction(form.get("action"))
      return action === null ? Effect.fail(new Error("Unknown action.")) : runBotAction(runtime, botId, action)
    }),
    Effect.flatMap(({ bot, logs, sessionId }) => sendJson(response, 200, { bot: botResponse(bot), logs, sessionId }))
  )
}

export const handlePanelRequest = (
  runtime: PanelRuntime,
  adapter: PanelHttpAdapter,
  request: IncomingMessage,
  response: ServerResponse
) => {
  const botAdminPath = parseBotAdminPath(request.url)
  if (botAdminPath !== null) {
    return pipe(
      findBot(botAdminPath.botId),
      Effect.flatMap((bot) => proxyBotAdminHttp(bot, botAdminPath, request, response))
    )
  }
  const pathname = requestPathname(request)
  if (request.method === "GET") {
    return handleGetRequest(runtime, adapter, pathname, response)
  }
  return request.method === "POST" ? handlePostRequest(runtime, pathname, request, response) : notFound(response)
}

export const handlePanelRequestSafely = (
  runtime: PanelRuntime,
  adapter: PanelHttpAdapter,
  request: IncomingMessage,
  response: ServerResponse
): void => {
  pipe(
    handlePanelRequest(runtime, adapter, request, response),
    Effect.matchEffect({
      onFailure: (error) => sendJson(response, 400, { error: errorMessage(error) }),
      onSuccess: () => Effect.void
    }),
    Effect.runFork
  )
}
