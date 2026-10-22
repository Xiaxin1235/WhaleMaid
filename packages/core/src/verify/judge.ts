import { z } from 'zod'
import { VerdictSchema } from '../model/common.js'
import type { TaskKind } from '../model/common.js'
import type { CommandResult } from './parse.js'

export const JudgmentSchema = z.strictObject({
  verdict: VerdictSchema,
  reasons: z.array(z.string()),
  progress: z.enum(['improved', 'unchanged', 'regressed', 'unknown', 'neutral']),
})
export type Judgment = z.infer<typeof JudgmentSchema>
export interface ChangedFile {
  path: string
  deleted?: boolean
  addedLines?: string
  before?: string
  after?: string
}
export interface JudgeInput {
  kind: TaskKind
  endReason: string
  deniedCalls: number
  changedFiles: ChangedFile[]
  verifyCommands: string[]
  baseline?: CommandResult[]
  current?: CommandResult[]
  finalReplyNonempty: boolean
}

/** Detect changes to acceptance machinery independently of the model's own account. */
export function acceptanceTampered(files: ChangedFile[], commands: string[]): boolean {
  return files.some((file) => {
    const path = file.path.replaceAll('\\', '/')
    if (
      file.deleted &&
      /(?:^|\/)(?:test[^/]*|[^/]+[._](?:test|spec)\.[^/]+)$|(?:^|\/)(?:tests?|__tests__)\//i.test(path)
    )
      return true
    if (
      /\.(?:skip|only|skipIf|todo)(?:\.each)?\s*\(|\b(?:xit|xdescribe)\s*\(|@pytest\.mark\.skip|pytest\.skip\s*\(/.test(
        file.addedLines ?? '',
      )
    )
      return true
    if (
      /(?:^|\/)(?:(?:vitest|jest|pytest)\.(?:config|workspace)\.[^/]+|pytest\.ini|conftest\.py|tox\.ini)$/.test(
        path,
      )
    )
      return true
    if (
      /(?:^|\/)(?:pyproject\.toml|setup\.cfg)$/.test(path) &&
      /pytest/.test((file.before ?? '') + (file.after ?? ''))
    )
      return true
    if (/(?:^|\/)package\.json$/.test(path)) {
      try {
        const before = JSON.parse(file.before ?? '{}') as { scripts?: Record<string, unknown> }
        const after = JSON.parse(file.after ?? '{}') as { scripts?: Record<string, unknown> }
        // Include scripts transitively called by a selected script.
        const roots = commands.join('\n')
        const used = new Set<string>()
        let text = roots
        for (let n = 0; n < 100; n++) {
          const matches = [...text.matchAll(/\b(?:npm|pnpm|yarn)(?:\.cmd)?\s+(?:run\s+)?([\w:-]+)/g)]
          let added = false
          for (const match of matches)
            if (!used.has(match[1]!)) {
              used.add(match[1]!)
              text +=
                '\n' +
                String(before.scripts?.[match[1]!] ?? '') +
                '\n' +
                String(after.scripts?.[match[1]!] ?? '')
              added = true
            }
          if (!added) break
        }
        return [...used].some((key) => before.scripts?.[key] !== after.scripts?.[key])
      } catch {
        return true
      }
    }
    return false
  })
}

/** Judge measured evidence, never the model's completion claim. Report tasks have an explicit report-only rule. */
export function judge(input: JudgeInput): Judgment {
  const reasons = input.deniedCalls > 0 ? [`denied-actions:${input.deniedCalls}`] : []
  const result = (
    verdict: Judgment['verdict'],
    reason: string,
    progress: Judgment['progress'] = 'unknown',
  ): Judgment => ({ verdict, reasons: [...reasons, reason], progress })
  if (
    [...(input.baseline ?? []), ...(input.current ?? [])].some(
      (item) => item.status === 'error' || item.status === 'timeout',
    )
  )
    return result('UNKNOWN', 'command-error-or-timeout')
  if (acceptanceTampered(input.changedFiles, input.verifyCommands))
    return result('FAIL', 'acceptance-tampering', 'regressed')
  if (['analyze', 'research'].includes(input.kind)) {
    if (input.changedFiles.length) return result('FAIL', 'analysis-changed-files', 'regressed')
    return input.finalReplyNonempty
      ? result('PASS', 'report-only', 'neutral')
      : result('INSUFFICIENT_EVIDENCE', 'empty-report')
  }
  if (!input.verifyCommands.length) return result('NOT_SCORABLE', 'no-verification-commands')
  const { baseline, current } = input
  if (
    !baseline ||
    !current ||
    baseline.length !== input.verifyCommands.length ||
    current.length !== baseline.length ||
    input.verifyCommands.some(
      (command, i) => baseline[i]?.command !== command || current[i]?.command !== command,
    )
  )
    return result('UNKNOWN', 'missing-command-evidence')
  if (!input.changedFiles.length) return result('INSUFFICIENT_EVIDENCE', 'no-changes')
  const regressed = baseline.some((before, i) => {
    const after = current[i]!
    return (
      (before.status === 'passed' && after.status === 'failed') ||
      (before.counts &&
        after.counts &&
        (after.counts.failed > before.counts.failed ||
          after.counts.passed + after.counts.failed < before.counts.passed + before.counts.failed))
    )
  })
  if (regressed) return result('FAIL', 'verification-regression', 'regressed')
  const improved = baseline.some(
    (before, i) =>
      (before.status === 'failed' && current[i]!.status === 'passed') ||
      (before.counts && current[i]!.counts && current[i]!.counts!.failed < before.counts.failed),
  )
  if (current.every((item) => item.status === 'passed') || improved)
    return result(
      'PASS',
      improved ? 'verification-improved' : 'verification-passed',
      improved
        ? 'improved'
        : input.kind === 'doc' && baseline.every((item) => item.status === 'passed')
          ? 'neutral'
          : 'unchanged',
    )
  return result('FAIL', 'verification-still-failing', 'unchanged')
}
