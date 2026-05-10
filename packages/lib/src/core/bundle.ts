import { normalizeBotName } from "./bot.js"
import { shellQuote } from "./provisioning.js"

export type BotBundleMode = "share" | "private"

export type BotBundleManifest = {
  readonly containsSecrets: boolean
  readonly exportedAt: string
  readonly mode: BotBundleMode
  readonly runnerVersion: string
  readonly sourceBotId: string
  readonly sourceBotName: string
  readonly version: 1
}

export type BotBundleExport = {
  readonly bundleUrl: string
  readonly containsSecrets: boolean
  readonly expiresAt: string
  readonly exportId: string
  readonly installCommand: string
  readonly mode: BotBundleMode
}

export type BotBundleManifestInput = {
  readonly exportedAt: string
  readonly mode: BotBundleMode
  readonly sourceBotId: string
  readonly sourceBotName: string
}

export type BotBundleInstallSpec = {
  readonly bundleUrl: string
  readonly defaultBotName: string
  readonly defaultGatewayPort: number
  readonly defaultRunnerImage: string
  readonly manifest: BotBundleManifest
}

export const botBundleTtlMs = 24 * 60 * 60 * 1000
export const botBundleVersion = 1
export const openClawRunnerVersion = "2"

export const parseBotBundleMode = (value: string | null): BotBundleMode | null =>
  value === "share" || value === "private" ? value : null

export const botBundleContainsSecrets = (mode: BotBundleMode): boolean => mode === "private"

export const createBotBundleManifest = (input: BotBundleManifestInput): BotBundleManifest => ({
  containsSecrets: botBundleContainsSecrets(input.mode),
  exportedAt: input.exportedAt,
  mode: input.mode,
  runnerVersion: openClawRunnerVersion,
  sourceBotId: input.sourceBotId,
  sourceBotName: normalizeBotName(input.sourceBotName),
  version: botBundleVersion
})

export const botBundleInstallCommand = (installScriptUrl: string): string =>
  `curl -fsSL ${shellQuote(installScriptUrl)} | bash`

export { generateBotBundleInstallScript } from "./bundle-install-script.js"
