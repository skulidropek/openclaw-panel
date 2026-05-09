import { describe, expect, it } from "@effect/vitest"
import { Effect } from "effect"

import {
  actionToDockerOperation,
  allocateGatewayPort,
  defaultPanelConfig,
  dockerSpecForBot,
  newBotRecord
} from "../../src/core/bot.js"

describe("bot core", () => {
  it.effect("allocates the first free gateway port", () =>
    Effect.sync(() => {
      expect(allocateGatewayPort(18_789, [18_789, 18_790])).toBe(18_791)
    }))

  it.effect("normalizes bot records deterministically", () =>
    Effect.sync(() => {
      const bot = newBotRecord({
        baseGatewayPort: 18_789,
        id: "abc123",
        name: " Sales Helper! ",
        now: "2026-05-04T00:00:00.000Z",
        occupiedPorts: []
      })
      expect(bot.name).toBe("sales-helper")
      expect(bot.containerName).toBe("openclaw-panel-abc123")
      expect(bot.volumeName).toBe("openclaw-panel-abc123-home")
    }))

  it.effect("builds panel runner Docker spec", () =>
    Effect.sync(() => {
      const bot = newBotRecord({
        baseGatewayPort: 18_789,
        id: "bot001",
        name: "bot",
        now: "2026-05-04T00:00:00.000Z",
        occupiedPorts: []
      })
      const spec = dockerSpecForBot(defaultPanelConfig, bot)
      expect(spec.Cmd).toEqual(["openclaw-panel-init"])
      expect(spec.HostConfig["Privileged"]).toBe(true)
      expect(spec.HostConfig["StopSignal"]).toBe("SIGTERM")
      expect(spec.HostConfig["PortBindings"]).toEqual({
        "18789/tcp": [{ HostIp: "127.0.0.1", HostPort: "18789" }]
      })
    }))

  it.effect("maps panel actions to Docker operations", () =>
    Effect.sync(() => {
      expect(actionToDockerOperation("restart")).toBe("restart")
      expect(actionToDockerOperation("delete")).toBe("remove")
      expect(actionToDockerOperation("logs")).toBe("none")
      expect(actionToDockerOperation("onboard")).toBe("none")
    }))
})
