import http from "node:http"
import type net from "node:net"

import { Data, Effect, pipe } from "effect"

import { parseJson } from "../core/axioms.js"
import type { BotRecord, DockerContainerSpec, PanelConfig } from "../core/bot.js"
import { isJsonObject, stringValue } from "../core/json.js"

export type DockerHttpResponse = {
  readonly body: string
  readonly statusCode: number
}

export class DockerEngineError extends Data.TaggedError("DockerEngineError")<{
  readonly message: string
}> {}

const dockerRequest = (
  config: PanelConfig,
  method: "DELETE" | "GET" | "POST",
  requestPath: string,
  body?: string
) =>
  Effect.async<DockerHttpResponse, DockerEngineError>((resume) => {
    const request = http.request(
      {
        headers: body === undefined
          ? {}
          : {
            "content-length": Buffer.byteLength(body),
            "content-type": "application/json"
          },
        method,
        path: requestPath,
        socketPath: config.dockerSocketPath
      },
      (response) => {
        const chunks: Array<Buffer> = []
        response.on("data", (chunk: Uint8Array) => {
          chunks.push(Buffer.from(chunk))
        })
        response.on("end", () => {
          resume(
            Effect.succeed({
              body: Buffer.concat(chunks).toString("utf8"),
              statusCode: response.statusCode ?? 0
            })
          )
        })
      }
    )
    request.on("error", (error: Error) => {
      resume(Effect.fail(new DockerEngineError({ message: error.message })))
    })
    if (body !== undefined) {
      request.write(body)
    }
    request.end()
    return Effect.sync(() => {
      request.destroy()
    })
  })

const requireStatus = (response: DockerHttpResponse, expected: ReadonlyArray<number>, action: string) =>
  expected.includes(response.statusCode)
    ? Effect.succeed(response.body)
    : Effect.fail(
      new DockerEngineError({
        message: `${action} failed with HTTP ${response.statusCode}: ${response.body}`
      })
    )

const containerIdFromBody = (body: string): Effect.Effect<string, DockerEngineError> =>
  Effect.try({
    try: () => {
      const value = parseJson(body)
      if (!isJsonObject(value)) {
        return ""
      }
      return stringValue(value["Id"]) ?? ""
    },
    catch: (error) => new DockerEngineError({ message: String(error) })
  }).pipe(
    Effect.flatMap((id) =>
      id.length > 0
        ? Effect.succeed(id)
        : Effect.fail(new DockerEngineError({ message: "Docker response did not include an id." }))
    )
  )

export const createVolume = (config: PanelConfig, volumeName: string) =>
  pipe(
    dockerRequest(config, "POST", "/volumes/create", JSON.stringify({ Name: volumeName })),
    Effect.flatMap((response) => requireStatus(response, [201], "create volume"))
  )

export const createContainer = (config: PanelConfig, bot: BotRecord, spec: DockerContainerSpec) =>
  pipe(
    dockerRequest(
      config,
      "POST",
      `/containers/create?name=${encodeURIComponent(bot.containerName)}`,
      JSON.stringify(spec)
    ),
    Effect.flatMap((response) => requireStatus(response, [201], "create container")),
    Effect.flatMap((body) => containerIdFromBody(body))
  )

export const startContainer = (config: PanelConfig, containerId: string) =>
  pipe(
    dockerRequest(config, "POST", `/containers/${encodeURIComponent(containerId)}/start`),
    Effect.flatMap((response) => requireStatus(response, [204, 304], "start container"))
  )

export const stopContainer = (config: PanelConfig, containerId: string) =>
  pipe(
    dockerRequest(config, "POST", `/containers/${encodeURIComponent(containerId)}/stop?t=10`),
    Effect.flatMap((response) => requireStatus(response, [204, 304], "stop container"))
  )

export const restartContainer = (config: PanelConfig, containerId: string) =>
  pipe(
    dockerRequest(config, "POST", `/containers/${encodeURIComponent(containerId)}/restart?t=10`),
    Effect.flatMap((response) => requireStatus(response, [204], "restart container"))
  )

export const removeContainer = (config: PanelConfig, containerId: string) =>
  pipe(
    dockerRequest(config, "DELETE", `/containers/${encodeURIComponent(containerId)}?force=true&v=false`),
    Effect.flatMap((response) => requireStatus(response, [204], "remove container"))
  )

export const readContainerLogs = (config: PanelConfig, containerId: string) =>
  pipe(
    dockerRequest(
      config,
      "GET",
      `/containers/${encodeURIComponent(containerId)}/logs?stdout=true&stderr=true&tail=200`
    ),
    Effect.flatMap((response) => requireStatus(response, [200], "read container logs"))
  )

export const inspectContainerStatus = (config: PanelConfig, containerId: string) =>
  pipe(
    dockerRequest(config, "GET", `/containers/${encodeURIComponent(containerId)}/json`),
    Effect.flatMap((response) => requireStatus(response, [200], "inspect container")),
    Effect.flatMap((body) =>
      Effect.try({
        try: () => {
          const value = parseJson(body)
          const state = isJsonObject(value) ? value["State"] : undefined
          if (state === undefined || !isJsonObject(state)) {
            return "unknown"
          }
          return stringValue(state["Status"]) ?? "unknown"
        },
        catch: (error) => new DockerEngineError({ message: String(error) })
      })
    )
  )

export const createExec = (config: PanelConfig, containerId: string, command: ReadonlyArray<string>) =>
  pipe(
    dockerRequest(
      config,
      "POST",
      `/containers/${encodeURIComponent(containerId)}/exec`,
      JSON.stringify({
        AttachStderr: true,
        AttachStdin: true,
        AttachStdout: true,
        Cmd: command,
        Env: [
          "HOME=/home/node",
          "TERM=xterm-256color",
          "XDG_RUNTIME_DIR=/run/user/1000",
          "DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/1000/bus"
        ],
        Tty: true,
        User: "node"
      })
    ),
    Effect.flatMap((response) => requireStatus(response, [201], "create exec")),
    Effect.flatMap((body) => containerIdFromBody(body))
  )

export type ExecAttachHandlers = {
  readonly onData: (chunk: Buffer) => void
  readonly onEnd: () => void
  readonly onError: (error: DockerEngineError) => void
  readonly onReady: (socket: net.Socket) => void
}

export const startExecAttach = (
  config: PanelConfig,
  execId: string,
  handlers: ExecAttachHandlers
) => {
  const body = JSON.stringify({ Detach: false, Tty: true })
  const request = http.request(
    {
      headers: {
        "content-length": Buffer.byteLength(body),
        "content-type": "application/json"
      },
      method: "POST",
      path: `/exec/${encodeURIComponent(execId)}/start`,
      socketPath: config.dockerSocketPath
    },
    (response) => {
      handlers.onReady(response.socket)
      response.on("data", (chunk: Uint8Array) => {
        handlers.onData(Buffer.from(chunk))
      })
      response.on("end", handlers.onEnd)
    }
  )
  request.on("error", (error: Error) => {
    handlers.onError(new DockerEngineError({ message: error.message }))
  })
  request.write(body)
  request.end()
  return request
}
