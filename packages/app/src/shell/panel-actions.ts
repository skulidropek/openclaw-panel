import { Effect, Match, pipe } from "effect"

import { actionToDockerOperation, type BotAction, type BotRecord, type BotStatus, withStatus } from "../core/bot.js"
import {
  cliInspectContainerStatus,
  cliReadContainerLogs,
  cliRemoveContainer,
  cliRemoveVolume,
  cliRestartContainer,
  cliStartContainer,
  cliStopContainer
} from "./docker-cli.js"
import { removeBot, updateBot } from "./state-store.js"

export type BotActionResult = {
  readonly bot: BotRecord
  readonly logs: string
  readonly sessionId: string
}

type DockerBackedBotAction = Exclude<BotAction, "logs" | "onboard">

const statusFromDocker = (status: string): BotStatus => {
  if (status === "running") {
    return "running"
  }
  return status === "exited" || status === "created" ? "stopped" : "unknown"
}

const runDockerAction = (action: BotAction, bot: BotRecord) =>
  Match.value(actionToDockerOperation(action)).pipe(
    Match.when("start", () => cliStartContainer(bot.containerId)),
    Match.when("stop", () => cliStopContainer(bot.containerId)),
    Match.when("restart", () => cliRestartContainer(bot.containerId)),
    Match.when("remove", () => cliRemoveContainer(bot.containerId)),
    Match.when("none", () => Effect.void),
    Match.exhaustive
  )

const updateStatusAfterAction = (action: BotAction, bot: BotRecord) =>
  action === "delete"
    ? pipe(
      cliRemoveVolume(bot.volumeName),
      Effect.flatMap(() => removeBot(bot.id)),
      Effect.as(withStatus(bot, "deleted", new Date().toISOString()))
    )
    : pipe(
      cliInspectContainerStatus(bot.containerId),
      Effect.map((status) => statusFromDocker(status)),
      Effect.flatMap((status) => {
        const updated = withStatus(bot, status, new Date().toISOString())
        return updateBot(updated).pipe(Effect.as(updated))
      })
    )

const dockerBackedActionResult = (action: DockerBackedBotAction, bot: BotRecord) =>
  pipe(
    runDockerAction(action, bot),
    Effect.flatMap(() => updateStatusAfterAction(action, bot)),
    Effect.map((updated): BotActionResult => ({ bot: updated, logs: "", sessionId: "" }))
  )

export const resolvedActionResult = (
  action: BotAction,
  bot: BotRecord,
  createOnboardingSessionId: (bot: BotRecord) => string
) =>
  Match.value(action).pipe(
    Match.when("onboard", () =>
      Effect.succeed({
        bot,
        logs: "",
        sessionId: createOnboardingSessionId(bot)
      })),
    Match.when("logs", () =>
      cliReadContainerLogs(bot.containerId).pipe(
        Effect.map((logs): BotActionResult => ({ bot, logs, sessionId: "" }))
      )),
    Match.when("start", () => dockerBackedActionResult("start", bot)),
    Match.when("stop", () => dockerBackedActionResult("stop", bot)),
    Match.when("restart", () => dockerBackedActionResult("restart", bot)),
    Match.when("delete", () => dockerBackedActionResult("delete", bot)),
    Match.when("status", () => dockerBackedActionResult("status", bot)),
    Match.exhaustive
  )
