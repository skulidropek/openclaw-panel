import { type IPty, spawn as spawnPty } from "node-pty"

import { Effect, pipe } from "effect"

import { DockerCliError, type DockerCommandSpec, resolveDockerCommand, runWithSpec } from "./docker-cli.js"

export type InteractiveDockerProcess = {
  readonly kill: () => void
  readonly resize: (cols: number, rows: number) => void
  readonly write: (chunk: Buffer) => void
}

type InteractiveHandlers = {
  readonly onData: (chunk: Buffer) => void
  readonly onEnd: () => void
  readonly onError: (error: DockerCliError) => void
}

const onboardingExecArgs = (containerId: string): ReadonlyArray<string> => [
  "exec",
  "-it",
  "-u",
  "node",
  "-e",
  "HOME=/home/node",
  "-e",
  "TERM=xterm-256color",
  "-e",
  "XDG_RUNTIME_DIR=/run/user/1000",
  "-e",
  "DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/1000/bus",
  containerId,
  "openclaw",
  "onboard",
  "--install-daemon"
]

const prepareOnboardingCommand = [
  "mkdir -p /home/node/.openclaw/agents/main /home/node/.config/systemd/user /run/user/1000",
  "chown -R node:node /home/node/.openclaw /home/node/.config /run/user/1000",
  "chmod 700 /run/user/1000",
  "systemctl start user@1000.service"
].join(" && ")

const prepareOnboardingArgs = (containerId: string): ReadonlyArray<string> => [
  "exec",
  "-u",
  "root",
  containerId,
  "sh",
  "-lc",
  prepareOnboardingCommand
]

const finalizeOnboardingCommand = [
  "openclaw config set gateway.mode local",
  "openclaw config set gateway.bind lan",
  "openclaw config set gateway.controlUi.allowInsecureAuth true",
  "openclaw config set gateway.controlUi.dangerouslyDisableDeviceAuth true",
  "openclaw daemon install",
  "openclaw daemon restart"
].join(" && ")

const finalizeOnboardingArgs = (containerId: string): ReadonlyArray<string> => [
  "exec",
  "-u",
  "node",
  "-e",
  "HOME=/home/node",
  "-e",
  "TERM=xterm-256color",
  "-e",
  "XDG_RUNTIME_DIR=/run/user/1000",
  "-e",
  "DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/1000/bus",
  containerId,
  "sh",
  "-lc",
  finalizeOnboardingCommand
]

const wireInteractiveChild = (
  child: IPty,
  handlers: InteractiveHandlers
): InteractiveDockerProcess => {
  child.onData((chunk) => {
    handlers.onData(Buffer.from(chunk, "utf8"))
  })
  child.onExit(() => {
    handlers.onEnd()
  })
  return {
    kill: () => {
      child.kill("SIGTERM")
    },
    resize: (cols, rows) => {
      child.resize(cols, rows)
    },
    write: (chunk) => {
      child.write(chunk)
    }
  }
}

const spawnOnboardingProcess = (
  spec: DockerCommandSpec,
  containerId: string,
  handlers: InteractiveHandlers
) =>
  pipe(
    Effect.try({
      try: () =>
        spawnPty(
          spec.file,
          [...spec.argsPrefix, ...onboardingExecArgs(containerId)],
          {
            cols: 120,
            cwd: process.cwd(),
            env: process.env,
            name: "xterm-256color",
            rows: 32
          }
        ),
      catch: (error) => new DockerCliError({ message: String(error) })
    }),
    Effect.map((child): InteractiveDockerProcess => wireInteractiveChild(child, handlers))
  )

const withPreparedOnboarding = <A>(
  containerId: string,
  useSpec: (spec: DockerCommandSpec) => Effect.Effect<A, DockerCliError>
) =>
  pipe(
    resolveDockerCommand,
    Effect.flatMap((spec) =>
      pipe(
        runWithSpec(spec, prepareOnboardingArgs(containerId)),
        Effect.flatMap(() => useSpec(spec))
      )
    )
  )

export const finalizeOnboardingProcess = (containerId: string) =>
  withPreparedOnboarding(
    containerId,
    (spec) => runWithSpec(spec, finalizeOnboardingArgs(containerId)).pipe(Effect.asVoid)
  )

export const startOnboardingProcess = (
  containerId: string,
  handlers: InteractiveHandlers
) =>
  withPreparedOnboarding(
    containerId,
    (spec) => spawnOnboardingProcess(spec, containerId, handlers)
  )
