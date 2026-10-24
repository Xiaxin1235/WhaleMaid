import { z } from 'zod'
import { normalizeWindowsPath } from '../windows-path.js'
import { redactSecrets } from '../companion/redact.js'
import type { Locale } from '../i18n/index.js'
import { memoryCopy } from '../i18n/memory.js'
/** Shared refusal check; a redacted substitute must never be saved as the original. */
export function containsMemorySecret(value: string): boolean {
  return (
    redactSecrets(value) !== value ||
    /(?:密码|口令|证件号|银行卡号)\s*[:：是=]\s*\S+|\b\d{15,19}[Xx]?\b/u.test(value)
  )
}

/** Validate content before confirmation and again before persistence; never save a redacted substitute. */
export function validateMemoryText(text: string): { ok: true; text: string } | { ok: false; reason: string } {
  const value = text.trim()
  if (!value || Array.from(value).length > 300) return { ok: false, reason: 'invalid-length' }
  if (/[\r\n\u2028\u2029]/u.test(value)) return { ok: false, reason: 'multiple-paragraphs' }
  if (containsMemorySecret(value)) return { ok: false, reason: 'contains-secret' }
  return { ok: true, text: value }
}
export const MemoryTextSchema = z
  .string()
  .transform((v) => v.trim())
  .superRefine((v, ctx) => {
    const result = validateMemoryText(v)
    if (!result.ok) ctx.addIssue({ code: 'custom', message: result.reason })
  })
export const ProjectKeySchema = z.string().transform((v, ctx) => {
  const key = normalizeWindowsPath(v)
  if (!key) {
    ctx.addIssue({ code: 'custom', message: 'invalid-project-path' })
    return z.NEVER
  }
  return key.length > 3 ? key.replace(/\\$/, '') : key
})
export const MemoryScopeSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('personal') }),
  z.strictObject({ kind: z.literal('project'), projectKey: ProjectKeySchema }),
])
export const MemoryKindSchema = z.enum(['preference', 'fact', 'decision', 'constraint'])
export const MemorySchema = z.strictObject({
  id: z.string().min(1).max(128),
  scope: MemoryScopeSchema,
  kind: MemoryKindSchema,
  text: MemoryTextSchema,
  source: z.strictObject({
    via: z.enum(['companion', 'panel']),
    sessionId: z.string().max(200).optional(),
    seq: z.int().nonnegative().optional(),
  }),
  confirmedAt: z.int().nonnegative(),
  createdAt: z.int().nonnegative(),
  updatedAt: z.int().nonnegative(),
  status: z.enum(['active', 'archived']),
  supersedes: z.string().max(128).optional(),
  version: z.int().positive(),
})
export type Memory = z.infer<typeof MemorySchema>
export type MemoryScope = z.infer<typeof MemoryScopeSchema>
/** A project follows the goal's first explicitly allowed authorization path. */
export function projectKeyForGoal(
  goal: { scopeId?: string | undefined },
  scope?: { id: string; allowedPaths: readonly string[] },
): string | undefined {
  if (!scope || goal.scopeId !== scope.id || !scope.allowedPaths[0]) return undefined
  const key = ProjectKeySchema.safeParse(scope.allowedPaths[0])
  return key.success ? key.data : undefined
}
/** Canonical storage and retrieval identity for a confirmed memory scope. */
export function memoryScopeKey(scope: MemoryScope): string {
  return scope.kind === 'personal' ? 'personal' : `project:${ProjectKeySchema.parse(scope.projectKey)}`
}
/** Enforce the active cap for insert, restore and replacement alike. */
export function canActivateMemory(
  rows: readonly Memory[],
  candidate: Memory,
  replacing: readonly string[] = [],
): boolean {
  return (
    rows.filter(
      (m) =>
        m.status === 'active' &&
        memoryScopeKey(m.scope) === memoryScopeKey(candidate.scope) &&
        m.id !== candidate.id &&
        !replacing.includes(m.id),
    ).length < 100
  )
}
/** Stable bytes for an unchanged set, bounded by code units; select recent entries then order by id. */
export function renderMemoryBlock(memories: readonly Memory[], locale: Locale, maxChars = 2000): string {
  const copy = memoryCopy(locale),
    cap = Math.max(0, Math.min(2000, maxChars))
  const rows = memories
    .filter((m) => m.status === 'active')
    .sort((a, b) => b.updatedAt - a.updatedAt || a.id.localeCompare(b.id))
  if (!rows.length || !cap) return ''
  const render = (selected: Memory[]) => {
    const groups = MemoryKindSchema.options.flatMap((kind) => {
      const group = selected.filter((m) => m.kind === kind).sort((a, b) => a.id.localeCompare(b.id))
      return group.length
        ? [
            `${copy[kind]}:\n${group.map((m) => `- [${m.id}; ${new Date(m.confirmedAt).toISOString().slice(0, 10)}] ${m.text.replaceAll('{{', '{ {')}`).join('\n')}`,
          ]
        : []
    })
    return [
      copy.preamble,
      ...groups,
      ...(rows.length > selected.length ? [copy.omitted(rows.length - selected.length)] : []),
    ].join('\n\n')
  }
  const selected: Memory[] = []
  for (const row of rows) if (render([...selected, row]).length <= cap) selected.push(row)
  return render(selected).slice(0, cap)
}
/** Bounded literal retrieval with explicit coverage and age; no semantic guesses. */
export function searchMemories(
  rows: readonly Memory[],
  scope: MemoryScope,
  query: string | undefined,
  now: number,
  references: Record<string, number> = {},
) {
  const needle = query?.trim().toLocaleLowerCase()
  const matches = rows
    .filter(
      (m) =>
        m.status === 'active' &&
        memoryScopeKey(m.scope) === memoryScopeKey(scope) &&
        (!needle || m.text.toLocaleLowerCase().includes(needle)),
    )
    .sort((a, b) => b.confirmedAt - a.confirmedAt || a.id.localeCompare(b.id))
  const items: {
    id: string
    kind: Memory['kind']
    text: string
    confirmedAt: number
    updatedAt: number
    stale: boolean
  }[] = []
  for (const m of matches.slice(0, 20)) {
    const item = {
      id: m.id,
      kind: m.kind,
      text: m.text,
      confirmedAt: m.confirmedAt,
      updatedAt: m.updatedAt,
      stale: now - Math.max(m.confirmedAt, references[m.id] ?? 0) > 90 * 86400000,
    }
    // `false` is one character longer than `true`; budget for either final coverage state.
    if (JSON.stringify({ items: [...items, item], total: matches.length, truncated: false }).length > 4000)
      break
    items.push(item)
  }
  return { items, total: matches.length, truncated: items.length < matches.length }
}
