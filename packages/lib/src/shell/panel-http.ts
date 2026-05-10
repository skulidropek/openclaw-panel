import type { IncomingMessage, ServerResponse } from "node:http"

import { Effect, pipe } from "effect"

import {
  botResponse,
  createBot,
  exportBotBundle,
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
import { parseBotBundleMode } from "../core/bundle.js"
import { parseBotAdminPath, proxyBotAdminHttp } from "./bot-admin-proxy.js"
import { readBotBundleArchive, readBotBundleInstallScript } from "./bot-bundle.js"
import { errorMessage } from "./error-message.js"
import { notFound, parseForm, readBody, requestPathname, sendBuffer, sendJson, sendText } from "./http-utils.js"

export type ServedPanelAsset = {
  readonly body: string
  readonly contentType: string
}

export type PanelHttpAdapter = {
  readonly readTerminalAsset: (pathname: string) => Effect.Effect<ServedPanelAsset, object>
  readonly renderPanelPage: (config: PanelConfig) => string
}

type PanelResponseEffect = Effect.Effect<void, object>

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

const exportBundleBotId = (pathname: string): string | null => {
  const match = /^\/api\/bots\/([^/]+)\/export-bundle$/u.exec(pathname)
  return match?.[1] ?? null
}

const botExportAsset = (
  pathname: string
): { readonly asset: "bundle.tar.gz" | "install.sh"; readonly exportId: string } | null => {
  const match = /^\/api\/bot-exports\/([^/]+)\/(bundle\.tar\.gz|install\.sh)$/u.exec(pathname)
  if (match === null) {
    return null
  }
  return {
    asset: match[2] === "install.sh" ? "install.sh" : "bundle.tar.gz",
    exportId: match[1] ?? ""
  }
}

const firstHeader = (value: string | Array<string> | undefined): string | null =>
  Array.isArray(value) ? (value[0] ?? null) : (value ?? null)

const requestOrigin = (runtime: PanelRuntime, request: IncomingMessage): string => {
  const protocol = firstHeader(request.headers["x-forwarded-proto"]) ?? "http"
  const host = firstHeader(request.headers["x-forwarded-host"]) ?? firstHeader(request.headers.host)
    ?? `localhost:${runtime.config.port}`
  return `${protocol}://${host}`
}

const serveBotExportAsset = (
  asset: { readonly asset: "bundle.tar.gz" | "install.sh"; readonly exportId: string },
  response: ServerResponse
): PanelResponseEffect =>
  asset.asset === "install.sh"
    ? pipe(
      readBotBundleInstallScript(asset.exportId),
      Effect.flatMap((body) => sendText(response, 200, "text/x-shellscript; charset=utf-8", body))
    )
    : pipe(
      readBotBundleArchive(asset.exportId),
      Effect.flatMap((body) => sendBuffer(response, 200, "application/gzip", body))
    )

const handleApiGetRequest = (
  runtime: PanelRuntime,
  pathname: string,
  response: ServerResponse
): PanelResponseEffect | null => {
  if (pathname === "/api/bots") {
    return pipe(
      listBotResponses,
      Effect.flatMap((bots) => sendJson(response, 200, { bots }))
    )
  }
  const asset = botExportAsset(pathname)
  if (asset !== null) {
    return serveBotExportAsset(asset, response)
  }
  const exportBotId = exportCommandBotId(pathname)
  if (exportBotId !== null) {
    return pipe(
      exportBotCommand(runtime, exportBotId),
      Effect.flatMap((command) => sendJson(response, 200, command))
    )
  }
  return pathname === "/api/diagnostics"
    ? pipe(
      readDockerDiagnostics,
      Effect.flatMap((diagnostics) => sendJson(response, 200, diagnostics))
    )
    : null
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
  return handleApiGetRequest(runtime, pathname, response) ?? notFound(response)
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
  const bundleBotId = exportBundleBotId(pathname)
  if (bundleBotId !== null) {
    return pipe(
      formFromRequest(request),
      Effect.flatMap((form) => {
        const mode = parseBotBundleMode(form.get("mode"))
        return mode === null
          ? Effect.fail(new Error("Unknown bundle export mode."))
          : exportBotBundle(runtime, bundleBotId, mode, requestOrigin(runtime, request))
      }),
      Effect.flatMap((bundle) => sendJson(response, 200, bundle))
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
