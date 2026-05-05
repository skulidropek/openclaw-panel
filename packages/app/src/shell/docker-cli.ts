import { Data, Effect, pipe } from "effect"

import type { BotRecord, PanelConfig } from "../core/bot.js"
import { dockerCreateArgsForBot } from "../core/provisioning.js"
import { runProcess } from "./process.js"

export type DockerCommandMode = "docker" | "sudo-docker"

export type DockerDiagnostics = {
  readonly message: string
  readonly mode: DockerCommandMode | "unavailable"
  readonly ok: boolean
  readonly serverVersion: string
}

export type DockerCommandSpec = {
  readonly argsPrefix: ReadonlyArray<string>
  readonly file: string
  readonly mode: DockerCommandMode
}

type DockerRunOptions = {
  readonly successCodes?: ReadonlyArray<number>
}

export class DockerCliError extends Data.TaggedError("DockerCliError")<{
  readonly message: string
}> {}

const dockerSpec: DockerCommandSpec = {
  argsPrefix: [],
  file: "docker",
  mode: "docker"
}

const sudoDockerSpec: DockerCommandSpec = {
  argsPrefix: ["-n", "docker"],
  file: "sudo",
  mode: "sudo-docker"
}

const commandText = (spec: DockerCommandSpec, args: ReadonlyArray<string>): string =>
  [spec.file, ...spec.argsPrefix, ...args].join(" ")

export const runWithSpec = (spec: DockerCommandSpec, args: ReadonlyArray<string>, options: DockerRunOptions = {}) =>
  pipe(
    runProcess(spec.file, [...spec.argsPrefix, ...args], process.cwd()),
    Effect.mapError((error) => new DockerCliError({ message: error.message })),
    Effect.flatMap((result) => {
      const successCodes = options.successCodes ?? [0]
      return successCodes.includes(result.code)
        ? Effect.succeed(result.stdout)
        : Effect.fail(
          new DockerCliError({
            message: `${commandText(spec, args)} failed: ${result.stderr || result.stdout}`
          })
        )
    })
  )

const canUseSpec = (spec: DockerCommandSpec) =>
  pipe(
    runProcess(spec.file, [...spec.argsPrefix, "info", "--format", "{{.ServerVersion}}"], process.cwd()),
    Effect.match({
      onFailure: () => false,
      onSuccess: (result) => result.code === 0
    })
  )

export const resolveDockerCommand = pipe(
  canUseSpec(dockerSpec),
  Effect.flatMap((direct) =>
    direct
      ? Effect.succeed(dockerSpec)
      : pipe(
        canUseSpec(sudoDockerSpec),
        Effect.flatMap((sudo) =>
          sudo
            ? Effect.succeed(sudoDockerSpec)
            : Effect.fail(new DockerCliError({ message: "Docker is not reachable by docker or sudo -n docker." }))
        )
      )
  )
)

export const runDocker = (args: ReadonlyArray<string>, options: DockerRunOptions = {}) =>
  pipe(
    resolveDockerCommand,
    Effect.flatMap((spec) => runWithSpec(spec, args, options))
  )

export const dockerDiagnostics = pipe(
  resolveDockerCommand,
  Effect.flatMap((spec) =>
    pipe(
      runWithSpec(spec, ["version", "--format", "{{.Server.Version}}"]),
      Effect.map((version): DockerDiagnostics => ({
        message: `Docker available via ${spec.mode}.`,
        mode: spec.mode,
        ok: true,
        serverVersion: version.trim()
      }))
    )
  ),
  Effect.match({
    onFailure: (error) => ({
      message: error.message,
      mode: "unavailable",
      ok: false,
      serverVersion: ""
    } satisfies DockerDiagnostics),
    onSuccess: (diagnostics) => diagnostics
  })
)

const firstOutputLine = (text: string): string => text.trim().split(/\r?\n/u)[0] ?? ""

const inspectFoundResource = (text: string): boolean => {
  const trimmed = text.trim()
  return trimmed.length > 0 && trimmed !== "[]"
}

export const cliCreateVolume = (volumeName: string) => runDocker(["volume", "create", volumeName])

export const cliRemoveVolume = (volumeName: string) =>
  pipe(
    runDocker(["volume", "inspect", volumeName], { successCodes: [0, 1] }),
    Effect.flatMap((text) =>
      inspectFoundResource(text) ? runDocker(["volume", "rm", volumeName]).pipe(Effect.asVoid) : Effect.void
    )
  )

export const cliCreateContainer = (config: PanelConfig, bot: BotRecord) =>
  pipe(
    runDocker(dockerCreateArgsForBot(config, bot)),
    Effect.map((text) => firstOutputLine(text)),
    Effect.flatMap((containerId) =>
      containerId.length > 0
        ? Effect.succeed(containerId)
        : Effect.fail(new DockerCliError({ message: "docker create did not return a container id." }))
    )
  )

export const cliStartContainer = (containerId: string) => runDocker(["start", containerId])

export const cliStopContainer = (containerId: string) => runDocker(["stop", containerId])

export const cliRestartContainer = (containerId: string) => runDocker(["restart", containerId])

export const cliRemoveContainer = (containerId: string) =>
  pipe(
    runDocker(["container", "inspect", containerId], { successCodes: [0, 1] }),
    Effect.flatMap((text) =>
      inspectFoundResource(text) ? runDocker(["rm", "--force", containerId]).pipe(Effect.asVoid) : Effect.void
    )
  )

export const cliReadContainerLogs = (containerId: string) => runDocker(["logs", "--tail", "200", containerId])

export const cliInspectContainerStatus = (containerId: string) =>
  pipe(
    runDocker(["inspect", "--format", "{{.State.Status}}", containerId]),
    Effect.map((status) => status.trim())
  )

export const cliInspectContainerIp = (containerId: string) =>
  pipe(
    runDocker(["inspect", "--format", "{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}", containerId]),
    Effect.map((address) => address.trim()),
    Effect.flatMap((address) =>
      address.length > 0
        ? Effect.succeed(address)
        : Effect.fail(new DockerCliError({ message: "Container IP address was not found." }))
    )
  )

const controlUiProxyDefaultsScript = [
  "set -eu",
  "changed=\"$(node <<'NODE'",
  "const fs = require('node:fs');",
  "const file = '/home/node/.openclaw/openclaw.json';",
  "const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);",
  "if (!fs.existsSync(file)) { process.stdout.write('0'); process.exit(0); }",
  "const config = JSON.parse(fs.readFileSync(file, 'utf8'));",
  "const gateway = isRecord(config.gateway) ? config.gateway : {};",
  "const controlUi = isRecord(gateway.controlUi) ? gateway.controlUi : {};",
  "let changed = false;",
  "if (gateway.mode !== 'local') { gateway.mode = 'local'; changed = true; }",
  "if (controlUi.allowInsecureAuth !== true) { controlUi.allowInsecureAuth = true; changed = true; }",
  "if (controlUi.dangerouslyDisableDeviceAuth !== true) { controlUi.dangerouslyDisableDeviceAuth = true; changed = true; }",
  "gateway.controlUi = controlUi;",
  "config.gateway = gateway;",
  String.raw`if (changed) { fs.writeFileSync(file, JSON.stringify(config, null, 2) + '\n', 'utf8'); }`,
  "process.stdout.write(changed ? '1' : '0');",
  "NODE",
  ")\"",
  "if [ \"$changed\" = \"1\" ]; then openclaw daemon restart; fi"
].join("\n")

export const cliEnsureControlUiProxyDefaults = (containerId: string) =>
  pipe(
    runDocker([
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
      controlUiProxyDefaultsScript
    ]),
    Effect.asVoid
  )

const gatewayTokenScript = [
  "const fs=require('node:fs');",
  "const file='/home/node/.openclaw/openclaw.json';",
  "if(!fs.existsSync(file)) process.exit(0);",
  "const config=JSON.parse(fs.readFileSync(file,'utf8'));",
  "const token=config && config.gateway && config.gateway.auth && config.gateway.auth.token;",
  "if(typeof token==='string') process.stdout.write(token);"
].join("")

export const cliReadGatewayToken = (containerId: string) =>
  pipe(
    runDocker(["exec", "-u", "node", containerId, "node", "-e", gatewayTokenScript]),
    Effect.map((token) => token.trim())
  )
