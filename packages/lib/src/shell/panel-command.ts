import { randomUUID } from "node:crypto"

import { Effect, pipe } from "effect"

import { type BotRecord, newBotRecord, type PanelConfig } from "../core/bot.js"
import { type BotProvisioningSnapshot, generateBotProvisioningCommand } from "../core/provisioning.js"
import { cliReadProvisioningSnapshot } from "./docker-provisioning-snapshot.js"

export type BotCommandInput = {
  readonly name: string
  readonly rawIntent: string
}

const emptyProvisioningSnapshot: BotProvisioningSnapshot = {
  connector: null,
  gatewayToken: "",
  rawIntent: "",
  telegramBotToken: ""
}

const randomGatewayToken = (): string =>
  `${randomUUID().replaceAll("-", "")}${randomUUID().replaceAll("-", "").slice(0, 16)}`

const provisioningSnapshotFromInput = (input: BotCommandInput): BotProvisioningSnapshot => ({
  connector: null,
  gatewayToken: randomGatewayToken(),
  rawIntent: input.rawIntent.trim(),
  telegramBotToken: ""
})

const snapshotWithGatewayToken = (snapshot: BotProvisioningSnapshot): BotProvisioningSnapshot => ({
  ...snapshot,
  gatewayToken: snapshot.gatewayToken.length > 0 ? snapshot.gatewayToken : randomGatewayToken()
})

export const commandResponseFor = (config: PanelConfig, bot: BotRecord, snapshot: BotProvisioningSnapshot) =>
  generateBotProvisioningCommand({
    bot,
    config,
    ...snapshotWithGatewayToken(snapshot)
  })

export const previewCommandForInput = (
  config: PanelConfig,
  occupiedPorts: ReadonlyArray<number>,
  input: BotCommandInput
) => {
  const now = new Date().toISOString()
  const bot = newBotRecord({
    baseGatewayPort: config.baseGatewayPort,
    id: randomUUID().slice(0, 12),
    name: input.name.trim() || "openclaw-bot",
    now,
    occupiedPorts
  })
  return commandResponseFor(config, bot, provisioningSnapshotFromInput(input))
}

export const exportCommandForBot = (config: PanelConfig, bot: BotRecord) =>
  pipe(
    cliReadProvisioningSnapshot(bot.containerId),
    Effect.match({
      onFailure: () => emptyProvisioningSnapshot,
      onSuccess: (snapshot) => snapshot
    }),
    Effect.map((snapshot) => commandResponseFor(config, bot, snapshot))
  )
