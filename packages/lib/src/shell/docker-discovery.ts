import { Effect, pipe } from "effect"

import { parseJson } from "../core/axioms.js"
import { botRecordFromNullableFields, hasRequiredBotRecordFields } from "../core/bot.js"
import type { BotRecord, BotRecordNullableFields } from "../core/bot.js"
import { isJsonArray, isJsonObject, type Json, type JsonObject, stringValue } from "../core/json.js"
import { runDocker } from "./docker-cli.js"

const nonEmptyLines = (text: string): ReadonlyArray<string> =>
  text.split(/\r?\n/u).map((line) => line.trim()).filter((line) => line.length > 0)

const objectValue = (value: JsonObject, key: string): JsonObject | null => {
  const nested = value[key]
  return nested !== undefined && isJsonObject(nested) ? nested : null
}

const arrayValue = (value: JsonObject, key: string): ReadonlyArray<Json> | null => {
  const nested = value[key]
  return nested !== undefined && isJsonArray(nested) ? nested : null
}

const labelValue = (labels: JsonObject | null, key: string): string | null =>
  labels === null ? null : stringValue(labels[key])

const portBindingHostPort = (ports: JsonObject | null): number | null => {
  const gatewayBindings = ports === null ? null : ports["18789/tcp"]
  if (!isJsonArray(gatewayBindings)) {
    return null
  }
  const first = gatewayBindings[0]
  if (first === undefined || !isJsonObject(first)) {
    return null
  }
  const parsed = Number.parseInt(stringValue(first["HostPort"]) ?? "", 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

const volumeNameFromMounts = (mounts: ReadonlyArray<Json> | null): string | null => {
  if (mounts === null) {
    return null
  }
  const mount = mounts.find((entry) =>
    isJsonObject(entry) && stringValue(entry["Destination"]) === "/home/node/.openclaw"
  )
  return mount !== undefined && isJsonObject(mount) ? stringValue(mount["Name"]) : null
}

const statusFromInspect = (status: string | null): BotRecord["status"] => {
  if (status === "running") {
    return "running"
  }
  return status === "created" || status === "exited" ? "stopped" : "unknown"
}

const containerNameFromInspect = (name: string | null): string | null =>
  name === null ? null : name.replace(/^\/+/u, "")

const inspectBotFields = (value: JsonObject): BotRecordNullableFields => {
  const config = objectValue(value, "Config")
  const state = objectValue(value, "State")
  const networkSettings = objectValue(value, "NetworkSettings")
  const labels = config === null ? null : objectValue(config, "Labels")
  return {
    containerId: stringValue(value["Id"]),
    containerName: containerNameFromInspect(stringValue(value["Name"])),
    createdAt: stringValue(value["Created"]),
    hostGatewayPort: portBindingHostPort(networkSettings === null ? null : objectValue(networkSettings, "Ports")),
    id: labelValue(labels, "openclaw.panel.bot-id"),
    name: labelValue(labels, "openclaw.panel.name"),
    status: statusFromInspect(state === null ? null : stringValue(state["Status"])),
    updatedAt: stringValue(value["Created"]),
    volumeName: volumeNameFromMounts(arrayValue(value, "Mounts"))
  }
}

const botFromInspectObject = (value: JsonObject): BotRecord | null => {
  const fields = inspectBotFields(value)
  if (!hasRequiredBotRecordFields(fields, { requireContainerId: true })) {
    return null
  }
  return botRecordFromNullableFields(fields)
}

const botsFromInspectJson = (text: string): ReadonlyArray<BotRecord> => {
  const parsed = parseJson(text)
  return isJsonArray(parsed)
    ? parsed.map((entry) => isJsonObject(entry) ? botFromInspectObject(entry) : null)
      .filter((entry): entry is BotRecord => entry !== null)
    : []
}

export const cliListManagedBots = pipe(
  runDocker(["container", "ls", "-a", "--filter", "label=openclaw.panel.managed=true", "--quiet"]),
  Effect.map((text) => nonEmptyLines(text)),
  Effect.flatMap((ids) =>
    ids.length === 0
      ? Effect.succeed([])
      : pipe(
        runDocker(["inspect", ...ids]),
        Effect.map((text) => botsFromInspectJson(text))
      )
  )
)
