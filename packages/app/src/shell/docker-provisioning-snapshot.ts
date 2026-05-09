import { Effect, pipe } from "effect"

import { parseJson } from "../core/axioms.js"
import { isJsonObject, type Json, stringValue } from "../core/json.js"
import type { BotConnectorCompatibility, BotConnectorSpec, BotProvisioningSnapshot } from "../core/provisioning.js"
import { runDocker } from "./docker-cli.js"

const provisioningSnapshotScript = [
  "const fs=require('node:fs');",
  "const file='/home/node/.openclaw/openclaw.json';",
  "const intentFile='/home/node/.openclaw/workspace/PANEL_INTENT.md';",
  "const cfg=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):{};",
  "const isRecord=(value)=>value!==null&&typeof value==='object'&&!Array.isArray(value);",
  "const get=(owner,key)=>isRecord(owner)?owner[key]:undefined;",
  "const text=(value)=>typeof value==='string'?value:'';",
  "const primary=text(get(get(get(cfg,'agents'),'defaults'),'model')?.primary);",
  "const slash=primary.indexOf('/');",
  "const providerId=slash>0?primary.slice(0,slash):'';",
  "const modelId=slash>0?primary.slice(slash+1):'';",
  "const provider=get(get(get(cfg,'models'),'providers'),providerId);",
  "const hasCustomProvider=isRecord(provider)&&text(provider.baseUrl).length>0&&modelId.length>0;",
  "const connector=hasCustomProvider?{providerId,modelId,baseUrl:text(provider.baseUrl),apiKey:text(provider.apiKey),compatibility:provider.api==='anthropic-messages'?'anthropic':'openai'}:null;",
  "const rawIntent=fs.existsSync(intentFile)?fs.readFileSync(intentFile,'utf8').trim():'';",
  "const snapshot={gatewayToken:text(get(get(get(cfg,'gateway'),'auth'),'token')),telegramBotToken:text(get(get(get(cfg,'channels'),'telegram'),'botToken')),rawIntent,connector};",
  "process.stdout.write(JSON.stringify(snapshot));"
].join("")

const compatibilityFromJson = (value: string | null): BotConnectorCompatibility =>
  value === "anthropic" ? "anthropic" : "openai"

const connectorFromJson = (value: Json | undefined): BotConnectorSpec | null => {
  if (value === undefined || !isJsonObject(value)) {
    return null
  }
  const baseUrl = stringValue(value["baseUrl"])
  const modelId = stringValue(value["modelId"])
  if (baseUrl === null || modelId === null) {
    return null
  }
  return {
    apiKey: stringValue(value["apiKey"]) ?? "",
    baseUrl,
    compatibility: compatibilityFromJson(stringValue(value["compatibility"])),
    modelId,
    providerId: stringValue(value["providerId"]) ?? ""
  }
}

const provisioningSnapshotFromJson = (text: string): BotProvisioningSnapshot => {
  const parsed = parseJson(text)
  if (!isJsonObject(parsed)) {
    return {
      connector: null,
      gatewayToken: "",
      rawIntent: "",
      telegramBotToken: ""
    }
  }
  return {
    connector: connectorFromJson(parsed["connector"]),
    gatewayToken: stringValue(parsed["gatewayToken"]) ?? "",
    rawIntent: stringValue(parsed["rawIntent"]) ?? "",
    telegramBotToken: stringValue(parsed["telegramBotToken"]) ?? ""
  }
}

export const cliReadProvisioningSnapshot = (containerId: string) =>
  pipe(
    runDocker(["exec", "-u", "node", containerId, "node", "-e", provisioningSnapshotScript]),
    Effect.map((text) => provisioningSnapshotFromJson(text))
  )
