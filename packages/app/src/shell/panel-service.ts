import { randomUUID } from "node:crypto"
import type { IncomingMessage, ServerResponse } from "node:http"

import { Effect, pipe } from "effect"

import { type BotAction, type BotRecord, newBotRecord, type PanelConfig, withContainerId } from "../core/bot.js"
import { botAdminUrl, parseBotAdminPath, proxyBotAdminHttp } from "./bot-admin-proxy.js"
import {
  cliCreateContainer,
  cliCreateVolume,
  cliStartContainer,
  cliWaitForContainerReady,
  dockerDiagnostics
} from "./docker-cli.js"
import { notFound, parseForm, readBody, requestPathname, sendJson, sendText } from "./http-utils.js"
import { resolvedActionResult } from "./panel-actions.js"
import { exportCommandForBot, previewCommandForForm } from "./panel-command.js"
import { panelPage } from "./panel-page.js"
import { readSyncedPanelState } from "./panel-state-sync.js"
import { ensureRunnerImage } from "./runner-image.js"
import { updateBot } from "./state-store.js"
import { readTerminalAsset } from "./terminal-assets.js"

export type OnboardingSession = {
  readonly botId: string
  readonly containerId: string
  readonly id: string
}

export type PanelRuntime = {
  readonly config: PanelConfig
  readonly sessions: Map<string, OnboardingSession>
}

const parseAction = (value: string | null): BotAction | null =>
  value === "start" || value === "stop" || value === "restart" || value === "delete" || value === "logs"
    || value === "status" || value === "onboard"
    ? value
    : null

const botResponse = (bot: BotRecord) => ({
  adminUrl: botAdminUrl(bot.id),
  createdAt: bot.createdAt,
  hostGatewayPort: bot.hostGatewayPort,
  id: bot.id,
  name: bot.name,
  status: bot.status,
  updatedAt: bot.updatedAt
})

export const findBot = (botId: string) =>
  pipe(
    readSyncedPanelState,
    Effect.flatMap((state) => {
      const bot = state.bots.find((entry) => entry.id === botId)
      return bot === undefined ? Effect.fail(new Error("Bot was not found.")) : Effect.succeed(bot)
    })
  )

const createBot = (runtime: PanelRuntime, name: string) =>
  pipe(
    readSyncedPanelState,
    Effect.flatMap((state) => {
      const now = new Date().toISOString()
      const bot = newBotRecord({
        baseGatewayPort: runtime.config.baseGatewayPort,
        id: randomUUID().slice(0, 12),
        name,
        now,
        occupiedPorts: state.bots.map((entry) => entry.hostGatewayPort)
      })
      return pipe(
        ensureRunnerImage(runtime.config),
        Effect.flatMap(() => cliCreateVolume(bot.volumeName)),
        Effect.flatMap(() => cliCreateContainer(runtime.config, bot)),
        Effect.flatMap((containerId) => cliStartContainer(containerId).pipe(Effect.as(containerId))),
        Effect.flatMap((containerId) => cliWaitForContainerReady(containerId).pipe(Effect.as(containerId))),
        Effect.flatMap((containerId) => {
          const saved = withContainerId(bot, containerId, new Date().toISOString())
          const session = {
            botId: saved.id,
            containerId,
            id: randomUUID()
          }
          runtime.sessions.set(session.id, session)
          return updateBot(saved).pipe(Effect.as({ bot: saved, session }))
        })
      )
    })
  )

const previewBotCommand = (runtime: PanelRuntime, form: URLSearchParams) =>
  pipe(
    readSyncedPanelState,
    Effect.map((state) => previewCommandForForm(runtime.config, state.bots.map((entry) => entry.hostGatewayPort), form))
  )

const exportBotCommand = (runtime: PanelRuntime, botId: string) =>
  pipe(
    findBot(botId),
    Effect.flatMap((bot) => exportCommandForBot(runtime.config, bot))
  )

const createOnboardingSession = (runtime: PanelRuntime, bot: BotRecord): OnboardingSession => {
  const session = {
    botId: bot.id,
    containerId: bot.containerId,
    id: randomUUID()
  }
  runtime.sessions.set(session.id, session)
  return session
}

const handleAction = (runtime: PanelRuntime, botId: string, action: BotAction) =>
  pipe(
    findBot(botId),
    Effect.flatMap((bot) => resolvedActionResult(action, bot, (entry) => createOnboardingSession(runtime, entry).id))
  )

const actionBotId = (pathname: string): string | null => {
  const match = /^\/api\/bots\/([^/]+)\/actions$/u.exec(pathname)
  return match?.[1] ?? null
}

const exportCommandBotId = (pathname: string): string | null => {
  const match = /^\/api\/bots\/([^/]+)\/export-command$/u.exec(pathname)
  return match?.[1] ?? null
}

const handleGetRequest = (runtime: PanelRuntime, pathname: string, response: ServerResponse) => {
  if (pathname.startsWith("/assets/xterm")) {
    return pipe(
      readTerminalAsset(pathname),
      Effect.flatMap((asset) => sendText(response, 200, asset.contentType, asset.body))
    )
  }
  if (pathname === "/" || pathname === "/create" || pathname === "/bots") {
    return sendText(response, 200, "text/html; charset=utf-8", panelPage(runtime.config))
  }
  if (pathname === "/api/bots") {
    return pipe(
      readSyncedPanelState,
      Effect.flatMap((state) => sendJson(response, 200, { bots: state.bots.map((bot) => botResponse(bot)) }))
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
      dockerDiagnostics,
      Effect.flatMap((diagnostics) => sendJson(response, 200, { docker: diagnostics }))
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
      readBody(request),
      Effect.map((body) => parseForm(body)),
      Effect.flatMap((form) => previewBotCommand(runtime, form)),
      Effect.flatMap((command) => sendJson(response, 200, command))
    )
  }
  if (pathname === "/api/bots") {
    return pipe(
      readBody(request),
      Effect.map((body) => parseForm(body)),
      Effect.flatMap((form) => createBot(runtime, form.get("name") ?? "openclaw-bot")),
      Effect.flatMap(({ bot, session }) => sendJson(response, 200, { bot: botResponse(bot), sessionId: session.id }))
    )
  }
  const botId = actionBotId(pathname)
  if (botId === null) {
    return notFound(response)
  }
  return pipe(
    readBody(request),
    Effect.map((body) => parseForm(body)),
    Effect.flatMap((form) => {
      const action = parseAction(form.get("action"))
      return action === null ? Effect.fail(new Error("Unknown action.")) : handleAction(runtime, botId, action)
    }),
    Effect.flatMap(({ bot, logs, sessionId }) => sendJson(response, 200, { bot: botResponse(bot), logs, sessionId }))
  )
}

export const handlePanelRequest = (
  runtime: PanelRuntime,
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
    return handleGetRequest(runtime, pathname, response)
  }
  return request.method === "POST" ? handlePostRequest(runtime, pathname, request, response) : notFound(response)
}

export const handlePanelRequestSafely = (
  runtime: PanelRuntime,
  request: IncomingMessage,
  response: ServerResponse
): void => {
  pipe(
    handlePanelRequest(runtime, request, response),
    Effect.matchEffect({
      onFailure: (error) => sendJson(response, 400, { error: String(error) }),
      onSuccess: () => Effect.void
    }),
    Effect.runFork
  )
}

export const findOnboardingContainerId = (runtime: PanelRuntime, sessionId: string) => {
  return pipe(
    Effect.succeed(runtime.sessions.get(sessionId)),
    Effect.flatMap((session) =>
      session === undefined
        ? Effect.fail(new Error("Onboarding session was not found."))
        : Effect.succeed(session.containerId)
    )
  )
}
