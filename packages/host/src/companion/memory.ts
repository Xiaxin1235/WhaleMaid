import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-user-questions'
import type { AskUserQuestionItem, AskUserQuestionAnswer } from '@deepseek-ai/dsh-user-questions'
import {
  MemoryTextSchema,
  MemoryKindSchema,
  ProjectKeySchema,
  memoryScopeKey,
  memoryCopy,
  projectKeyForGoal,
  renderMemoryBlock,
  searchMemories,
} from '@whalemaid/core'
import type { Memory, MemoryScope, Locale } from '@whalemaid/core'
import type { WhaleStore } from '../store/index.js'

export const MemoryQuerySchema = z
  .strictObject({
    scope: z.enum(['personal', 'project']),
    goalId: z.string().max(200).optional(),
    path: ProjectKeySchema.optional(),
    query: z.string().max(300).optional(),
  })
  .superRefine((v, c) => {
    if (v.scope === 'project' ? !!v.goalId === !!v.path : !!v.goalId || !!v.path)
      c.addIssue({
        code: 'custom',
        message: 'Specify exactly one project goalId or path, and neither for personal scope',
      })
  })
export const MemoryProposeSchema = MemoryQuerySchema.safeExtend({
  query: z.never().optional(),
  kind: MemoryKindSchema,
  text: MemoryTextSchema,
  replaces: z.string().max(128).optional(),
})
export const MemoryForgetSchema = z.strictObject({
  id: z.string().min(1).max(128),
  reason: z.string().max(300).optional(),
})
export interface MemorySettings {
  enabled: boolean
  suggest: boolean
  maxChars: number
  draftProjectLessons: boolean
}
export interface MemoryExecution {
  agent?: Agent
  signal: AbortSignal
}
export interface MemoryDependencies {
  locale(): Locale
  settings(): MemorySettings
  owns(id: string): boolean
  ask(agent: Agent, question: AskUserQuestionItem, signal: AbortSignal): Promise<AskUserQuestionAnswer>
  now?(): number
  id?(): string
  timeoutMs?: number
}
/** Literal review content: Markdown must not swallow Windows path separators or reinterpret text. */
export function memoryReview(text: string): string {
  if (!/[\\`*_{}[\]<>#!|]/u.test(text)) return text
  const fence = '`'.repeat(Math.max(3, ...[...text.matchAll(/`+/g)].map((m) => m[0].length + 1)))
  return `${fence}\n${text}\n${fence}`
}
/** Confirmation lives here, outside model arguments; a model never supplies a consent flag. */
export class CompanionMemory {
  constructor(
    readonly store: WhaleStore,
    readonly deps: MemoryDependencies,
  ) {}
  now() {
    return this.deps.now?.() ?? Date.now()
  }
  settings(): MemorySettings {
    return this.deps.settings()
  }
  block(): string {
    return this.settings().enabled
      ? renderMemoryBlock(this.store.memories.list('personal'), this.deps.locale(), this.settings().maxChars)
      : ''
  }
  guidance(): string {
    const c = memoryCopy(this.deps.locale())
    return this.settings().enabled ? (this.settings().suggest ? c.suggest : c.explicit) : c.disabledGuidance
  }
  scope(input: z.infer<typeof MemoryQuerySchema>): MemoryScope {
    if (input.scope === 'personal') return { kind: 'personal' }
    if (input.path) return { kind: 'project', projectKey: input.path }
    const goal = this.store.goals.list().find((g) => g.id === input.goalId || g.title === input.goalId)
    const key = goal
      ? projectKeyForGoal(goal, goal.scopeId ? this.store.scopes.get(goal.scopeId) : undefined)
      : undefined
    if (!key) throw Error('project-not-found')
    return { kind: 'project', projectKey: key }
  }
  countCall(): void {
    const meta = this.store.memoryMeta()
    meta.calls = meta.calls.filter((t) => t > this.now() - 7 * 86400000)
    meta.calls.push(this.now())
    this.store.setMemoryMeta(meta)
  }
  list(raw: unknown, exec: MemoryExecution) {
    this.admit(exec)
    const input = MemoryQuerySchema.parse(raw)
    this.countCall()
    if (!this.settings().enabled) return { disabled: true, message: memoryCopy(this.deps.locale()).disabled }
    const result = searchMemories(
      this.store.memories.list(),
      this.scope(input),
      input.query,
      this.now(),
      this.store.memoryMeta().references,
    )
    const meta = this.store.memoryMeta()
    for (const item of result.items) meta.references[item.id] = this.now()
    this.store.setMemoryMeta(meta)
    return result
  }
  async propose(raw: unknown, exec: MemoryExecution) {
    this.admit(exec)
    const input = MemoryProposeSchema.parse(raw)
    this.countCall()
    if (!this.settings().enabled)
      return { status: 'rejected:disabled', message: memoryCopy(this.deps.locale()).disabled }
    const scope = this.scope(input),
      old = input.replaces ? this.store.memories.get(input.replaces) : undefined
    if (
      input.replaces &&
      (!old || old.status !== 'active' || memoryScopeKey(old.scope) !== memoryScopeKey(scope))
    )
      return { status: 'rejected:replacement-not-found' }
    if (!old && this.store.memories.list(memoryScopeKey(scope)).length >= 100)
      return { status: 'rejected:scope-full', message: memoryCopy(this.deps.locale()).scopeFull }
    const c = memoryCopy(this.deps.locale()),
      qid = randomUUID()
    const answer = await this.confirm(exec, {
      id: qid,
      question: c.ask,
      header: c.title,
      detail:
        memoryReview(
          `${scope.kind === 'personal' ? c.personal : `${c.project} ${scope.projectKey.replaceAll('\\', '/')}`} · ${c[input.kind]}\n${input.text}${old ? `\n${old.id}: ${old.text}` : ''}`,
        ) +
        '\n\n' +
        c.customHint,
      options: [{ label: c.save }, { label: c.decline }],
      multiSelect: false,
    })
    if (!answer || !this.settings().enabled) return { status: 'declined' }
    const item = answer.answers.length === 1 ? answer.answers[0] : undefined
    if (!item || item.id !== qid) return { status: 'declined' }
    const custom = item.custom?.trim(),
      edited = !!custom
    if (!custom && (item.selected.length !== 1 || item.selected[0] !== c.save)) return { status: 'declined' }
    const text = MemoryTextSchema.safeParse(custom || input.text)
    if (!text.success) return { status: `rejected:${text.error.issues[0]?.message}` }
    try {
      const row = this.save(
        scope,
        input.kind,
        text.data,
        { via: 'companion', sessionId: exec.agent!.session.id },
        old ? [old] : [],
      )
      return { status: edited ? 'edited-and-saved' : 'saved', id: row.id }
    } catch (error) {
      return { status: `rejected:${error instanceof Error ? error.message : 'store-unavailable'}` }
    }
  }
  async forget(raw: unknown, exec: MemoryExecution) {
    this.admit(exec)
    const input = MemoryForgetSchema.parse(raw)
    this.countCall()
    if (!this.settings().enabled)
      return { status: 'rejected:disabled', message: memoryCopy(this.deps.locale()).disabled }
    const old = this.store.memories.get(input.id)
    if (!old || old.status !== 'active') return { status: 'rejected:memory-not-found' }
    const c = memoryCopy(this.deps.locale()),
      qid = randomUUID()
    const answer = await this.confirm(exec, {
      id: qid,
      question: c.forgetAsk,
      detail: memoryReview(old.text) + '\n\n' + c.forgetHint,
      options: [{ label: c.forget }, { label: c.keep }],
      multiSelect: false,
    })
    if (!answer || !this.settings().enabled) return { status: 'declined' }
    const item = answer.answers.length === 1 ? answer.answers[0] : undefined
    if (
      !item ||
      item.id !== qid ||
      item.custom ||
      item.selected.length !== 1 ||
      item.selected[0] !== c.forget
    )
      return { status: 'declined' }
    try {
      this.update(old.id, old.version, { status: 'archived' }, 'companion')
      return { status: 'saved' }
    } catch {
      return { status: 'rejected:stale-version' }
    }
  }
  /** A synchronous transaction atomically archives exactly the versions the human reviewed. */
  save(
    scope: MemoryScope,
    kind: Memory['kind'],
    text: string,
    source: Memory['source'],
    replaces: Memory[] = [],
  ) {
    const now = this.now(),
      row: Memory = {
        id: this.deps.id?.() ?? randomUUID(),
        scope,
        kind,
        text: MemoryTextSchema.parse(text),
        source,
        confirmedAt: now,
        createdAt: now,
        updatedAt: now,
        status: 'active',
        version: 1,
        ...(replaces[0] ? { supersedes: replaces[0].id } : {}),
      }
    this.store.transaction(() => {
      for (const old of replaces)
        this.store.memories.update(
          { ...old, status: 'archived', updatedAt: now, version: old.version + 1 },
          old.version,
        )
      this.store.memories.insert(row)
    })
    return row
  }
  update(
    id: string,
    version: number,
    patch: { text?: string; status?: Memory['status'] },
    via: 'panel' | 'companion' = 'panel',
  ) {
    const row = this.store.memories.get(id)
    if (!row || row.version !== version) throw Error('stale-version')
    const next = {
      ...row,
      ...patch,
      text: patch.text === undefined ? row.text : MemoryTextSchema.parse(patch.text),
      source: via === 'panel' ? { via: 'panel' as const } : row.source,
      confirmedAt: via === 'panel' ? this.now() : row.confirmedAt,
      updatedAt: this.now(),
      version: version + 1,
    }
    this.store.memories.update(next, version)
    return next
  }
  panelList(includeArchived = false) {
    const meta = this.store.memoryMeta(),
      block = this.block()
    return {
      memories: this.store.memories.list(undefined, { includeArchived }).map((m) => ({
        ...m,
        stale: this.now() - Math.max(m.confirmedAt, meta.references[m.id] ?? 0) > 90 * 86400000,
      })),
      characters: block.length,
      estimatedTokens: Math.ceil(block.length / 2),
      calls7d: meta.calls.filter((t) => t > this.now() - 7 * 86400000).length,
      settings: this.settings(),
    }
  }
  export(format: 'markdown' | 'json') {
    const rows = this.store.memories.list(undefined, { includeArchived: true }),
      content =
        format === 'json'
          ? JSON.stringify(rows, null, 2)
          : rows
              .map(
                (m) =>
                  `## ${memoryScopeKey(m.scope)} / ${m.kind}\n\n- ID: ${m.id}\n- ${new Date(m.confirmedAt).toISOString()} / ${m.status} / ${m.source.via}\n\n${m.text}`,
              )
              .join('\n\n')
    return { content, filename: `whaledot-memories.${format === 'json' ? 'json' : 'md'}` }
  }
  private admit(exec: MemoryExecution): void {
    exec.signal.throwIfAborted()
    if (!exec.agent || !this.deps.owns(exec.agent.session.id)) throw Error('companion-only')
  }
  async confirm(exec: MemoryExecution, question: AskUserQuestionItem) {
    const timeout = AbortSignal.timeout(this.deps.timeoutMs ?? 600000),
      signal = AbortSignal.any([exec.signal, timeout])
    let onAbort: () => void = () => {}
    try {
      const cancelled = new Promise<never>((_, reject) => {
        onAbort = () => reject(signal.reason)
        signal.addEventListener('abort', onAbort, { once: true })
        if (signal.aborted) onAbort()
      })
      const value = await Promise.race([this.deps.ask(exec.agent!, question, signal), cancelled])
      signal.throwIfAborted()
      this.admit(exec)
      return value
    } catch {
      return undefined
    } finally {
      signal.removeEventListener('abort', onAbort)
    }
  }
}
/** The agent comes from ToolExecution, never a session id supplied by the model. */
export function memoryQuestionAdapter(ctx: Context): MemoryDependencies['ask'] {
  return (agent, question, signal) => {
    const questions = ctx.get('userQuestions') as Context['userQuestions'] | undefined
    if (!questions) throw Error('questions-unavailable')
    return questions.ask({ agent, questions: [question], signal })
  }
}
