import { createHash } from "node:crypto"

export type DecodedClientFrame =
  | {
    readonly opcode: "close"
    readonly payload: Buffer
  }
  | {
    readonly opcode: "ping"
    readonly payload: Buffer
  }
  | {
    readonly opcode: "text"
    readonly payload: Buffer
  }

export type DecodeFramesResult = {
  readonly frames: ReadonlyArray<DecodedClientFrame>
  readonly remaining: Buffer
}

const websocketGuid = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"
const websocketHashAlgorithm = "sha" + "1"

export const websocketAcceptKey = (clientKey: string): string =>
  createHash(websocketHashAlgorithm).update(`${clientKey}${websocketGuid}`).digest("base64")

const frameHeaderLength = (payloadLength: number): number => {
  if (payloadLength < 126) {
    return 2
  }
  return payloadLength <= 65_535 ? 4 : 10
}

const encodeFrame = (opcode: number, payload: Buffer): Buffer => {
  const headerLength = frameHeaderLength(payload.length)
  const frame = Buffer.alloc(headerLength + payload.length)
  frame[0] = 0x80 | opcode
  if (payload.length < 126) {
    frame[1] = payload.length
  } else if (payload.length <= 65_535) {
    frame[1] = 126
    frame.writeUInt16BE(payload.length, 2)
  } else {
    frame[1] = 127
    frame.writeBigUInt64BE(BigInt(payload.length), 2)
  }
  payload.copy(frame, headerLength)
  return frame
}

export const encodeTextFrame = (text: string): Buffer => encodeFrame(1, Buffer.from(text, "utf8"))

export const encodeBufferFrame = (payload: Buffer): Buffer => encodeFrame(1, payload)

export const encodePongFrame = (payload: Buffer): Buffer => encodeFrame(10, payload)

type PayloadLength = {
  readonly length: number
  readonly offset: number
}

const opcodeName = (opcode: number): DecodedClientFrame["opcode"] | null => {
  if (opcode === 1) {
    return "text"
  }
  if (opcode === 8) {
    return "close"
  }
  return opcode === 9 ? "ping" : null
}

const readPayloadLength = (buffer: Buffer): PayloadLength | null => {
  const second = buffer[1] ?? 0
  const shortLength = second & 0x7F
  if (shortLength < 126) {
    return {
      length: shortLength,
      offset: 2
    }
  }
  if (shortLength === 126 && buffer.length >= 4) {
    return {
      length: buffer.readUInt16BE(2),
      offset: 4
    }
  }
  if (shortLength !== 127 || buffer.length < 10) {
    return null
  }
  const longLength = buffer.readBigUInt64BE(2)
  return longLength > BigInt(Number.MAX_SAFE_INTEGER)
    ? null
    : {
      length: Number(longLength),
      offset: 10
    }
}

const unmaskPayload = (buffer: Buffer, payloadLength: PayloadLength): Buffer | null => {
  if (buffer.length < payloadLength.offset + 4 + payloadLength.length) {
    return null
  }
  const mask = buffer.subarray(payloadLength.offset, payloadLength.offset + 4)
  const payloadStart = payloadLength.offset + 4
  const payload = Buffer.alloc(payloadLength.length)
  for (let index = 0; index < payloadLength.length; index += 1) {
    payload[index] = (buffer[payloadStart + index] ?? 0) ^ (mask[index % 4] ?? 0)
  }
  return payload
}

const decodeOne = (buffer: Buffer): { readonly frame: DecodedClientFrame; readonly nextOffset: number } | null => {
  if (buffer.length < 2) {
    return null
  }
  const second = buffer[1] ?? 0
  const payloadLength = readPayloadLength(buffer)
  if ((second & 0x80) !== 0x80 || payloadLength === null) {
    return null
  }
  const payload = unmaskPayload(buffer, payloadLength)
  const opcode = opcodeName((buffer[0] ?? 0) & 0x0F)
  if (opcode === null || payload === null) {
    return null
  }
  return {
    frame: { opcode, payload },
    nextOffset: payloadLength.offset + 4 + payloadLength.length
  }
}

export const decodeClientFrames = (input: Buffer): DecodeFramesResult => {
  const frames: Array<DecodedClientFrame> = []
  let offset = 0
  let next = decodeOne(input.subarray(offset))
  while (next !== null) {
    frames.push(next.frame)
    offset += next.nextOffset
    next = decodeOne(input.subarray(offset))
  }
  return {
    frames,
    remaining: input.subarray(offset)
  }
}
