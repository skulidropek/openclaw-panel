import { randomUUID } from "node:crypto"

import { Effect, pipe } from "effect"

import { type BotRecord, newBotRecord, type PanelConfig } from "../core/bot.js"
import {
  type BotConnectorCompatibility,
  type BotConnectorSpec,
  type BotProvisioningSnapshot,
  generateBotProvisioningCommand
} from "../core/provisioning.js"
import { cliReadProvisioningSnapshot } from "./docker-provisioning-snapshot.js"

const emptyProvisioningSnapshot: BotProvisioningSnapshot = {
  connector: null,
  gatewayToken: "",
  rawIntent: "",
  telegramBotToken: ""
}

const randomGatewayToken = (): string =>
  `${randomUUID().replaceAll("-", "")}${randomUUID().replaceAll("-", "").slice(0, 16)}`

const connectorCompatibilityFromForm = (value: string | null): BotConnectorCompatibility =>
  value === "anthropic" ? "anthropic" : "openai"

const trimFormValue = (form: URLSearchParams, key: string): string => (form.get(key) ?? "").trim()

const connectorFromForm = (form: URLSearchParams): BotConnectorSpec | null => {
  const baseUrl = trimFormValue(form, "connectorBaseUrl")
  const modelId = trimFormValue(form, "connectorModelId")
  if (baseUrl.length === 0 || modelId.length === 0) {
    return null
  }
  return {
    apiKey: trimFormValue(form, "connectorApiKey"),
    baseUrl,
    compatibility: connectorCompatibilityFromForm(form.get("connectorCompatibility")),
    modelId,
    providerId: trimFormValue(form, "connectorProviderId")
  }
}

const provisioningSnapshotFromForm = (form: URLSearchParams): BotProvisioningSnapshot => ({
  connector: connectorFromForm(form),
  gatewayToken: randomGatewayToken(),
  rawIntent: trimFormValue(form, "rawIntent"),
  telegramBotToken: trimFormValue(form, "telegramBotToken")
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

export const previewCommandForForm = (
  config: PanelConfig,
  occupiedPorts: ReadonlyArray<number>,
  form: URLSearchParams
) => {
  const now = new Date().toISOString()
  const bot = newBotRecord({
    baseGatewayPort: config.baseGatewayPort,
    id: randomUUID().slice(0, 12),
    name: trimFormValue(form, "name") || "openclaw-bot",
    now,
    occupiedPorts
  })
  return commandResponseFor(config, bot, provisioningSnapshotFromForm(form))
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
