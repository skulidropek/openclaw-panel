import { randomUUID } from "node:crypto"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"

import { Data, Effect, pipe } from "effect"

import { parseJson } from "../core/axioms.js"
import type { BotRecord, PanelConfig } from "../core/bot.js"
import {
  type BotBundleExport,
  botBundleInstallCommand,
  type BotBundleManifest,
  type BotBundleMode,
  botBundleTtlMs,
  createBotBundleManifest,
  generateBotBundleInstallScript,
  parseBotBundleMode
} from "../core/bundle.js"
import { isJsonObject, type Json, stringValue } from "../core/json.js"
import { copyPrivateBundleState, copyShareBundleState } from "./bot-bundle-files.js"
import { cliInspectContainerStatus, cliStartContainer, cliStopContainer, runDocker } from "./docker-cli.js"
import { runProcess } from "./process.js"

export class BotBundleError extends Data.TaggedError("BotBundleError")<{
  readonly message: string
}> {}

type BundleBuildPaths = {
  readonly archivePath: string
  readonly bundleOpenClawDir: string
  readonly bundleRootDir: string
  readonly exportDir: string
  readonly installScriptPath: string
  readonly metadataPath: string
  readonly snapshotDir: string
  readonly tempDir: string
}

type BundleBuildInput = {
  readonly bot: BotRecord
  readonly config: PanelConfig
  readonly exportId: string
  readonly mode: BotBundleMode
  readonly origin: string
  readonly paths: BundleBuildPaths
}

const archiveFileName = "bundle.tar.gz"
const installScriptFileName = "install.sh"
const metadataFileName = "export.json"
const bundleManifestFileName = "openclaw-panel-bundle.json"
const exportIdPattern = /^[a-f0-9]{24}$/u

const exportsRootDir = (): string => path.join(os.homedir(), ".openclaw-panel", "exports")

const cleanOrigin = (origin: string): string => {
  let current = origin
  while (current.endsWith("/")) {
    current = current.slice(0, -1)
  }
  return current
}

const exportDirFor = (exportId: string): string => path.join(exportsRootDir(), exportId)

const tryBundle = <A>(label: string, thunk: () => A): Effect.Effect<A, BotBundleError> =>
  Effect.try({
    catch: (error) => new BotBundleError({ message: `${label}: ${String(error)}` }),
    try: thunk
  })

const createExportId = (): string => randomUUID().replaceAll("-", "").slice(0, 24)

const assertValidExportId = (exportId: string): void => {
  if (!exportIdPattern.test(exportId)) {
    throw new Error("Invalid bundle export id.")
  }
}

const hasValidStoredExportFields = (
  missingRequiredString: boolean,
  containsSecrets: Json | undefined,
  mode: BotBundleMode | null
): containsSecrets is boolean => !missingRequiredString && typeof containsSecrets === "boolean" && mode !== null

const decodeBotBundleExport = (value: Json): BotBundleExport | null => {
  if (!isJsonObject(value)) {
    return null
  }
  const bundleUrl = stringValue(value["bundleUrl"])
  const containsSecrets = value["containsSecrets"]
  const expiresAt = stringValue(value["expiresAt"])
  const exportId = stringValue(value["exportId"])
  const installCommand = stringValue(value["installCommand"])
  const mode = parseBotBundleMode(stringValue(value["mode"]))
  const missingRequiredString = [bundleUrl, expiresAt, exportId, installCommand].includes(null)
  if (!hasValidStoredExportFields(missingRequiredString, containsSecrets, mode)) {
    return null
  }
  return {
    bundleUrl: bundleUrl ?? "",
    containsSecrets,
    expiresAt: expiresAt ?? "",
    exportId: exportId ?? "",
    installCommand: installCommand ?? "",
    mode: mode ?? "share"
  }
}

export { isShareBundlePathAllowed } from "./bot-bundle-files.js"

const prepareBuildPaths = (exportId: string): BundleBuildPaths => {
  const exportDir = exportDirFor(exportId)
  fs.mkdirSync(exportDir, { recursive: true })
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "openclaw-bundle-"))
  const snapshotDir = path.join(tempDir, "snapshot")
  const bundleRootDir = path.join(tempDir, "bundle")
  const bundleOpenClawDir = path.join(bundleRootDir, "openclaw")
  fs.mkdirSync(snapshotDir, { recursive: true })
  fs.mkdirSync(bundleOpenClawDir, { recursive: true })
  return {
    archivePath: path.join(exportDir, archiveFileName),
    bundleOpenClawDir,
    bundleRootDir,
    exportDir,
    installScriptPath: path.join(exportDir, installScriptFileName),
    metadataPath: path.join(exportDir, metadataFileName),
    snapshotDir,
    tempDir
  }
}

const writeJsonFile = (filePath: string, value: object): void => {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8")
}

const bundleUrls = (origin: string, exportId: string) => {
  const baseUrl = cleanOrigin(origin)
  return {
    bundleUrl: `${baseUrl}/api/bot-exports/${exportId}/${archiveFileName}`,
    installScriptUrl: `${baseUrl}/api/bot-exports/${exportId}/${installScriptFileName}`
  }
}

const writeInstallScript = (
  paths: BundleBuildPaths,
  bundleUrl: string,
  bot: BotRecord,
  config: PanelConfig,
  manifest: BotBundleManifest
): void => {
  fs.writeFileSync(
    paths.installScriptPath,
    generateBotBundleInstallScript({
      bundleUrl,
      defaultBotName: bot.name,
      defaultGatewayPort: config.baseGatewayPort,
      defaultRunnerImage: config.runnerImage,
      manifest
    }),
    "utf8"
  )
}

const writeBundleState = (input: BundleBuildInput): BotBundleExport => {
  const { bot, config, exportId, mode, origin, paths } = input
  const exportedAt = new Date().toISOString()
  const expiresAt = new Date(Date.parse(exportedAt) + botBundleTtlMs).toISOString()
  const manifest = createBotBundleManifest({
    exportedAt,
    mode,
    sourceBotId: bot.id,
    sourceBotName: bot.name
  })
  if (mode === "private") {
    copyPrivateBundleState(paths.snapshotDir, paths.bundleOpenClawDir)
  } else {
    copyShareBundleState(paths.snapshotDir, paths.bundleOpenClawDir)
  }
  writeJsonFile(path.join(paths.bundleRootDir, bundleManifestFileName), manifest)
  const { bundleUrl, installScriptUrl } = bundleUrls(origin, exportId)
  const exported = {
    bundleUrl,
    containsSecrets: manifest.containsSecrets,
    expiresAt,
    exportId,
    installCommand: botBundleInstallCommand(installScriptUrl),
    mode
  } satisfies BotBundleExport
  writeInstallScript(paths, bundleUrl, bot, config, manifest)
  writeJsonFile(paths.metadataPath, exported)
  return exported
}

const archiveBundle = (paths: BundleBuildPaths) =>
  pipe(
    runProcess("tar", ["-czf", paths.archivePath, "-C", paths.bundleRootDir, "."], process.cwd()),
    Effect.mapError((error) => new BotBundleError({ message: error.message })),
    Effect.flatMap((result) =>
      result.code === 0
        ? Effect.void
        : Effect.fail(new BotBundleError({ message: `tar failed: ${result.stderr || result.stdout}` }))
    )
  )

const cleanTempDir = (paths: BundleBuildPaths) =>
  tryBundle("clean bundle temp dir", () => {
    fs.rmSync(paths.tempDir, { force: true, recursive: true })
  }).pipe(Effect.asVoid)

const createSnapshotExport = (input: BundleBuildInput) =>
  pipe(
    runDocker(["cp", `${input.bot.containerId}:/home/node/.openclaw/.`, input.paths.snapshotDir]),
    Effect.flatMap(() => tryBundle("write bot bundle", () => writeBundleState(input))),
    Effect.flatMap((exported) => archiveBundle(input.paths).pipe(Effect.as(exported)))
  )

const withStoppedContainer = <A>(
  bot: BotRecord,
  effect: Effect.Effect<A, object>
): Effect.Effect<A, object> =>
  pipe(
    cliInspectContainerStatus(bot.containerId),
    Effect.flatMap((status) => {
      if (status !== "running") {
        return effect
      }
      return pipe(
        cliStopContainer(bot.containerId),
        Effect.asVoid,
        Effect.flatMap(() => pipe(effect, Effect.ensuring(Effect.ignore(cliStartContainer(bot.containerId)))))
      )
    })
  )

export const createBotBundleExport = (
  config: PanelConfig,
  bot: BotRecord,
  mode: BotBundleMode,
  origin: string
) => {
  const exportId = createExportId()
  return pipe(
    tryBundle("prepare bot bundle export", () => prepareBuildPaths(exportId)),
    Effect.flatMap((paths) =>
      pipe(
        createSnapshotExport({ bot, config, exportId, mode, origin, paths }),
        (effect) => withStoppedContainer(bot, effect),
        Effect.ensuring(Effect.ignore(cleanTempDir(paths)))
      )
    )
  )
}

const readStoredExport = (exportId: string) =>
  tryBundle("read bot bundle export", () => {
    assertValidExportId(exportId)
    const raw = fs.readFileSync(path.join(exportDirFor(exportId), metadataFileName), "utf8")
    const parsed = decodeBotBundleExport(parseJson(raw))
    if (parsed === null) {
      throw new Error("Bundle export metadata is invalid.")
    }
    if (Date.parse(parsed.expiresAt) < Date.now()) {
      throw new Error("Bundle export has expired.")
    }
    return parsed
  })

export const readBotBundleInstallScript = (exportId: string) =>
  pipe(
    readStoredExport(exportId),
    Effect.flatMap(() =>
      tryBundle("read bot bundle install script", () =>
        fs.readFileSync(path.join(exportDirFor(exportId), installScriptFileName), "utf8"))
    )
  )

export const readBotBundleArchive = (exportId: string) =>
  pipe(
    readStoredExport(exportId),
    Effect.flatMap(() =>
      tryBundle("read bot bundle archive", () => fs.readFileSync(path.join(exportDirFor(exportId), archiveFileName)))
    )
  )
