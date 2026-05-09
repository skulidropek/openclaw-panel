import { describe, expect, it } from "@effect/vitest"
import { Effect } from "effect"

import { decodeClientFrames, encodeTextFrame, websocketAcceptKey } from "../../src/shell/websocket.js"

const maskedTextFrame = (text: string): Buffer => {
  const payload = Buffer.from(text, "utf8")
  const mask = Buffer.from([1, 2, 3, 4])
  const frame = Buffer.alloc(6 + payload.length)
  frame[0] = 0x81
  frame[1] = 0x80 | payload.length
  mask.copy(frame, 2)
  for (const [index, element] of payload.entries()) {
    frame[6 + index] = element ^ mask.readUInt8(index % 4)
  }
  return frame
}

describe("websocket core", () => {
  it.effect("computes RFC websocket accept key", () =>
    Effect.sync(() => {
      expect(websocketAcceptKey("dGhlIHNhbXBsZSBub25jZQ==")).toBe("s3pPLMBiTxaQ9kYGzzhZRbK+xOo=")
    }))

  it.effect("encodes terminal output as an unmasked server text frame", () =>
    Effect.sync(() => {
      expect(encodeTextFrame("ok").toString("hex")).toBe("81026f6b")
    }))

  it.effect("decodes masked browser text frames", () =>
    Effect.sync(() => {
      const decoded = decodeClientFrames(maskedTextFrame("hello\n"))
      expect(decoded.remaining.length).toBe(0)
      expect(decoded.frames).toHaveLength(1)
      expect(decoded.frames[0]?.opcode).toBe("text")
      expect(decoded.frames[0]?.payload.toString("utf8")).toBe("hello\n")
    }))
})
