import { describe, expect, it } from "@effect/vitest"
import { Effect } from "effect"

import { isShareBundlePathAllowed } from "../../src/shell/bot-bundle.js"

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
    }))
})
