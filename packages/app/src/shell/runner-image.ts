import fs from "node:fs"
import path from "node:path"

import { Data, Effect, pipe } from "effect"

import type { PanelConfig } from "../core/bot.js"
import { runDocker } from "./docker-cli.js"

export class RunnerImageError extends Data.TaggedError("RunnerImageError")<{
  readonly message: string
}> {}

const localDockerfile = "docker/openclaw-bot-runner.Dockerfile"
const workspaceDockerfile = "packages/app/docker/openclaw-bot-runner.Dockerfile"

const resolveDockerfile = (): { readonly contextDir: string; readonly dockerfile: string } => {
  const cwd = process.cwd()
  const local = path.join(cwd, localDockerfile)
  if (fs.existsSync(local)) {
    return {
      contextDir: path.join(cwd, "docker"),
      dockerfile: local
    }
  }
  return {
    contextDir: cwd,
    dockerfile: path.join(cwd, workspaceDockerfile)
  }
}

const imageExists = (image: string) =>
  pipe(
    runDocker(["image", "inspect", image]),
    Effect.matchEffect({
      onFailure: () => Effect.succeed(false),
      onSuccess: () => Effect.succeed(true)
    })
  )

const buildImage = (config: PanelConfig) =>
  pipe(
    Effect.sync(resolveDockerfile),
    Effect.flatMap(({ contextDir, dockerfile }) =>
      runDocker(["build", "-t", config.runnerImage, "-f", dockerfile, contextDir])
    ),
    Effect.asVoid
  )

export const ensureRunnerImage = (config: PanelConfig) =>
  pipe(
    imageExists(config.runnerImage),
    Effect.flatMap((exists) => exists ? Effect.void : buildImage(config)),
    Effect.mapError((error) => new RunnerImageError({ message: String(error) }))
  )
