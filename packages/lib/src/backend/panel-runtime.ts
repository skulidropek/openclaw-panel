import { Effect, pipe } from "effect"

import { type BotAction, type BotRecord, newBotRecord, type PanelConfig, withContainerId } from "../core/bot.js"
import type { BotBundleIncludeAttribute, BotBundleMode } from "../core/bundle.js"
import { botAdminUrl } from "../shell/bot-admin-proxy.js"
import { createBotBundleExport } from "../shell/bot-bundle.js"
import {
  cliCreateContainer,
  cliCreateVolume,
  cliStartContainer,
  cliWaitForContainerReady,
  dockerDiagnostics
} from "../shell/docker-cli.js"
import { resolvedActionResult } from "../shell/panel-actions.js"
import { type BotCommandInput, exportCommandForBot, previewCommandForInput } from "../shell/panel-command.js"
import { readSyncedPanelState } from "../shell/panel-state-sync.js"
import { ensureRunnerImage } from "../shell/runner-image.js"
import { updateBot } from "../shell/state-store.js"

export type OnboardingSession = {
  readonly botId: string
  readonly containerId: string
  readonly id: string
  readonly rawIntent: string
}

export type PanelRuntime = {
  readonly config: PanelConfig
  readonly sessions: Map<string, OnboardingSession>
}

export type BotResponse = {
  readonly adminUrl: string
  readonly createdAt: string
  readonly hostGatewayPort: number
  readonly id: string
  readonly name: string
  readonly status: BotRecord["status"]
  readonly updatedAt: string
}

export type CreateBotInput = BotCommandInput

export type CreateBotResult = {
  readonly bot: BotRecord
  readonly session: OnboardingSession
}

const randomId = (): string => crypto.randomUUID()

export const createPanelRuntime = (config: PanelConfig): PanelRuntime => ({
  config,
  sessions: new Map()
})

export const parseBotAction = (value: string | null): BotAction | null =>
  value === "start" || value === "stop" || value === "restart" || value === "delete" || value === "logs"
    || value === "status" || value === "onboard"
    ? value
    : null

export const botResponse = (bot: BotRecord): BotResponse => ({
  adminUrl: botAdminUrl(bot.id),
  createdAt: bot.createdAt,
  hostGatewayPort: bot.hostGatewayPort,
  id: bot.id,
  name: bot.name,
  status: bot.status,
  updatedAt: bot.updatedAt
})

export const listBots = pipe(
  readSyncedPanelState,
  Effect.map((state) => state.bots)
)

export const listBotResponses = pipe(
  listBots,
  Effect.map((bots) => bots.map((bot) => botResponse(bot)))
)

export const findBot = (botId: string) =>
  pipe(
    readSyncedPanelState,
    Effect.flatMap((state) => {
      const bot = state.bots.find((entry) => entry.id === botId)
      return bot === undefined ? Effect.fail(new Error("Bot was not found.")) : Effect.succeed(bot)
    })
  )

export const createOnboardingSession = (
  runtime: PanelRuntime,
  bot: BotRecord,
  rawIntent = ""
): OnboardingSession => {
  const session = {
    botId: bot.id,
    containerId: bot.containerId,
    id: randomId(),
    rawIntent
  }
  runtime.sessions.set(session.id, session)
  return session
}

export const findOnboardingSession = (runtime: PanelRuntime, sessionId: string) =>
  pipe(
    Effect.succeed(runtime.sessions.get(sessionId)),
    Effect.flatMap((session) =>
      session === undefined
        ? Effect.fail(new Error("Onboarding session was not found."))
        : Effect.succeed(session)
    )
  )

export const createBot = (runtime: PanelRuntime, input: CreateBotInput) =>
  pipe(
    readSyncedPanelState,
    Effect.flatMap((state) => {
      const now = new Date().toISOString()
      const bot = newBotRecord({
        baseGatewayPort: runtime.config.baseGatewayPort,
        id: randomId().slice(0, 12),
        name: input.name.trim() || "openclaw-bot",
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
          const session = createOnboardingSession(runtime, saved, input.rawIntent.trim())
          return updateBot(saved).pipe(Effect.as({ bot: saved, session } satisfies CreateBotResult))
        })
      )
    })
  )

export const previewBotCommand = (runtime: PanelRuntime, input: BotCommandInput) =>
  pipe(
    readSyncedPanelState,
    Effect.map((state) =>
      previewCommandForInput(runtime.config, state.bots.map((entry) => entry.hostGatewayPort), input)
    )
  )

export const exportBotCommand = (runtime: PanelRuntime, botId: string) =>
  pipe(
    findBot(botId),
    Effect.flatMap((bot) => exportCommandForBot(runtime.config, bot))
  )

export const exportBotBundle = (
  runtime: PanelRuntime,
  botId: string,
  mode: BotBundleMode,
  includeAttributes: ReadonlyArray<BotBundleIncludeAttribute>,
  origin: string
) =>
  pipe(
    findBot(botId),
    Effect.flatMap((bot) => createBotBundleExport(runtime.config, bot, mode, includeAttributes, origin))
  )

export const runBotAction = (runtime: PanelRuntime, botId: string, action: BotAction) =>
  pipe(
    findBot(botId),
    Effect.flatMap((bot) => resolvedActionResult(action, bot, (entry) => createOnboardingSession(runtime, entry).id))
  )

export const readDockerDiagnostics = pipe(
  dockerDiagnostics,
  Effect.map((diagnostics) => ({ docker: diagnostics }))
)
