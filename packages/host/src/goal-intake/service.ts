import { z } from 'zod'
import type { PeerScope } from '@deepseek-ai/dsh-client-connection'
import {
  buildDraftPrompt,
  parseDraftResponse,
  draftToRecords,
  ConfirmedGoalFormSchema,
  classifyCommand,
  GoalIdSchema,
} from '@whaledot/core'
import type { Clock, IdGen, GoalDraft, Locale } from '@whaledot/core'
import { join } from 'node:path'
import { WhaleStore, productionClock, productionIdGen } from '../store/index.js'
import type { ScopeService } from '../scope-service.js'
import type { DraftModel } from './model.js'
import { inspectProject, projectPath } from './project.js'
import type { ProjectFacts } from './project.js'
export const DraftRequestSchema = z.strictObject({
  text: z.string().trim().min(1).max(4000),
  projectRoot: z.string().min(1).max(2000),
  locale: z.enum(['zh-CN', 'en']).optional(),
})
export const DraftIdRequestSchema = z.strictObject({ draftId: z.string().min(1).max(100) })
export const GoalRequestSchema = z.strictObject({ goalId: GoalIdSchema })
export const GoalPausedSchema = GoalRequestSchema.extend({ paused: z.boolean() })
export interface DraftStatus {
  state: 'running' | 'ready' | 'failed'
  draft?: GoalDraft
  projectFacts?: ProjectFacts
  error?: string
}
interface DraftJob {
  at: number
  status: DraftStatus
  controller: AbortController
  expiry?: ReturnType<typeof setTimeout>
}
function owner(peer: PeerScope) {
  if (!peer || peer.principal.kind !== 'owner' || peer.signal.aborted)
    throw new Error('Authenticated owner required')
}

/** In-memory proposals never write domain records; only confirm() creates an authorized goal. */
export class GoalIntake {
  private readonly jobs = new Map<string, DraftJob>()
  private running = false
  constructor(
    private readonly store: WhaleStore,
    private readonly scopes: ScopeService,
    private readonly model: DraftModel,
    private readonly clock: Clock = productionClock,
    private readonly idGen: IdGen = productionIdGen,
    private readonly inspect = inspectProject,
  ) {}

  /** Start one in-memory proposal and return its handle without waiting for the model. */
  start(input: unknown, peer: PeerScope, locale: Locale = 'en') {
    owner(peer)
    this.expire()
    const request = DraftRequestSchema.parse(input)
    if (this.running) throw new Error('draft-busy')
    const draftId = this.idGen.next('draft')
    const job: DraftJob = {
      at: this.clock.now(),
      status: { state: 'running' },
      controller: new AbortController(),
    }
    this.jobs.set(draftId, job)
    job.expiry = setTimeout(() => {
      job.controller.abort()
      this.jobs.delete(draftId)
    }, 600000)
    job.expiry.unref()
    this.running = true
    const signal = AbortSignal.any([job.controller.signal, peer.signal, AbortSignal.timeout(120000)])
    void (async () => {
      try {
        const facts = await this.inspect(request.projectRoot)
        job.status.projectFacts = facts
        signal.throwIfAborted()
        const prompt = buildDraftPrompt(request.text, request.locale ?? locale, facts)
        const response = await this.model.generate(prompt, signal)
        signal.throwIfAborted()
        const parsed = parseDraftResponse(response)
        if (!parsed.ok) throw new Error(`${parsed.error.code}: ${parsed.error.reason}`)
        job.status = { state: 'ready', draft: parsed.value, projectFacts: facts }
      } catch (error) {
        job.status = {
          ...job.status,
          state: 'failed',
          error: signal.aborted
            ? 'draft-cancelled-or-timeout'
            : error instanceof Error
              ? error.message
              : 'model-call-failed',
        }
      } finally {
        this.running = false
      }
    })()
    return { draftId }
  }
  /** Read a detached proposal snapshot after owner authentication and expiry checks. */
  status(input: unknown, peer: PeerScope): DraftStatus {
    owner(peer)
    this.expire()
    const { draftId } = DraftIdRequestSchema.parse(input)
    const job = this.jobs.get(draftId)
    if (!job) throw new Error('draft-expired')
    return structuredClone(job.status)
  }
  /** Abort a proposal and discard its stored result. */
  cancel(input: unknown, peer: PeerScope) {
    owner(peer)
    const { draftId } = DraftIdRequestSchema.parse(input)
    this.jobs.get(draftId)?.controller.abort()
    clearTimeout(this.jobs.get(draftId)?.expiry)
    this.jobs.delete(draftId)
    return { cancelled: true }
  }
  /** Supply facts for manual entry without a model request. */
  async project(input: unknown, peer: PeerScope) {
    owner(peer)
    const { projectRoot } = z.strictObject({ projectRoot: z.string().min(1).max(2000) }).parse(input)
    return this.inspect(projectRoot)
  }
  /** Recheck the exact form values and atomically create goal, grant and initial tasks. */
  async confirm(input: unknown, peer: PeerScope) {
    owner(peer)
    const form = ConfirmedGoalFormSchema.parse(input)
    const facts = await this.inspect(form.projectRoot)
    if (facts.projectRoot !== form.projectRoot) throw new Error('project-root-changed')
    if (form.permissionPreset === 'workspace-write' && !facts.isGit) throw new Error('non-git-read-only')
    const allowedPaths = await Promise.all(
      form.allowedPaths.map((path) => projectPath(facts.projectRoot, path)),
    )
    const protectedPaths = await Promise.all(
      form.protectedPaths.map((path) => projectPath(facts.projectRoot, path)),
    )
    if (
      allowedPaths.some((path, index) => path !== form.allowedPaths[index]) ||
      protectedPaths.some((path, index) => path !== form.protectedPaths[index])
    )
      throw new Error('paths-must-be-canonical')
    const required = [join(facts.projectRoot, '.git'), join(facts.projectRoot, '.env*')]
    if (
      required.some(
        (path) => !protectedPaths.some((candidate) => candidate.toLowerCase() === path.toLowerCase()),
      )
    )
      throw new Error('missing-default-protection')
    if (form.verifyCommands.some((command) => classifyCommand(command).class === 'forbidden'))
      throw new Error('forbidden-verify-command')
    owner(peer)
    const records = draftToRecords(undefined, form, { clock: this.clock, idGen: this.idGen })
    return this.store.transaction(() => {
      this.store.goals.insert(records.goal)
      const scope = this.scopes.grant(records.scopeDraft, peer)
      records.tasks.forEach((task) => this.store.tasks.insert(task))
      const goal = this.store.goals.get(records.goal.id)!
      return { goal, scope, rejected: records.rejected }
    })
  }
  /** Read persisted goal details and the current grant, including its revoked status. */
  detail(input: unknown, peer: PeerScope) {
    owner(peer)
    const { goalId } = GoalRequestSchema.parse(input)
    const goal = this.store.goals.get(goalId)
    if (!goal) throw new Error('goal-not-found')
    const tasks = this.store.tasks.list(goalId)
    return {
      goal,
      scope: (goal.scopeId ? this.store.scopes.get(goal.scopeId) : undefined) ?? null,
      activeScope: this.scopes.activeScopeFor(goalId) ?? null,
      tasks,
      runs: tasks.flatMap((task) => this.store.runs.list(task.id)),
      checkpoints: this.store.checkpoints.list(goalId),
      evidence: tasks
        .flatMap((task) => this.store.runs.list(task.id))
        .flatMap((run) => this.store.evidence.list(run.run_id)),
      transitions: tasks
        .flatMap((task) => this.store.transitions.list(task.id))
        .sort((a, b) => b.at - a.at)
        .slice(0, 30),
    }
  }
  /** Pause or resume only the selected goal, preserving its task states. */
  setPaused(input: unknown, peer: PeerScope) {
    owner(peer)
    const { goalId, paused } = GoalPausedSchema.parse(input)
    const goal = this.store.goals.get(goalId)
    if (!goal || !['active', 'paused'].includes(goal.status)) throw new Error('goal-not-pausable')
    this.store.goals.update(
      { ...goal, status: paused ? 'paused' : 'active', version: goal.version + 1 },
      goal.version,
    )
    return this.detail({ goalId }, peer)
  }
  /** Cancel all requests and clear the proposal cache when the plugin unloads. */
  dispose() {
    for (const job of this.jobs.values()) {
      job.controller.abort()
      clearTimeout(job.expiry)
    }
    this.jobs.clear()
  }
  private expire() {
    for (const [id, job] of this.jobs)
      if (this.clock.now() - job.at >= 600000) {
        job.controller.abort()
        clearTimeout(job.expiry)
        this.jobs.delete(id)
      }
  }
}
export type GoalDetail = ReturnType<GoalIntake['detail']>
