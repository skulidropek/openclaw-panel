import fs from "node:fs"
import path from "node:path"

import { parseJson } from "../core/axioms.js"
import type { BotBundleIncludeAttribute } from "../core/bundle.js"
import type { Json } from "../core/json.js"

const ignoredPortableSegments = new Set([
  ".cache",
  ".git",
  ".next",
  ".npm",
  ".pnpm-store",
  ".tmp",
  "canvas",
  "cache",
  "completions",
  "dist",
  "history",
  "logs",
  "node_modules",
  "sessions",
  "tasks",
  "tmp"
])

const sensitiveShareNameFragments = [
  "api-key",
  "api_key",
  "apikey",
  "credential",
  "private-key",
  "private_key",
  "secret",
  "token"
]

const sensitiveJsonKeyFragments = [
  "access",
  "apikey",
  "auth",
  "bottoken",
  "credential",
  "idtoken",
  "refresh",
  "secret",
  "token"
]

const rootIdentityFiles = ["PANEL_INTENT.md", "BOOTSTRAP.md", "IDENTITY.md", "SOUL.md", "AGENTS.md"]

const privateConfigFiles = ["openclaw.json", "openclaw.json.last-good"]

const privateStateDirectories = ["identity", "devices", "credentials", "telegram"]

const privateStateFiles = [
  "plugins/installs.json",
  "flows/registry.sqlite",
  "flows/registry.sqlite-shm",
  "flows/registry.sqlite-wal",
  "agents/main/agent/models.json",
  "agents/main/agent/auth-profiles.json",
  "agents/main/agent/auth-state.json"
]

const normalizeRelativePath = (relativePath: string): ReadonlyArray<string> =>
  relativePath.split(/[\\/]+/u).filter((segment) => segment.length > 0)

const hasUnsafePathShape = (relativePath: string, segments: ReadonlyArray<string>): boolean =>
  path.isAbsolute(relativePath) || segments.length === 0 || segments.includes("..")

const hasIgnoredSegment = (segments: ReadonlyArray<string>): boolean =>
  segments.some((segment) => ignoredPortableSegments.has(segment.toLowerCase()))

const hasSensitiveFileName = (fileName: string): boolean =>
  fileName === "openclaw.json" ||
  fileName === ".env" ||
  fileName.startsWith(".env.") ||
  sensitiveShareNameFragments.some((fragment) => fileName.includes(fragment))

const isSensitiveJsonKey = (key: string): boolean => {
  const normalized = key.toLowerCase().replaceAll(/[^a-z0-9]/gu, "")
  return sensitiveJsonKeyFragments.some((fragment) => normalized.includes(fragment))
}

export const isShareBundlePathAllowed = (relativePath: string): boolean => {
  const segments = normalizeRelativePath(relativePath)
  if (hasUnsafePathShape(relativePath, segments) || hasIgnoredSegment(segments)) {
    return false
  }
  const fileName = segments.at(-1)?.toLowerCase() ?? ""
  return !hasSensitiveFileName(fileName)
}

export const isPrivateBundlePathAllowed = (relativePath: string): boolean => {
  const segments = normalizeRelativePath(relativePath)
  return !hasUnsafePathShape(relativePath, segments) && !hasIgnoredSegment(segments)
}

const copyFile = (source: string, destination: string): void => {
  fs.mkdirSync(path.dirname(destination), { recursive: true })
  fs.copyFileSync(source, destination)
}

const copyFileIfPresent = (sourceRoot: string, destinationRoot: string, relativePath: string): void => {
  const source = path.join(sourceRoot, relativePath)
  if (fs.existsSync(source) && fs.statSync(source).isFile()) {
    copyFile(source, path.join(destinationRoot, relativePath))
  }
}

const copyDirectoryFiltered = (
  source: string,
  destination: string,
  sourceRoot: string,
  isPathAllowed: (relativePath: string) => boolean
): void => {
  if (!fs.existsSync(source)) {
    return
  }
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) {
      continue
    }
    const entrySource = path.join(source, entry.name)
    const relativePath = path.relative(sourceRoot, entrySource)
    if (!isPathAllowed(relativePath)) {
      continue
    }
    const entryDestination = path.join(destination, path.basename(entrySource))
    if (entry.isDirectory()) {
      fs.mkdirSync(entryDestination, { recursive: true })
      copyDirectoryFiltered(entrySource, entryDestination, sourceRoot, isPathAllowed)
      continue
    }
    if (entry.isFile()) {
      copyFile(entrySource, entryDestination)
    }
  }
}

const copyDirectory = (sourceRoot: string, destinationRoot: string, relativePath: string): void => {
  const source = path.join(sourceRoot, relativePath)
  if (fs.existsSync(source) && fs.statSync(source).isDirectory()) {
    copyDirectoryFiltered(source, path.join(destinationRoot, relativePath), sourceRoot, () => true)
  }
}

const copyWorkspace = (
  snapshotDir: string,
  bundleOpenClawDir: string,
  isPathAllowed: (relativePath: string) => boolean
): void => {
  const workspaceSource = path.join(snapshotDir, "workspace")
  const workspaceDestination = path.join(bundleOpenClawDir, "workspace")
  fs.mkdirSync(workspaceDestination, { recursive: true })
  copyDirectoryFiltered(workspaceSource, workspaceDestination, snapshotDir, isPathAllowed)
}

const copyRootIdentityFiles = (
  snapshotDir: string,
  bundleOpenClawDir: string,
  isPathAllowed: (relativePath: string) => boolean
): void => {
  for (const fileName of rootIdentityFiles) {
    const source = path.join(snapshotDir, fileName)
    if (fs.existsSync(source) && isPathAllowed(fileName)) {
      copyFile(source, path.join(bundleOpenClawDir, fileName))
    }
  }
}

const sanitizeJsonReplacer = (key: string, value: Json): Json | undefined =>
  key.length > 0 && isSensitiveJsonKey(key) ? undefined : value

const copySanitizedJsonIfPresent = (sourceRoot: string, destinationRoot: string, relativePath: string): void => {
  const source = path.join(sourceRoot, relativePath)
  if (!fs.existsSync(source) || !fs.statSync(source).isFile()) {
    return
  }
  const parsed = parseJson(fs.readFileSync(source, "utf8"))
  const destination = path.join(destinationRoot, relativePath)
  fs.mkdirSync(path.dirname(destination), { recursive: true })
  fs.writeFileSync(destination, `${JSON.stringify(parsed, sanitizeJsonReplacer, 2)}\n`, "utf8")
}

const copyPrivateDefaultState = (snapshotDir: string, bundleOpenClawDir: string): void => {
  copyWorkspace(snapshotDir, bundleOpenClawDir, isPrivateBundlePathAllowed)
  copyRootIdentityFiles(snapshotDir, bundleOpenClawDir, isPrivateBundlePathAllowed)
  for (const fileName of privateConfigFiles) {
    copyFileIfPresent(snapshotDir, bundleOpenClawDir, fileName)
  }
  for (const directory of privateStateDirectories) {
    copyDirectory(snapshotDir, bundleOpenClawDir, directory)
  }
  for (const fileName of privateStateFiles) {
    copyFileIfPresent(snapshotDir, bundleOpenClawDir, fileName)
  }
}

const isSessionFileIncluded = (fileName: string): boolean =>
  fileName === "sessions.json" ||
  (fileName.endsWith(".jsonl") && !fileName.includes(".trajectory.") && !fileName.includes(".bak-")
    && !fileName.includes(".reset."))

const copySessionFiles = (snapshotDir: string, bundleOpenClawDir: string): void => {
  const sessionDir = path.join(snapshotDir, "agents", "main", "sessions")
  if (!fs.existsSync(sessionDir)) {
    return
  }
  for (const entry of fs.readdirSync(sessionDir, { withFileTypes: true })) {
    if (entry.isFile() && isSessionFileIncluded(entry.name)) {
      copyFile(
        path.join(sessionDir, entry.name),
        path.join(bundleOpenClawDir, "agents", "main", "sessions", entry.name)
      )
    }
  }
}

const copyTaskFiles = (snapshotDir: string, bundleOpenClawDir: string): void => {
  for (const fileName of ["tasks/runs.sqlite", "tasks/runs.sqlite-shm", "tasks/runs.sqlite-wal"]) {
    copyFileIfPresent(snapshotDir, bundleOpenClawDir, fileName)
  }
}

const copyOptionalAttribute = (
  snapshotDir: string,
  bundleOpenClawDir: string,
  attribute: BotBundleIncludeAttribute
): void => {
  if (attribute === "sessions") {
    copySessionFiles(snapshotDir, bundleOpenClawDir)
    return
  }
  if (attribute === "tasks") {
    copyTaskFiles(snapshotDir, bundleOpenClawDir)
    return
  }
  copyDirectory(snapshotDir, bundleOpenClawDir, "canvas")
}

export const copyShareBundleState = (snapshotDir: string, bundleOpenClawDir: string): void => {
  fs.mkdirSync(bundleOpenClawDir, { recursive: true })
  copyWorkspace(snapshotDir, bundleOpenClawDir, isShareBundlePathAllowed)
  copyRootIdentityFiles(snapshotDir, bundleOpenClawDir, isShareBundlePathAllowed)
  copySanitizedJsonIfPresent(snapshotDir, bundleOpenClawDir, "openclaw.json")
  copySanitizedJsonIfPresent(snapshotDir, bundleOpenClawDir, "agents/main/agent/models.json")
}

export const copyPrivateBundleState = (
  snapshotDir: string,
  bundleOpenClawDir: string,
  includeAttributes: ReadonlyArray<BotBundleIncludeAttribute>
): void => {
  fs.mkdirSync(bundleOpenClawDir, { recursive: true })
  copyPrivateDefaultState(snapshotDir, bundleOpenClawDir)
  for (const attribute of includeAttributes) {
    copyOptionalAttribute(snapshotDir, bundleOpenClawDir, attribute)
  }
}
