import { describe, expect, it } from "@effect/vitest"
import { Effect } from "effect"

import {
  botBundleContainsSecrets,
  botBundleInstallCommand,
  createBotBundleManifest,
  generateBotBundleInstallScript,
  parseBotBundleIncludeAttribute,
  parseBotBundleIncludeAttributes,
  parseBotBundleMode
} from "../../src/core/bundle.js"

describe("bot bundle core", () => {
  it.effect("parses export modes and marks private bundles as secret-bearing", () =>
    Effect.sync(() => {
      expect(parseBotBundleMode("share")).toBe("share")
      expect(parseBotBundleMode("private")).toBe("private")
      expect(parseBotBundleMode("unknown")).toBeNull()
      expect(parseBotBundleMode(null)).toBeNull()
      expect(botBundleContainsSecrets("share")).toBe(false)
      expect(botBundleContainsSecrets("private")).toBe(true)
    }))

  it.effect("parses supported private include attributes and rejects generated completions", () =>
    Effect.sync(() => {
      expect(parseBotBundleIncludeAttribute("sessions")).toBe("sessions")
      expect(parseBotBundleIncludeAttribute("tasks")).toBe("tasks")
      expect(parseBotBundleIncludeAttribute("canvas")).toBe("canvas")
      expect(parseBotBundleIncludeAttribute("completions")).toBeNull()
      expect(parseBotBundleIncludeAttributes(["canvas", "sessions", "canvas"])).toEqual(["sessions", "canvas"])
      expect(parseBotBundleIncludeAttributes(["tasks", "unknown"])).toBeNull()
    }))

  it.effect("creates a deterministic portable bundle manifest", () =>
    Effect.sync(() => {
      expect(
        createBotBundleManifest({
          exportedAt: "2026-05-09T00:00:00.000Z",
          includeAttributes: ["sessions", "tasks"],
          mode: "share",
          sourceBotId: "bot001",
          sourceBotName: "Adyghe Tutor"
        })
      ).toEqual({
        containsSecrets: false,
        exportedAt: "2026-05-09T00:00:00.000Z",
        includeAttributes: ["sessions", "tasks"],
        mode: "share",
        runnerVersion: "2",
        sourceBotId: "bot001",
        sourceBotName: "adyghe-tutor",
        version: 1
      })
    }))

  it.effect("quotes install commands and emits a self-contained Docker installer", () =>
    Effect.sync(() => {
      expect(botBundleInstallCommand("https://panel.example/install.sh?x='bad'")).toContain("'\"'\"'")
      const manifest = createBotBundleManifest({
        exportedAt: "2026-05-09T00:00:00.000Z",
        includeAttributes: [],
        mode: "private",
        sourceBotId: "bot001",
        sourceBotName: "Adyghe Tutor"
      })
      const script = generateBotBundleInstallScript({
        bundleUrl: "https://panel.example/api/bot-exports/abc/bundle.tar.gz",
        defaultBotName: "Adyghe Tutor",
        defaultGatewayPort: 18_789,
        defaultRunnerImage: "openclaw-panel/openclaw-bot-runner:latest",
        manifest
      })
      expect(script).toContain("docker")
      expect(script).toContain("bundle_url=https://panel.example/api/bot-exports/abc/bundle.tar.gz")
      expect(script).toContain("openclaw daemon install && openclaw daemon restart")
      expect(script).toContain("openclaw-panel-")
      expect(script).toContain("bundle_mode=private")
    }))
})
