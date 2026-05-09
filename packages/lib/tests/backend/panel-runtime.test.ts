import { describe, expect, it } from "@effect/vitest"

import { botResponse, createPanelRuntime, defaultPanelConfig, newBotRecord, parseBotAction } from "../../src/index.js"

describe("panel runtime", () => {
  it("creates isolated in-memory onboarding session state", () => {
    const runtime = createPanelRuntime(defaultPanelConfig)

    expect(runtime.config).toEqual(defaultPanelConfig)
    expect(runtime.sessions.size).toBe(0)
  })

  it("parses supported bot actions and rejects unknown actions", () => {
    expect(parseBotAction("start")).toBe("start")
    expect(parseBotAction("onboard")).toBe("onboard")
    expect(parseBotAction("missing")).toBeNull()
    expect(parseBotAction(null)).toBeNull()
  })

  it("maps bot records to transport-safe bot responses", () => {
    const bot = newBotRecord({
      baseGatewayPort: defaultPanelConfig.baseGatewayPort,
      id: "abc123",
      name: "Example Bot",
      now: "2026-05-09T00:00:00.000Z",
      occupiedPorts: []
    })

    expect(botResponse(bot)).toEqual({
      adminUrl: "/bot-admin/abc123/",
      createdAt: "2026-05-09T00:00:00.000Z",
      hostGatewayPort: 18_789,
      id: "abc123",
      name: "example-bot",
      status: "creating",
      updatedAt: "2026-05-09T00:00:00.000Z"
    })
  })
})
