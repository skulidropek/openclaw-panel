import { describe, expect, it } from "@effect/vitest"
import { Effect } from "effect"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"

import {
  copyPrivateBundleState,
  copyShareBundleState,
  isPrivateBundlePathAllowed,
  isShareBundlePathAllowed
} from "../../src/shell/bot-bundle-files.js"

const withTempDirs = (assertion: (source: string, destination: string) => void): void => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "openclaw-bundle-test-"))
  const source = path.join(tempDir, "source")
  const destination = path.join(tempDir, "destination")
  fs.mkdirSync(source, { recursive: true })
  fs.mkdirSync(destination, { recursive: true })
  assertion(source, destination)
  fs.rmSync(tempDir, { force: true, recursive: true })
}

const writeFile = (root: string, relativePath: string, body = "x"): void => {
  const filePath = path.join(root, relativePath)
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, body, "utf8")
}

const exists = (root: string, relativePath: string): boolean => fs.existsSync(path.join(root, relativePath))

describe("bot bundle shell helpers", () => {
  it.effect("allows portable role files and excludes common secret/runtime paths", () =>
    Effect.sync(() => {
      expect(isShareBundlePathAllowed("workspace/PANEL_INTENT.md")).toBe(true)
      expect(isShareBundlePathAllowed("workspace/lessons/lesson-1.md")).toBe(true)
      expect(isShareBundlePathAllowed("workspace/.env")).toBe(false)
      expect(isShareBundlePathAllowed("workspace/provider-token.txt")).toBe(false)
      expect(isShareBundlePathAllowed("workspace/node_modules/package/index.js")).toBe(false)
      expect(isShareBundlePathAllowed("../openclaw.json")).toBe(false)
      expect(isShareBundlePathAllowed("openclaw.json")).toBe(false)
      expect(isShareBundlePathAllowed("workspace/tasks/runs.sqlite")).toBe(false)
      expect(isShareBundlePathAllowed("workspace/canvas/index.html")).toBe(false)
      expect(isShareBundlePathAllowed("workspace/completions/openclaw.zsh")).toBe(false)
      expect(isPrivateBundlePathAllowed("workspace/IDENTITY.md")).toBe(true)
      expect(isPrivateBundlePathAllowed("npm/node_modules/pkg/index.js")).toBe(false)
      expect(isPrivateBundlePathAllowed("agents/main/sessions/sessions.json")).toBe(false)
    }))

  it.effect("copies compact private state by default and adds selected private attributes", () =>
    Effect.sync(() => {
      withTempDirs((source, destination) => {
        writeFile(source, "openclaw.json", JSON.stringify({ gateway: { auth: { token: "secret" } } }))
        writeFile(source, "identity/device.json")
        writeFile(source, "credentials/telegram.json")
        writeFile(source, "plugins/installs.json")
        writeFile(source, "flows/registry.sqlite")
        writeFile(source, "workspace/IDENTITY.md")
        writeFile(source, "npm/node_modules/pkg/index.js")
        writeFile(source, "logs/config-health.json")
        writeFile(source, "completions/openclaw.zsh")
        writeFile(source, "agents/main/sessions/sessions.json")
        writeFile(source, "agents/main/sessions/chat.jsonl")
        writeFile(source, "agents/main/sessions/chat.trajectory.jsonl")
        writeFile(source, "tasks/runs.sqlite")
        writeFile(source, "canvas/index.html")

        copyPrivateBundleState(source, destination, [])

        expect(exists(destination, "openclaw.json")).toBe(true)
        expect(exists(destination, "identity/device.json")).toBe(true)
        expect(exists(destination, "credentials/telegram.json")).toBe(true)
        expect(exists(destination, "plugins/installs.json")).toBe(true)
        expect(exists(destination, "flows/registry.sqlite")).toBe(true)
        expect(exists(destination, "workspace/IDENTITY.md")).toBe(true)
        expect(exists(destination, "npm/node_modules/pkg/index.js")).toBe(false)
        expect(exists(destination, "logs/config-health.json")).toBe(false)
        expect(exists(destination, "completions/openclaw.zsh")).toBe(false)
        expect(exists(destination, "agents/main/sessions/sessions.json")).toBe(false)
        expect(exists(destination, "tasks/runs.sqlite")).toBe(false)
        expect(exists(destination, "canvas/index.html")).toBe(false)
      })
    }))

  it.effect("copies only requested optional private attributes", () =>
    Effect.sync(() => {
      withTempDirs((source, destination) => {
        writeFile(source, "agents/main/sessions/sessions.json")
        writeFile(source, "agents/main/sessions/chat.jsonl")
        writeFile(source, "agents/main/sessions/chat.trajectory.jsonl")
        writeFile(source, "agents/main/sessions/chat.jsonl.bak-1")
        writeFile(source, "tasks/runs.sqlite")
        writeFile(source, "tasks/runs.sqlite-shm")
        writeFile(source, "canvas/index.html")

        copyPrivateBundleState(source, destination, ["sessions", "tasks", "canvas"])

        expect(exists(destination, "agents/main/sessions/sessions.json")).toBe(true)
        expect(exists(destination, "agents/main/sessions/chat.jsonl")).toBe(true)
        expect(exists(destination, "agents/main/sessions/chat.trajectory.jsonl")).toBe(false)
        expect(exists(destination, "agents/main/sessions/chat.jsonl.bak-1")).toBe(false)
        expect(exists(destination, "tasks/runs.sqlite")).toBe(true)
        expect(exists(destination, "tasks/runs.sqlite-shm")).toBe(true)
        expect(exists(destination, "canvas/index.html")).toBe(true)
      })
    }))

  it.effect("sanitizes share config and model files without copying secret directories", () =>
    Effect.sync(() => {
      withTempDirs((source, destination) => {
        writeFile(source, "workspace/IDENTITY.md")
        writeFile(
          source,
          "openclaw.json",
          JSON.stringify({
            channels: { telegram: { botToken: "secret", enabled: true } },
            gateway: { auth: { token: "secret" }, mode: "local" },
            tools: { profile: "default" }
          })
        )
        writeFile(
          source,
          "agents/main/agent/models.json",
          JSON.stringify({
            providers: { codex: { apiKey: "secret", baseUrl: "https://example.test" } }
          })
        )
        writeFile(source, "credentials/telegram.json")

        copyShareBundleState(source, destination)

        expect(exists(destination, "workspace/IDENTITY.md")).toBe(true)
        expect(exists(destination, "credentials/telegram.json")).toBe(false)
        const config = fs.readFileSync(path.join(destination, "openclaw.json"), "utf8")
        const models = fs.readFileSync(path.join(destination, "agents/main/agent/models.json"), "utf8")
        expect(config).toContain("\"mode\"")
        expect(config).toContain("\"profile\"")
        expect(config).not.toContain("token")
        expect(config).not.toContain("botToken")
        expect(models).toContain("baseUrl")
        expect(models).not.toContain("apiKey")
      })
    }))
})
