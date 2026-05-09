import type { BotRecord, PanelConfig } from "./bot.js"
import {
  panelIdentityChatBootstrapScript,
  panelIdentityChatPayload,
  panelIdentityFunctionScript,
  panelIdentityScriptCall
} from "./identity.js"

export type BotConnectorCompatibility = "anthropic" | "openai"

export type BotConnectorSpec = {
  readonly apiKey: string
  readonly baseUrl: string
  readonly compatibility: BotConnectorCompatibility
  readonly modelId: string
  readonly providerId: string
}

export type BotProvisioningSpec = {
  readonly bot: BotRecord
  readonly config: PanelConfig
  readonly connector: BotConnectorSpec | null
  readonly gatewayToken: string
  readonly rawIntent: string
  readonly telegramBotToken: string
}

export type BotProvisioningSnapshot = {
  readonly connector: BotConnectorSpec | null
  readonly gatewayToken: string
  readonly rawIntent: string
  readonly telegramBotToken: string
}

export type BotProvisioningCommand = {
  readonly command: string
  readonly containsSecrets: boolean
  readonly openClawCommand: string
}

const safeShellWordPattern = /^[A-Za-z0-9_@%+=:,./-]+$/u
const singleQuoteEscape = "'\"'\"'"

const openClawEnvironment = [
  "HOME=/home/node",
  "TERM=xterm-256color",
  "XDG_RUNTIME_DIR=/run/user/1000",
  "DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/1000/bus"
]

const onboardPrefix = [
  "openclaw",
  "onboard",
  "--non-interactive",
  "--accept-risk",
  "--flow",
  "quickstart",
  "--mode",
  "local",
  "--workspace",
  "/home/node/.openclaw/workspace"
]

const onboardGatewayArgs = (spec: BotProvisioningSpec): ReadonlyArray<string> => [
  "--gateway-port",
  "18789",
  "--gateway-bind",
  "lan",
  "--gateway-auth",
  "token",
  "--gateway-token",
  spec.gatewayToken,
  "--tailscale",
  "off"
]

const onboardFeatureArgs = [
  "--install-daemon",
  "--daemon-runtime",
  "node",
  "--node-manager",
  "bun",
  "--skip-channels",
  "--skip-search",
  "--skip-health",
  "--skip-ui"
]

const connectorArgs = (connector: BotConnectorSpec | null): ReadonlyArray<string> =>
  connector === null
    ? ["--auth-choice", "skip"]
    : [
      "--auth-choice",
      "custom-api-key",
      "--secret-input-mode",
      "plaintext",
      "--custom-base-url",
      connector.baseUrl,
      "--custom-model-id",
      connector.modelId,
      "--custom-compatibility",
      connector.compatibility,
      ...(
        connector.providerId.length > 0
          ? ["--custom-provider-id", connector.providerId]
          : []
      ),
      ...(
        connector.apiKey.length > 0
          ? ["--custom-api-key", connector.apiKey]
          : []
      )
    ]

export const shellQuote = (value: string): string => {
  if (value.length === 0) {
    return "''"
  }
  return safeShellWordPattern.test(value) ? value : `'${value.replaceAll("'", singleQuoteEscape)}'`
}

export const commandLine = (parts: ReadonlyArray<string>): string => parts.map((part) => shellQuote(part)).join(" ")

export const dockerCreateArgsForBot = (config: PanelConfig, bot: BotRecord): ReadonlyArray<string> => [
  "create",
  "--name",
  bot.containerName,
  "--label",
  `openclaw.panel.bot-id=${bot.id}`,
  "--label",
  "openclaw.panel.managed=true",
  "--label",
  `openclaw.panel.name=${bot.name}`,
  "--privileged",
  "--restart",
  "unless-stopped",
  "--stop-signal",
  "SIGTERM",
  "--tmpfs",
  "/run:rw,noexec,nosuid,size=65536k",
  "--tmpfs",
  "/run/lock:rw,noexec,nosuid,size=65536k",
  "--tmpfs",
  "/tmp:rw,nosuid,nodev",
  "-e",
  "HOME=/home/node",
  "-e",
  "TERM=xterm-256color",
  "-e",
  "XDG_RUNTIME_DIR=/run/user/1000",
  "-e",
  "DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/1000/bus",
  "-e",
  `OPENCLAW_PANEL_BOT_ID=${bot.id}`,
  "-v",
  `${bot.volumeName}:/home/node/.openclaw`,
  "-p",
  `${config.host}:${bot.hostGatewayPort}:18789`,
  config.runnerImage,
  "openclaw-panel-init"
]

export const dockerArgsForBot = (spec: BotProvisioningSpec): ReadonlyArray<string> =>
  dockerCreateArgsForBot(spec.config, spec.bot)

export const openClawOnboardArgs = (spec: BotProvisioningSpec): ReadonlyArray<string> => [
  ...onboardPrefix,
  ...connectorArgs(spec.connector),
  ...onboardGatewayArgs(spec),
  ...onboardFeatureArgs
]

export const generateOpenClawOnboardCommand = (spec: BotProvisioningSpec): string =>
  commandLine(openClawOnboardArgs(spec))

const dockerLine = (args: ReadonlyArray<string>): string =>
  ["\"${DOCKER[@]}\"", ...args.map((part) => shellQuote(part))].join(" ")

const dockerRetryLine = (args: ReadonlyArray<string>): string => {
  const command = dockerLine(args)
  return `for attempt in $(seq 1 60); do ${command} && break; if [ "$attempt" = "60" ]; then exit 1; fi; sleep 1; done`
}

const dockerExecNodeArgs = (
  containerName: string,
  command: ReadonlyArray<string>
): ReadonlyArray<string> => [
  "exec",
  "-u",
  "node",
  ...openClawEnvironment.flatMap((entry) => ["-e", entry]),
  containerName,
  ...command
]

const prepareOnboardingScript = [
  "mkdir -p /home/node/.openclaw/agents/main /home/node/.openclaw/workspace /home/node/.config/systemd/user /run/user/1000",
  "chown -R node:node /home/node/.openclaw /home/node/.config /run/user/1000",
  "chmod 700 /run/user/1000"
].join(" && ")

const postConfigScript = [
  "const fs = require('node:fs');",
  "const path = require('node:path');",
  "const payload = JSON.parse(process.argv[1] || '{}');",
  "const file = '/home/node/.openclaw/openclaw.json';",
  "const workspace = '/home/node/.openclaw/workspace';",
  "const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);",
  "const record = (owner, key) => { const current = isRecord(owner[key]) ? owner[key] : {}; owner[key] = current; return current; };",
  "const config = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};",
  "const gateway = record(config, 'gateway');",
  "const controlUi = record(gateway, 'controlUi');",
  "const auth = record(gateway, 'auth');",
  "gateway.port = 18789;",
  "gateway.mode = 'local';",
  "gateway.bind = 'lan';",
  "controlUi.allowInsecureAuth = true;",
  "controlUi.dangerouslyDisableDeviceAuth = true;",
  "controlUi.allowedOrigins = ['http://localhost:18789', 'http://127.0.0.1:18789'];",
  "auth.mode = 'token';",
  "auth.token = payload.gatewayToken;",
  "if (typeof payload.telegramBotToken === 'string' && payload.telegramBotToken.trim()) { const channels = record(config, 'channels'); const telegram = record(channels, 'telegram'); telegram.enabled = true; telegram.dmPolicy = 'pairing'; telegram.botToken = payload.telegramBotToken.trim(); telegram.groupPolicy = 'allowlist'; telegram.streaming = 'partial'; const plugins = record(config, 'plugins'); const entries = record(plugins, 'entries'); const telegramPlugin = record(entries, 'telegram'); telegramPlugin.enabled = true; }",
  "fs.mkdirSync(path.dirname(file), { recursive: true });",
  String.raw`fs.writeFileSync(file, JSON.stringify(config, null, 2) + '\n', 'utf8');`,
  panelIdentityFunctionScript,
  panelIdentityScriptCall
].join("")

const postConfigPayload = (spec: BotProvisioningSpec): string =>
  JSON.stringify({
    gatewayToken: spec.gatewayToken,
    rawIntent: spec.rawIntent,
    telegramBotToken: spec.telegramBotToken
  })

export const generateBotBootstrapCommand = (spec: BotProvisioningSpec): string =>
  [
    "bash <<'OPENCLAW_PANEL_BOOTSTRAP'",
    "set -euo pipefail",
    "if docker info >/dev/null 2>&1; then DOCKER=(docker); else DOCKER=(sudo -n docker); fi",
    dockerLine(["volume", "create", spec.bot.volumeName]),
    dockerLine(dockerArgsForBot(spec)),
    dockerLine(["start", spec.bot.containerName]),
    dockerRetryLine(["exec", "-u", "root", spec.bot.containerName, "sh", "-lc", "true"]),
    dockerLine([
      "exec",
      "-u",
      "root",
      spec.bot.containerName,
      "sh",
      "-lc",
      prepareOnboardingScript
    ]),
    dockerLine(dockerExecNodeArgs(spec.bot.containerName, openClawOnboardArgs(spec))),
    dockerLine(dockerExecNodeArgs(spec.bot.containerName, [
      "node",
      "-e",
      postConfigScript,
      postConfigPayload(spec)
    ])),
    dockerLine(dockerExecNodeArgs(spec.bot.containerName, [
      "sh",
      "-lc",
      "openclaw daemon install && openclaw daemon restart"
    ])),
    dockerLine(dockerExecNodeArgs(spec.bot.containerName, [
      "node",
      "-e",
      panelIdentityChatBootstrapScript,
      panelIdentityChatPayload(spec.rawIntent)
    ])),
    "OPENCLAW_PANEL_BOOTSTRAP"
  ].join("\n")

export const generateBotProvisioningCommand = (spec: BotProvisioningSpec): BotProvisioningCommand => ({
  command: generateBotBootstrapCommand(spec),
  containsSecrets: true,
  openClawCommand: generateOpenClawOnboardCommand(spec)
})
