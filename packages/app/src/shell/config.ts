import { Effect } from "effect"

import { defaultPanelConfig, type PanelConfig } from "../core/bot.js"

const numberFromEnv = (value: string | undefined, fallback: number): number => {
  const parsed = Number.parseInt(value ?? "", 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

const stringFromEnv = (value: string | undefined, fallback: string): string => {
  const normalized = value?.trim() ?? ""
  return normalized.length > 0 ? normalized : fallback
}

export const readPanelConfig = Effect.sync(
  (): PanelConfig => ({
    baseGatewayPort: numberFromEnv(
      process.env["OPENCLAW_PANEL_GATEWAY_PORT_START"],
      defaultPanelConfig.baseGatewayPort
    ),
    dockerSocketPath: stringFromEnv(process.env["OPENCLAW_PANEL_DOCKER_SOCKET"], defaultPanelConfig.dockerSocketPath),
    host: stringFromEnv(process.env["OPENCLAW_PANEL_HOST"], defaultPanelConfig.host),
    port: numberFromEnv(process.env["OPENCLAW_PANEL_PORT"], defaultPanelConfig.port),
    runnerImage: stringFromEnv(process.env["OPENCLAW_PANEL_RUNNER_IMAGE"], defaultPanelConfig.runnerImage)
  })
)
