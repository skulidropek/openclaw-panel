import fs from "node:fs"
import { createRequire } from "node:module"

import { Data, Effect, pipe } from "effect"

type TerminalAsset = {
  readonly contentType: string
  readonly filePath: string
}

export type ServedTerminalAsset = TerminalAsset & {
  readonly body: string
}

export class TerminalAssetError extends Data.TaggedError("TerminalAssetError")<{
  readonly message: string
}> {}

const requireFromModule = createRequire(import.meta.url)

const assets: Record<string, TerminalAsset> = {
  "/assets/xterm-addon-fit.js": {
    contentType: "application/javascript; charset=utf-8",
    filePath: requireFromModule.resolve("@xterm/addon-fit/lib/addon-fit.js")
  },
  "/assets/xterm.css": {
    contentType: "text/css; charset=utf-8",
    filePath: requireFromModule.resolve("@xterm/xterm/css/xterm.css")
  },
  "/assets/xterm.js": {
    contentType: "application/javascript; charset=utf-8",
    filePath: requireFromModule.resolve("@xterm/xterm/lib/xterm.js")
  }
}

export const readTerminalAsset = (pathname: string) =>
  pipe(
    Effect.succeed(assets[pathname]),
    Effect.flatMap((asset) =>
      asset === undefined
        ? Effect.fail(new TerminalAssetError({ message: "Terminal asset was not found." }))
        : Effect.succeed(asset)
    ),
    Effect.flatMap((asset) =>
      pipe(
        Effect.try({
          try: () => fs.readFileSync(asset.filePath, "utf8"),
          catch: (error) => new TerminalAssetError({ message: String(error) })
        }),
        Effect.map((body): ServedTerminalAsset => ({
          ...asset,
          body
        }))
      )
    )
  )
