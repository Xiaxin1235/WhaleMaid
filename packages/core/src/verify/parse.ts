import { z } from 'zod'

export const CommandResultSchema = z.strictObject({
  command: z.string(),
  status: z.enum(['passed', 'failed', 'error', 'timeout']),
  exitCode: z.number().int().nullable(),
  counts: z
    .strictObject({
      passed: z.int().nonnegative(),
      failed: z.int().nonnegative(),
      skipped: z.int().nonnegative(),
    })
    .optional(),
  durationMs: z.number().nonnegative().optional(),
  logPath: z.string().optional(),
  hash: z.string().optional(),
  tail: z.string().optional(),
})
export type CommandResult = z.infer<typeof CommandResultSchema>

/** Read only known runner summary lines; exit status remains authoritative. */
export function parseCommandResult(input: {
  command: string
  exitCode: number | null
  timedOut: boolean
  stdout: string
  stderr: string
  spawnError?: boolean
  signal?: string | null
}): CommandResult {
  const status = input.timedOut
    ? 'timeout'
    : input.spawnError || input.signal || input.exitCode === null
      ? 'error'
      : input.exitCode === 0
        ? 'passed'
        : 'failed'
  // eslint-disable-next-line no-control-regex -- ANSI SGR is a known test-runner decoration.
  const output = (input.stdout + '\n' + input.stderr).replace(/\x1b\[[0-9;]*m/g, '')
  const lines = output.split(/\r?\n/)
  let counts: CommandResult['counts']
  for (const line of lines) {
    const summary = /^\s*(?:Tests\s*:?\s+|=+\s*)(.*?)(?:\s*=+)?\s*$/.exec(line)
    if (summary && /\d+\s+(?:passed|failed|skipped)/.test(summary[1]!)) {
      const found = [...summary[1]!.matchAll(/(\d+)\s+(passed|failed|skipped)/g)]
      counts = { passed: 0, failed: 0, skipped: 0 }
      for (const match of found) counts[match[2] as keyof typeof counts] = Number(match[1])
    }
  }
  // Mocha emits separate summary lines rather than a Tests/pytest header.
  if (!counts && lines.some((line) => /^\s*\d+ passing\s+\([^)]+\)\s*$/.test(line))) {
    counts = { passed: 0, failed: 0, skipped: 0 }
    for (const line of lines) {
      const match = /^\s*(\d+) (passing|failing|pending)(?:\s+\([^)]+\))?\s*$/.exec(line)
      if (match)
        counts[match[2] === 'passing' ? 'passed' : match[2] === 'failing' ? 'failed' : 'skipped'] = Number(
          match[1],
        )
    }
  }
  return { command: input.command, status, exitCode: input.exitCode, ...(counts ? { counts } : {}) }
}
