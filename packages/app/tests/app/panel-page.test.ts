import { defaultPanelConfig } from "@effect-template/lib"
import { describe, expect, it } from "@effect/vitest"

import { panelPage } from "../../src/shell/panel-page.js"

describe("panelPage", () => {
  it("renders the current web panel shell around shared backend config", () => {
    const html = panelPage(defaultPanelConfig)

    expect(html).toContain("OpenClaw Panel")
    expect(html).toContain("Gateway 18789+")
    expect(html).toContain("/api/bots")
  })
})
