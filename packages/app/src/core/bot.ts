import type { JsonObject } from "./json.js"

export type BotStatus = "creating" | "deleted" | "running" | "stopped" | "failed" | "unknown"

export type BotAction = "start" | "stop" | "restart" | "delete" | "logs" | "status" | "onboard"

export type BotRecord = {
  readonly containerId: string
  readonly containerName: string
  readonly createdAt: string
  readonly hostGatewayPort: number
  readonly id: string
  readonly name: string
  readonly status: BotStatus
  readonly updatedAt: string
  readonly volumeName: string
}

export type BotRecordNullableFields = {
  readonly containerId: string | null
  readonly containerName: string | null
  readonly createdAt: string | null
  readonly hostGatewayPort: number | null
  readonly id: string | null
  readonly name: string | null
  readonly status: BotStatus
  readonly updatedAt: string | null
  readonly volumeName: string | null
}

export type BotRecordFieldPolicy = {
  readonly requireContainerId: boolean
}

export type CreateBotDraft = {
  readonly baseGatewayPort: number
  readonly id: string
  readonly name: string
  readonly now: string
  readonly occupiedPorts: ReadonlyArray<number>
}

export type PanelConfig = {
  readonly baseGatewayPort: number
  readonly dockerSocketPath: string
  readonly host: string
  readonly port: number
  readonly runnerImage: string
}

export type DockerContainerSpec = {
  readonly Cmd: ReadonlyArray<string>
  readonly Env: ReadonlyArray<string>
  readonly ExposedPorts: JsonObject
  readonly HostConfig: JsonObject
  readonly Image: string
  readonly Labels: JsonObject
  readonly Tty: boolean
}

const botNamePattern = /[^a-z0-9_-]+/gu

const dockerOperations: Record<BotAction, "none" | "remove" | "restart" | "start" | "stop"> = {
  delete: "remove",
  logs: "none",
  onboard: "none",
  restart: "restart",
  start: "start",
  status: "none",
  stop: "stop"
}

export const defaultPanelConfig: PanelConfig = {
  baseGatewayPort: 18_789,
  dockerSocketPath: "/var/run/docker.sock",
  host: "127.0.0.1",
  port: 8080,
  runnerImage: "openclaw-panel/openclaw-bot-runner:latest"
}

export const normalizeBotName = (name: string): string => {
  const replaced = name.trim().toLowerCase().replaceAll(botNamePattern, "-")
  const withoutPrefix = replaced.startsWith("-") ? replaced.slice(1) : replaced
  const normalized = withoutPrefix.endsWith("-") ? withoutPrefix.slice(0, -1) : withoutPrefix
  return normalized.length > 0 ? normalized.slice(0, 48) : "openclaw-bot"
}

export const containerNameForBot = (botId: string): string => `openclaw-panel-${botId}`

export const volumeNameForBot = (botId: string): string => `openclaw-panel-${botId}-home`

export const allocateGatewayPort = (basePort: number, occupiedPorts: ReadonlyArray<number>): number => {
  const occupied = new Set(occupiedPorts)
  let candidate = basePort
  while (occupied.has(candidate)) {
    candidate += 1
  }
  return candidate
}

export const newBotRecord = (draft: CreateBotDraft): BotRecord => {
  const port = allocateGatewayPort(draft.baseGatewayPort, draft.occupiedPorts)
  return {
    containerId: "",
    containerName: containerNameForBot(draft.id),
    createdAt: draft.now,
    hostGatewayPort: port,
    id: draft.id,
    name: normalizeBotName(draft.name),
    status: "creating",
    updatedAt: draft.now,
    volumeName: volumeNameForBot(draft.id)
  }
}

export const hasRequiredBotRecordFields = (
  fields: BotRecordNullableFields,
  policy: BotRecordFieldPolicy
): boolean => {
  const required = policy.requireContainerId
    ? [
      fields.id,
      fields.name,
      fields.containerId,
      fields.containerName,
      fields.volumeName,
      fields.createdAt,
      fields.updatedAt
    ]
    : [fields.id, fields.name, fields.containerName, fields.volumeName, fields.createdAt, fields.updatedAt]
  return !required.includes(null) && fields.hostGatewayPort !== null
}

const textOrEmpty = (value: string | null): string => value ?? ""

const numberOrZero = (value: number | null): number => value ?? 0

export const botRecordFromNullableFields = (fields: BotRecordNullableFields): BotRecord => ({
  containerId: textOrEmpty(fields.containerId),
  containerName: textOrEmpty(fields.containerName),
  createdAt: textOrEmpty(fields.createdAt),
  hostGatewayPort: numberOrZero(fields.hostGatewayPort),
  id: textOrEmpty(fields.id),
  name: textOrEmpty(fields.name),
  status: fields.status,
  updatedAt: textOrEmpty(fields.updatedAt),
  volumeName: textOrEmpty(fields.volumeName)
})

export const withContainerId = (bot: BotRecord, containerId: string, now: string): BotRecord => ({
  ...bot,
  containerId,
  status: "running",
  updatedAt: now
})

export const withStatus = (bot: BotRecord, status: BotStatus, now: string): BotRecord => ({
  ...bot,
  status,
  updatedAt: now
})

export const actionToDockerOperation = (action: BotAction): "none" | "remove" | "restart" | "start" | "stop" =>
  dockerOperations[action]

export const dockerSpecForBot = (config: PanelConfig, bot: BotRecord): DockerContainerSpec => ({
  Cmd: ["openclaw-panel-init"],
  Env: [
    "HOME=/home/node",
    "TERM=xterm-256color",
    "XDG_RUNTIME_DIR=/run/user/1000",
    "DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/1000/bus",
    `OPENCLAW_PANEL_BOT_ID=${bot.id}`
  ],
  ExposedPorts: {
    "18789/tcp": {}
  },
  HostConfig: {
    Binds: [
      `${bot.volumeName}:/home/node/.openclaw`
    ],
    PortBindings: {
      "18789/tcp": [
        {
          HostIp: config.host,
          HostPort: String(bot.hostGatewayPort)
        }
      ]
    },
    Privileged: true,
    RestartPolicy: {
      Name: "unless-stopped"
    },
    StopSignal: "SIGTERM",
    Tmpfs: {
      "/run": "rw,noexec,nosuid,size=65536k",
      "/run/lock": "rw,noexec,nosuid,size=65536k",
      "/tmp": "rw,nosuid,nodev"
    }
  },
  Image: config.runnerImage,
  Labels: {
    "openclaw.panel.bot-id": bot.id,
    "openclaw.panel.managed": "true",
    "openclaw.panel.name": bot.name
  },
  Tty: true
})
