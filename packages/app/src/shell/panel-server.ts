import http from "node:http"
import type { Duplex } from "node:stream"

import { Console, Effect, pipe } from "effect"

import { parseJson } from "../core/axioms.js"
import { isJsonObject, type Json, numberValue, stringValue } from "../core/json.js"
import { parseBotAdminPath, proxyBotAdminUpgrade } from "./bot-admin-proxy.js"
import { readPanelConfig } from "./config.js"
import {
  finalizeOnboardingProcess,
  type InteractiveDockerProcess,
  type OnboardingFinalizeStage,
  startOnboardingProcess
} from "./docker-onboarding.js"
import {
  findBot,
  findOnboardingSession,
  handlePanelRequestSafely,
  type OnboardingSession,
  type PanelRuntime
} from "./panel-service.js"
import {
  decodeClientFrames,
  encodeBufferFrame,
  encodePongFrame,
  encodeTextFrame,
  websocketAcceptKey
} from "./websocket.js"

const sessionIdFromPath = (value: string | undefined): string | null => {
  const pathname = new URL(value ?? "/", "http://localhost").pathname
  const match = /^\/api\/onboarding\/([^/]+)$/u.exec(pathname)
  return match?.[1] ?? null
}

const rejectUpgrade = (socket: Duplex, message: string): void => {
  socket.write(`HTTP/1.1 400 Bad Request\r\ncontent-length: ${Buffer.byteLength(message)}\r\n\r\n${message}`)
  socket.end()
}

const acceptUpgrade = (socket: Duplex, key: string): void => {
  socket.write(
    [
      "HTTP/1.1 101 Switching Protocols",
      "Upgrade: websocket",
      "Connection: Upgrade",
      `Sec-WebSocket-Accept: ${websocketAcceptKey(key)}`,
      "",
      ""
    ].join("\r\n")
  )
}

const socketWritable = (socket: Duplex): boolean => !socket.destroyed && !socket.writableEnded

const writeSocket = (socket: Duplex, frame: Buffer | string): void => {
  if (socketWritable(socket)) {
    socket.write(frame)
  }
}

const endSocket = (socket: Duplex): void => {
  if (socketWritable(socket)) {
    socket.end()
  }
}

type OnboardingClientMessage =
  | {
    readonly data: Buffer
    readonly type: "input"
  }
  | {
    readonly cols: number
    readonly rows: number
    readonly type: "resize"
  }

const inputMessage = (data: string): OnboardingClientMessage => ({
  data: Buffer.from(data, "utf8"),
  type: "input"
})

const terminalDimension = (value: number | null, fallback: number): number => {
  if (value === null) {
    return fallback
  }
  return Math.max(2, Math.min(240, Math.trunc(value)))
}

const messageFromJson = (text: string, json: Json): OnboardingClientMessage => {
  if (!isJsonObject(json)) {
    return inputMessage(text)
  }
  const messageType = stringValue(json["type"])
  if (messageType === "resize") {
    return {
      cols: terminalDimension(numberValue(json["cols"]), 120),
      rows: terminalDimension(numberValue(json["rows"]), 32),
      type: "resize"
    }
  }
  const data = typeof json["data"] === "string" ? json["data"] : ""
  return messageType === "input" ? inputMessage(data) : inputMessage(text)
}

const decodeOnboardingMessage = (payload: Buffer) => {
  const text = payload.toString("utf8")
  if (!text.startsWith("{")) {
    return Effect.succeed(inputMessage(text))
  }
  return pipe(
    Effect.try({
      try: () => parseJson(text),
      catch: () => new Error("Invalid terminal message JSON.")
    }),
    Effect.match({
      onFailure: () => inputMessage(text),
      onSuccess: (json) => messageFromJson(text, json)
    })
  )
}

const applyOnboardingMessage = (process: InteractiveDockerProcess, message: OnboardingClientMessage): void => {
  if (message.type === "input") {
    process.write(message.data)
  } else {
    process.resize(message.cols, message.rows)
  }
}

const finalizeStageMessage = (stage: OnboardingFinalizeStage): string => {
  if (stage === "identity-files") {
    return "Loading... saving bot role inside the OpenClaw workspace."
  }
  if (stage === "gateway-restart") {
    return "Loading... applying gateway settings and restarting OpenClaw."
  }
  if (stage === "role-chat") {
    return "Loading... sending the role to OpenClaw chat and waiting for identity bootstrap."
  }
  return "Loading complete. OpenClaw identity is ready."
}

const writeFinalizeStage = (socket: Duplex, stage: OnboardingFinalizeStage): void => {
  writeSocket(socket, encodeTextFrame(`\n[setup-stage:${stage}] ${finalizeStageMessage(stage)}\n`))
}

const finalizeAndCloseSocket = (session: OnboardingSession, socket: Duplex): void => {
  writeSocket(
    socket,
    encodeTextFrame(
      "\n[finalizing OpenClaw daemon]\nLoading... the panel is finishing setup before access is enabled.\n"
    )
  )
  pipe(
    finalizeOnboardingProcess(session.containerId, session.rawIntent, {
      onStage: (stage) => {
        writeFinalizeStage(socket, stage)
      }
    }),
    Effect.matchEffect({
      onFailure: (error) =>
        Effect.sync(() => {
          writeSocket(socket, encodeTextFrame(`\n[daemon finalize error] ${String(error)}\n`))
          endSocket(socket)
        }),
      onSuccess: () =>
        Effect.sync(() => {
          writeSocket(socket, encodeTextFrame("\n[OpenClaw daemon ready]\n"))
          endSocket(socket)
        })
    }),
    Effect.runFork
  )
}

const attachExecToSocket = (runtime: PanelRuntime, sessionId: string, socket: Duplex) => {
  let clientClosed = false
  return pipe(
    findOnboardingSession(runtime, sessionId),
    Effect.flatMap((session) =>
      startOnboardingProcess(session.containerId, {
        onData: (chunk) => {
          writeSocket(socket, encodeBufferFrame(chunk))
        },
        onEnd: () => {
          if (!clientClosed) finalizeAndCloseSocket(session, socket)
        },
        onError: (error) => {
          writeSocket(socket, encodeTextFrame(`\n[Docker error] ${error.message}\n`))
          endSocket(socket)
        }
      })
    ),
    Effect.map((process: InteractiveDockerProcess) => {
      let pending: Buffer = Buffer.alloc(0)
      socket.on("data", (chunk: Uint8Array) => {
        pending = Buffer.concat([pending, Buffer.from(chunk)])
        const decoded = decodeClientFrames(pending)
        pending = decoded.remaining
        for (const frame of decoded.frames) {
          if (frame.opcode === "text") {
            applyOnboardingMessage(process, Effect.runSync(decodeOnboardingMessage(frame.payload)))
          } else if (frame.opcode === "ping") {
            writeSocket(socket, encodePongFrame(frame.payload))
          } else {
            endSocket(socket)
          }
        }
      })
      socket.on("close", () => {
        clientClosed = true
        process.kill()
      })
    })
  )
}

const proxyBotAdminSocket = (
  botAdminPath: NonNullable<ReturnType<typeof parseBotAdminPath>>,
  request: http.IncomingMessage,
  socket: Duplex,
  head: Buffer
): void => {
  pipe(
    findBot(botAdminPath.botId),
    Effect.flatMap((bot) => proxyBotAdminUpgrade(bot, botAdminPath, request, socket, head)),
    Effect.matchEffect({
      onFailure: (error) =>
        Effect.sync(() => {
          rejectUpgrade(socket, `OpenClaw admin websocket failed: ${String(error)}`)
        }),
      onSuccess: () => Effect.void
    }),
    Effect.runFork
  )
}

const handleUpgrade = (runtime: PanelRuntime, request: http.IncomingMessage, socket: Duplex, head: Buffer): void => {
  const botAdminPath = parseBotAdminPath(request.url)
  if (botAdminPath !== null) {
    proxyBotAdminSocket(botAdminPath, request, socket, head)
    return
  }
  const sessionId = sessionIdFromPath(request.url)
  const keyHeader = request.headers["sec-websocket-key"]
  if (sessionId === null || typeof keyHeader !== "string") {
    rejectUpgrade(socket, "Invalid onboarding websocket.")
    return
  }
  acceptUpgrade(socket, keyHeader)
  pipe(
    attachExecToSocket(runtime, sessionId, socket),
    Effect.matchEffect({
      onFailure: (error) =>
        Effect.sync(() => {
          socket.write(encodeTextFrame(`\n[onboarding error] ${String(error)}\n`))
          socket.end()
        }),
      onSuccess: () => Effect.void
    }),
    Effect.runFork
  )
}

const serve = (runtime: PanelRuntime) =>
  Effect.acquireRelease(
    Effect.async<http.Server, Error>((resume) => {
      const server = http.createServer((request, response) => {
        handlePanelRequestSafely(runtime, request, response)
      })
      server.on("upgrade", (request, socket, head) => {
        handleUpgrade(runtime, request, socket, head)
      })
      server.on("error", (error: Error) => {
        resume(Effect.fail(error))
      })
      server.listen(runtime.config.port, runtime.config.host, () => {
        resume(Effect.succeed(server))
      })
      return Effect.sync(() => {
        server.close()
      })
    }),
    (server) =>
      Effect.sync(() => {
        server.close()
      })
  )

export const panelServer = pipe(
  readPanelConfig,
  Effect.map((config): PanelRuntime => ({
    config,
    sessions: new Map()
  })),
  Effect.flatMap((runtime) =>
    pipe(
      serve(runtime),
      Effect.tap(() => Console.log(`OpenClaw panel: http://${runtime.config.host}:${runtime.config.port}`)),
      Effect.flatMap(() => Effect.never)
    )
  )
)
