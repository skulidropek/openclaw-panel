import type { IncomingMessage, ServerResponse } from "node:http"

import { Data, Effect } from "effect"

export class HttpInputError extends Data.TaggedError("HttpInputError")<{
  readonly message: string
}> {}

export const readBody = (request: IncomingMessage) =>
  Effect.async<string, HttpInputError>((resume) => {
    const chunks: Array<Buffer> = []
    request.on("data", (chunk: Uint8Array) => {
      chunks.push(Buffer.from(chunk))
    })
    request.on("end", () => {
      resume(Effect.succeed(Buffer.concat(chunks).toString("utf8")))
    })
    request.on("error", (error: Error) => {
      resume(Effect.fail(new HttpInputError({ message: error.message })))
    })
  })

export const sendText = (
  response: ServerResponse,
  statusCode: number,
  contentType: string,
  body: string
): Effect.Effect<void> =>
  Effect.sync(() => {
    response.writeHead(statusCode, {
      "content-length": Buffer.byteLength(body),
      "content-type": contentType
    })
    response.end(body)
  })

export const sendBuffer = (
  response: ServerResponse,
  statusCode: number,
  contentType: string,
  body: Buffer
): Effect.Effect<void> =>
  Effect.sync(() => {
    response.writeHead(statusCode, {
      "content-length": body.length,
      "content-type": contentType
    })
    response.end(body)
  })

export const sendJson = (response: ServerResponse, statusCode: number, body: object): Effect.Effect<void> =>
  sendText(response, statusCode, "application/json; charset=utf-8", `${JSON.stringify(body)}\n`)

export const notFound = (response: ServerResponse): Effect.Effect<void> =>
  sendJson(response, 404, { error: "Not found" })

export const parseForm = (body: string): URLSearchParams => new URLSearchParams(body)

export const requestPathname = (request: IncomingMessage): string => {
  const url = new URL(request.url ?? "/", "http://localhost")
  return url.pathname
}
