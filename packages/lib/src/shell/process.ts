import { spawn } from "node:child_process"

import { Data, Effect } from "effect"

export type ProcessResult = {
  readonly code: number
  readonly stderr: string
  readonly stdout: string
}

export class ProcessError extends Data.TaggedError("ProcessError")<{
  readonly message: string
}> {}

export const runProcess = (file: string, args: ReadonlyArray<string>, cwd: string) =>
  Effect.async<ProcessResult, ProcessError>((resume) => {
    const child = spawn(file, [...args], {
      cwd,
      stdio: ["ignore", "pipe", "pipe"]
    })
    const stdoutChunks: Array<Buffer> = []
    const stderrChunks: Array<Buffer> = []
    child.stdout.on("data", (chunk: Uint8Array) => {
      stdoutChunks.push(Buffer.from(chunk))
    })
    child.stderr.on("data", (chunk: Uint8Array) => {
      stderrChunks.push(Buffer.from(chunk))
    })
    child.on("error", (error: Error) => {
      resume(Effect.fail(new ProcessError({ message: error.message })))
    })
    child.on("close", (code) => {
      resume(
        Effect.succeed({
          code: code ?? -1,
          stderr: Buffer.concat(stderrChunks).toString("utf8"),
          stdout: Buffer.concat(stdoutChunks).toString("utf8")
        })
      )
    })
    return Effect.sync(() => {
      child.kill("SIGTERM")
    })
  })
