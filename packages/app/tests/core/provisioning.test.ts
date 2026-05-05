import { describe, expect, it } from "@effect/vitest"
import { Effect } from "effect"

import { defaultPanelConfig, newBotRecord } from "../../src/core/bot.js"
import {
  type BotProvisioningSpec,
  generateBotProvisioningCommand,
  generateOpenClawOnboardCommand,
  shellQuote
} from "../../src/core/provisioning.js"

const bot = newBotRecord({
  baseGatewayPort: 18_789,
  id: "bot001",
  name: "Sales Helper",
  now: "2026-05-04T00:00:00.000Z",
  occupiedPorts: []
})

const spec = {
  bot,
  config: defaultPanelConfig,
  connector: {
    apiKey: "key with ' quote; rm -rf /",
    baseUrl: "https://models.example.test/v1",
    compatibility: "openai",
    modelId: "deepseek-chat",
    providerId: "custom-openai"
  },
  gatewayToken: "gateway-token",
  rawIntent: "Answer only about sales.",
  telegramBotToken: "123456:telegram-secret"
} satisfies BotProvisioningSpec

describe("provisioning command core", () => {
  it.effect("quotes shell words without allowing command injection", () =>
    Effect.sync(() => {
      expect(shellQuote("plain-value")).toBe("plain-value")
      expect(shellQuote("key with ' quote; rm -rf /")).toBe("'key with '\"'\"' quote; rm -rf /'")
    }))

  it.effect("builds the native non-interactive OpenClaw onboarding command", () =>
    Effect.sync(() => {
      const command = generateOpenClawOnboardCommand(spec)
      expect(command).toContain("openclaw onboard --non-interactive --accept-risk")
      expect(command).toContain("--install-daemon")
      expect(command).toContain("--auth-choice custom-api-key")
      expect(command).toContain("--custom-base-url https://models.example.test/v1")
      expect(command).toContain("--custom-model-id deepseek-chat")
      expect(command).toContain("--gateway-auth token --gateway-token gateway-token")
    }))

  it.effect("builds a Docker bootstrap command managed by panel labels", () =>
    Effect.sync(() => {
      const command = generateBotProvisioningCommand(spec)
      expect(command.containsSecrets).toBe(true)
      expect(command.command).toContain("bash <<'OPENCLAW_PANEL_BOOTSTRAP'")
      expect(command.command).toContain("--label openclaw.panel.managed=true")
      expect(command.command).toContain("--label openclaw.panel.bot-id=bot001")
      expect(command.command).toContain("-p 127.0.0.1:18789:18789")
      expect(command.command).toContain("openclaw daemon install && openclaw daemon restart")
      expect(command.command).toContain("'key with '\"'\"' quote; rm -rf /'")
    }))

  it.effect("uses OpenClaw auth skip when no connector is selected", () =>
    Effect.sync(() => {
      const command = generateOpenClawOnboardCommand({
        ...spec,
        connector: null
      })
      expect(command).toContain("--auth-choice skip")
      expect(command).not.toContain("--custom-api-key")
    }))
})
