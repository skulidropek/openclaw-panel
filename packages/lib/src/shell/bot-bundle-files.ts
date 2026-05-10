import fs from "node:fs"
import path from "node:path"

const ignoredShareSegments = new Set([
  ".cache",
  ".git",
  ".next",
  ".npm",
  ".pnpm-store",
  "cache",
  "dist",
  "history",
  "logs",
  "node_modules",
  "sessions",
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

const normalizeRelativePath = (relativePath: string): ReadonlyArray<string> =>
  relativePath.split(/[\\/]+/u).filter((segment) => segment.length > 0)

const hasUnsafePathShape = (relativePath: string, segments: ReadonlyArray<string>): boolean =>
  path.isAbsolute(relativePath) || segments.length === 0 || segments.includes("..")

const hasIgnoredSegment = (segments: ReadonlyArray<string>): boolean =>
  segments.some((segment) => ignoredShareSegments.has(segment.toLowerCase()))

const hasSensitiveFileName = (fileName: string): boolean =>
  fileName === "openclaw.json" ||
  fileName === ".env" ||
  fileName.startsWith(".env.") ||
  sensitiveShareNameFragments.some((fragment) => fileName.includes(fragment))

export const isShareBundlePathAllowed = (relativePath: string): boolean => {
  const segments = normalizeRelativePath(relativePath)
  if (hasUnsafePathShape(relativePath, segments) || hasIgnoredSegment(segments)) {
    return false
  }
  const fileName = segments.at(-1)?.toLowerCase() ?? ""
  return !hasSensitiveFileName(fileName)
}

const copyFile = (source: string, destination: string): void => {
  fs.mkdirSync(path.dirname(destination), { recursive: true })
  fs.copyFileSync(source, destination)
}

const copyDirectoryFiltered = (source: string, destination: string, sourceRoot: string): void => {
  if (!fs.existsSync(source)) {
    return
  }
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) {
      continue
    }
    const entrySource = path.join(source, entry.name)
    const relativePath = path.relative(sourceRoot, entrySource)
    if (!isShareBundlePathAllowed(relativePath)) {
      continue
    }
    const entryDestination = path.join(destination, path.basename(entrySource))
    if (entry.isDirectory()) {
      fs.mkdirSync(entryDestination, { recursive: true })
      copyDirectoryFiltered(entrySource, entryDestination, sourceRoot)
      continue
    }
    if (entry.isFile()) {
      copyFile(entrySource, entryDestination)
    }
  }
}

export const copyShareBundleState = (snapshotDir: string, bundleOpenClawDir: string): void => {
  fs.mkdirSync(bundleOpenClawDir, { recursive: true })
  const workspaceSource = path.join(snapshotDir, "workspace")
  const workspaceDestination = path.join(bundleOpenClawDir, "workspace")
  fs.mkdirSync(workspaceDestination, { recursive: true })
  copyDirectoryFiltered(workspaceSource, workspaceDestination, snapshotDir)
  for (const fileName of ["PANEL_INTENT.md", "BOOTSTRAP.md", "IDENTITY.md", "SOUL.md", "AGENTS.md"]) {
    const source = path.join(snapshotDir, fileName)
    if (fs.existsSync(source) && isShareBundlePathAllowed(fileName)) {
      copyFile(source, path.join(bundleOpenClawDir, fileName))
    }
  }
}

export const copyPrivateBundleState = (snapshotDir: string, bundleOpenClawDir: string): void => {
  fs.cpSync(snapshotDir, bundleOpenClawDir, {
    force: true,
    recursive: true
  })
}
