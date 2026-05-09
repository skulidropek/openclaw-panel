import http from "node:http"
import net from "node:net"
import type { Duplex } from "node:stream"

import { Effect, pipe } from "effect"

import type { BotRecord } from "../core/bot.js"
import {
  cliEnsureControlUiProxyDefaults,
  cliInspectContainerIp,
  cliReadGatewayToken,
  type DockerCliError
} from "./docker-cli.js"

type BotAdminPath = { readonly botId: string; readonly query: string; readonly rawPath: string }

type BotAdminUpstream = { readonly host: string; readonly port: number; readonly token: string }

type ProxyHeaderContext = {
  readonly botId: string
  readonly html: boolean
  readonly response: http.ServerResponse
  readonly upstream: BotAdminUpstream
}

type DefinedResponseHeaderValue = number | ReadonlyArray<string> | string
type ResponseHeaderValue = DefinedResponseHeaderValue | undefined

const gatewayPort = 18_789
const emptyValue: undefined = undefined
const configuredBotIds = new Set<string>()
const hopByHopHeaders = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade"
])

export const botAdminUrl = (botId: string): string => `/bot-admin/${encodeURIComponent(botId)}/`

export const parseBotAdminPath = (urlValue: string | undefined): BotAdminPath | null => {
  const parsed = new URL(urlValue ?? "/", "https://panel.local")
  const prefix = "/bot-admin/"
  if (!parsed.pathname.startsWith(prefix)) {
    return null
  }
  const tail = parsed.pathname.slice(prefix.length)
  const slashIndex = tail.indexOf("/")
  const botId = slashIndex === -1 ? tail : tail.slice(0, slashIndex)
  return botId.length === 0
    ? null
    : {
      botId,
      query: parsed.search,
      rawPath: slashIndex === -1 ? "" : tail.slice(slashIndex)
    }
}

export const buildBotAdminUpstreamPath = (path: BotAdminPath): string => {
  const basePath = path.rawPath.length > 0 && path.rawPath !== "/" ? path.rawPath : "/chat"
  if (path.query.length > 0) {
    return `${basePath}${path.query}`
  }
  return path.rawPath.length > 0 && path.rawPath !== "/" ? basePath : `${basePath}?session=main`
}

const proxyPrefix = (botId: string): string => `/bot-admin/${encodeURIComponent(botId)}`

const withProxyPrefix = (botId: string, rawPath: string): string => {
  const normalizedPath = rawPath.startsWith("/") ? rawPath : `/${rawPath}`
  return `${proxyPrefix(botId)}${normalizedPath}`
}

export const rewriteBotAdminHtml = (html: string, botId: string, bootstrapScript: string): string => {
  const prefix = proxyPrefix(botId)
  const rewritten = html
    .replaceAll("href=\"/", `href="${prefix}/`)
    .replaceAll("href=\"./", `href="${prefix}/`)
    .replaceAll("href='./", `href='${prefix}/`)
    .replaceAll("src=\"/", `src="${prefix}/`)
    .replaceAll("src=\"./", `src="${prefix}/`)
    .replaceAll("src='./", `src='${prefix}/`)
    .replaceAll("action=\"/", `action="${prefix}/`)
    .replaceAll("action=\"./", `action="${prefix}/`)
    .replaceAll("action='./", `action='${prefix}/`)
  const marker = "<script type=\"module\""
  return rewritten.includes(marker)
    ? rewritten.replace(marker, `${bootstrapScript}${marker}`)
    : `${bootstrapScript}${rewritten}`
}

const publicOrigin = (request: http.IncomingMessage): string => {
  const host = request.headers["x-forwarded-host"] ?? request.headers.host ?? "localhost"
  const proto = request.headers["x-forwarded-proto"] ?? "http"
  const firstHost = (Array.isArray(host) ? host[0] : host) ?? "localhost"
  const firstProto = (Array.isArray(proto) ? proto[0] : proto) ?? "http"
  return `${firstProto}://${firstHost}`
}

const htmlSafeJson = (value: object): string => JSON.stringify(value).replaceAll("<", String.raw`\u003c`)

const buildControlUiBootstrap = (request: http.IncomingMessage, botId: string, token: string): string => {
  const basePath = proxyPrefix(botId)
  const origin = publicOrigin(request)
  const websocketOrigin = origin.replace(/^http:/u, "ws:").replace(/^https:/u, "wss:")
  const payload = htmlSafeJson({
    basePath,
    gatewayToken: token.length > 0 ? token : null,
    gatewayUrl: `${websocketOrigin}${basePath}`
  })
  return `<script>(function(){const config=${payload};const settingsKey="openclaw.control.settings.v1";window.__OPENCLAW_CONTROL_UI_BASE_PATH__=config.basePath;try{const currentUrl=new URL(window.location.href);const currentRaw=window.localStorage.getItem(settingsKey);const current=currentRaw?JSON.parse(currentRaw):{};const search=currentUrl.searchParams;const hashParams=new URLSearchParams(currentUrl.hash.startsWith("#")?currentUrl.hash.slice(1):currentUrl.hash);const sessionKey=(search.get("session")||current.sessionKey||"main").trim()||"main";const next=typeof current==="object"&&current!==null?{...current}:{};next.gatewayUrl=config.gatewayUrl;next.sessionKey=sessionKey;next.lastActiveSessionKey=sessionKey;window.localStorage.setItem(settingsKey,JSON.stringify(next));if(typeof config.gatewayToken==="string"&&config.gatewayToken.length>0&&!hashParams.has("token")){hashParams.set("token",config.gatewayToken);currentUrl.hash=hashParams.toString().length>0?"#"+hashParams.toString():"";window.history.replaceState(null,"",currentUrl.toString());}}catch{}})();</script>`
}

const ensureBotAdminDefaults = (bot: BotRecord) =>
  configuredBotIds.has(bot.id)
    ? Effect.void
    : pipe(
      cliEnsureControlUiProxyDefaults(bot.containerId),
      Effect.tap(() =>
        Effect.sync(() => {
          configuredBotIds.add(bot.id)
        })
      )
    )

const resolveUpstream = (bot: BotRecord) =>
  pipe(
    ensureBotAdminDefaults(bot),
    Effect.flatMap(() => cliInspectContainerIp(bot.containerId)),
    Effect.flatMap((host) =>
      pipe(
        cliReadGatewayToken(bot.containerId),
        Effect.map((token): BotAdminUpstream => ({ host, port: gatewayPort, token }))
      )
    )
  )

const responseLocation = (value: string, upstream: BotAdminUpstream, botId: string): string => {
  const origin = `http://${upstream.host}:${upstream.port}`
  if (value.startsWith(origin)) {
    return withProxyPrefix(botId, value.slice(origin.length) || "/")
  }
  return value.startsWith("/") ? withProxyPrefix(botId, value) : value
}

const omittedHtmlResponseHeader = (lowerKey: string, html: boolean): boolean =>
  html && (lowerKey === "content-length" || lowerKey === "etag" || lowerKey === "content-security-policy")

const shouldForwardResponseHeader = (lowerKey: string, html: boolean): boolean =>
  !hopByHopHeaders.has(lowerKey) && !omittedHtmlResponseHeader(lowerKey, html)

const proxyResponseHeaderValue = (
  context: ProxyHeaderContext,
  lowerKey: string,
  value: DefinedResponseHeaderValue
): DefinedResponseHeaderValue =>
  lowerKey === "location" && typeof value === "string"
    ? responseLocation(value, context.upstream, context.botId)
    : value

const applyProxyResponseHeader = (context: ProxyHeaderContext, key: string, value: ResponseHeaderValue): void => {
  const lowerKey = key.toLowerCase()
  if (value === undefined || !shouldForwardResponseHeader(lowerKey, context.html)) {
    return
  }
  context.response.setHeader(key, proxyResponseHeaderValue(context, lowerKey, value))
}

const forwardRequestHeaders = (request: http.IncomingMessage): http.OutgoingHttpHeaders => {
  const headers: http.OutgoingHttpHeaders = {}
  for (const [key, value] of Object.entries(request.headers)) {
    const lowerKey = key.toLowerCase()
    if (!hopByHopHeaders.has(lowerKey) && lowerKey !== "host" && lowerKey !== "origin") {
      headers[key] = value
    }
  }
  headers["origin"] = `http://127.0.0.1:${gatewayPort}`
  return headers
}

const proxyHttpWithUpstream = (
  bot: BotRecord,
  path: BotAdminPath,
  upstream: BotAdminUpstream,
  request: http.IncomingMessage,
  response: http.ServerResponse
) =>
  Effect.async<undefined, Error>((resume) => {
    const upstreamRequest = http.request({
      headers: forwardRequestHeaders(request),
      host: upstream.host,
      method: request.method,
      path: buildBotAdminUpstreamPath(path),
      port: upstream.port
    }, (upstreamResponse) => {
      const contentType = upstreamResponse.headers["content-type"] ?? ""
      const html = typeof contentType === "string" && contentType.includes("text/html")
      const headerContext = { botId: bot.id, html, response, upstream }
      for (const [key, value] of Object.entries(upstreamResponse.headers)) {
        applyProxyResponseHeader(headerContext, key, value)
      }
      response.statusCode = upstreamResponse.statusCode ?? 502
      response.statusMessage = upstreamResponse.statusMessage ?? "Bad Gateway"
      if (!html) {
        upstreamResponse.pipe(response)
        upstreamResponse.on("end", () => {
          resume(Effect.succeed(emptyValue))
        })
        return
      }
      const chunks: Array<Buffer> = []
      upstreamResponse.on("data", (chunk: Uint8Array) => {
        chunks.push(Buffer.from(chunk))
      })
      upstreamResponse.on("end", () => {
        const bootstrap = buildControlUiBootstrap(request, bot.id, upstream.token)
        response.end(rewriteBotAdminHtml(Buffer.concat(chunks).toString("utf8"), bot.id, bootstrap))
        resume(Effect.succeed(emptyValue))
      })
    })
    upstreamRequest.on("error", (error: Error) => {
      resume(Effect.fail(error))
    })
    request.pipe(upstreamRequest)
  })

export const proxyBotAdminHttp = (
  bot: BotRecord,
  path: BotAdminPath,
  request: http.IncomingMessage,
  response: http.ServerResponse
): Effect.Effect<void, DockerCliError | Error> =>
  pipe(
    resolveUpstream(bot),
    Effect.flatMap((upstream) => proxyHttpWithUpstream(bot, path, upstream, request, response))
  )

const socketHttpError = (socket: Duplex, statusCode: number, statusText: string, body: string): void => {
  const payload = Buffer.from(body, "utf8")
  socket.write([
    `HTTP/1.1 ${statusCode} ${statusText}`,
    "Connection: close",
    "Content-Type: text/plain; charset=utf-8",
    `Content-Length: ${payload.length}`,
    "",
    body
  ].join("\r\n"))
  socket.destroy()
}

const proxyUpgradeWithUpstream = (
  path: BotAdminPath,
  upstream: BotAdminUpstream,
  request: http.IncomingMessage,
  socket: Duplex,
  head: Buffer
) =>
  Effect.sync(() => {
    const upstreamSocket = net.connect(upstream.port, upstream.host)
    upstreamSocket.once("connect", () => {
      const requestLine = `${request.method ?? "GET"} ${buildBotAdminUpstreamPath(path)} HTTP/${request.httpVersion}`
      const headerLines: Array<string> = []
      for (let index = 0; index < request.rawHeaders.length; index += 2) {
        const key = request.rawHeaders[index] ?? ""
        const value = request.rawHeaders[index + 1] ?? ""
        const lowerKey = key.toLowerCase()
        if (lowerKey !== "host" && lowerKey !== "origin") {
          headerLines.push(`${key}: ${value}`)
        }
      }
      headerLines.push(`Host: ${upstream.host}:${upstream.port}`, `Origin: http://127.0.0.1:${gatewayPort}`)
      upstreamSocket.write(`${requestLine}\r\n${headerLines.join("\r\n")}\r\n\r\n`)
      if (head.length > 0) {
        upstreamSocket.write(head)
      }
      socket.pipe(upstreamSocket)
      upstreamSocket.pipe(socket)
    })
    upstreamSocket.on("error", (error: Error) => {
      socketHttpError(socket, 502, "Bad Gateway", `WebSocket upstream error: ${error.message}`)
    })
    socket.on("close", () => {
      upstreamSocket.destroy()
    })
  })

export const proxyBotAdminUpgrade = (
  bot: BotRecord,
  path: BotAdminPath,
  request: http.IncomingMessage,
  socket: Duplex,
  head: Buffer
): Effect.Effect<void, DockerCliError> =>
  pipe(
    resolveUpstream(bot),
    Effect.flatMap((upstream) => proxyUpgradeWithUpstream(path, upstream, request, socket, head))
  )
