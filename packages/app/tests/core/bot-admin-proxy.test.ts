import { describe, expect, it } from "@effect/vitest"
import { Effect } from "effect"

import { buildBotAdminUpstreamPath, parseBotAdminPath, rewriteBotAdminHtml } from "../../src/shell/bot-admin-proxy.js"

describe("bot admin proxy core", () => {
  it.effect("maps empty admin route to the default OpenClaw chat session", () =>
    Effect.sync(() => {
      const path = parseBotAdminPath("/bot-admin/qwensmoke")

      expect(path?.botId).toBe("qwensmoke")
      expect(path === null ? "" : buildBotAdminUpstreamPath(path)).toBe("/chat?session=main")
    }))

  it.effect("preserves nested OpenClaw asset paths and query strings", () =>
    Effect.sync(() => {
      const path = parseBotAdminPath("/bot-admin/qwensmoke/assets/app.js?version=1")

      expect(path?.rawPath).toBe("/assets/app.js")
      expect(path === null ? "" : buildBotAdminUpstreamPath(path)).toBe("/assets/app.js?version=1")
    }))

  it.effect("ignores non-admin panel routes", () =>
    Effect.sync(() => {
      expect(parseBotAdminPath("/api/bots")).toBeNull()
    }))

  it.effect("rewrites root and relative HTML links through the bot proxy prefix", () =>
    Effect.sync(() => {
      const rewritten = rewriteBotAdminHtml(
        "<html><head><link href=\"/favicon.svg\"><script src=\"./assets/app.js\"></script></head></html>",
        "bot-1",
        "<script>window.__test=true;</script>"
      )

      expect(rewritten).toContain("href=\"/bot-admin/bot-1/favicon.svg\"")
      expect(rewritten).toContain("src=\"/bot-admin/bot-1/assets/app.js\"")
      expect(rewritten).toContain("window.__test=true")
    }))
})
