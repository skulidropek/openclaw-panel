import fs from "node:fs"
import os from "node:os"
import path from "node:path"

import { Data, Effect, pipe } from "effect"

import { parseJson } from "../core/axioms.js"
import {
  type BotRecord,
  botRecordFromNullableFields,
  type BotRecordNullableFields,
  hasRequiredBotRecordFields
} from "../core/bot.js"
import { isJsonArray, isJsonObject, type Json, numberValue, stringValue } from "../core/json.js"

export type PanelState = {
  readonly bots: ReadonlyArray<BotRecord>
}

export class StateStoreError extends Data.TaggedError("StateStoreError")<{
  readonly message: string
}> {}

const stateDir = path.join(os.homedir(), ".openclaw-panel")
const statePath = path.join(stateDir, "state.json")

const emptyState: PanelState = {
  bots: []
}

const parseStatus = (value: string | null): BotRecord["status"] =>
  value === "creating" || value === "deleted" || value === "running" || value === "stopped" || value === "failed"
    || value === "unknown"
    ? value
    : "unknown"

const botFieldsFromJson = (value: Json): BotRecordNullableFields | null =>
  isJsonObject(value)
    ? {
      containerId: stringValue(value["containerId"]),
      containerName: stringValue(value["containerName"]),
      createdAt: stringValue(value["createdAt"]),
      hostGatewayPort: numberValue(value["hostGatewayPort"]),
      id: stringValue(value["id"]),
      name: stringValue(value["name"]),
      status: parseStatus(stringValue(value["status"])),
      updatedAt: stringValue(value["updatedAt"]),
      volumeName: stringValue(value["volumeName"])
    }
    : null

const botFromJson = (value: Json): BotRecord | null => {
  const fields = botFieldsFromJson(value)
  if (fields === null || !hasRequiredBotRecordFields(fields, { requireContainerId: false })) {
    return null
  }
  return botRecordFromNullableFields(fields)
}

const stateFromJson = (value: Json): PanelState => {
  const bots = isJsonObject(value) ? value["bots"] : undefined
  if (!isJsonArray(bots)) {
    return emptyState
  }
  return {
    bots: bots.map((entry) => botFromJson(entry)).filter((entry): entry is BotRecord => entry !== null)
  }
}

export const readPanelState = pipe(
  Effect.try({
    try: () => {
      if (!fs.existsSync(statePath)) {
        return emptyState
      }
      return stateFromJson(parseJson(fs.readFileSync(statePath, "utf8")))
    },
    catch: (error) => new StateStoreError({ message: String(error) })
  })
)

export const writePanelState = (state: PanelState) =>
  Effect.try({
    try: () => {
      fs.mkdirSync(stateDir, { recursive: true })
      fs.writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 })
    },
    catch: (error) => new StateStoreError({ message: String(error) })
  })

export const updateBot = (bot: BotRecord) =>
  pipe(
    readPanelState,
    Effect.map((state) => ({
      bots: [...state.bots.filter((entry) => entry.id !== bot.id), bot]
    })),
    Effect.flatMap((state) => writePanelState(state))
  )

export const removeBot = (botId: string) =>
  pipe(
    readPanelState,
    Effect.map((state) => ({
      bots: state.bots.filter((entry) => entry.id !== botId)
    })),
    Effect.flatMap((state) => writePanelState(state))
  )
