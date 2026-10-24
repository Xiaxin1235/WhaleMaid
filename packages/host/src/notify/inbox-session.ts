import { randomUUID } from 'node:crypto'
import { access } from 'node:fs/promises'
import type { Context } from '@deepseek-ai/cordis'
import type { GoalId } from '@whaledot/core'
import { shortTitle } from '@whaledot/core'
import type { SessionId } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-user-questions'
import type {} from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-api-session-controller'
import type {} from '@deepseek-ai/dsh-permission-presets'
import type { AskUserQuestionItem, AskUserQuestionAnswer } from '@deepseek-ai/dsh-user-questions'
import type { WhaleStore } from '../store/index.js'
export interface InboxPort {
  prepare?(goalId: GoalId): Promise<void>
  ask(goalId: GoalId, question: AskUserQuestionItem, signal: AbortSignal): Promise<AskUserQuestionAnswer>
}
/** A read-only runtime root carries questions only; this adapter has no prompt/model call. */
export function dshInbox(ctx: Context, store: WhaleStore): InboxPort {
  const preparing = new Map<GoalId, Promise<SessionId>>()
  const prepare = async (goalId: GoalId): Promise<SessionId> => {
    const goal = store.goals.get(goalId)!
    const controller = ctx.get('sessionController') as Context['sessionController'] | undefined
    if (!controller) throw Error('inbox-service-unavailable')
    let id = goal.inboxSessionId as SessionId | undefined
    if (id) {
      if (store.inboxSessions.get(id)?.goalId !== goalId) throw Error('inbox-ownership-missing')
      try {
        await controller.inspect(id)
      } catch (error) {
        if (
          error instanceof Error &&
          ['ApiSessionNotFound', 'SessionPersistenceNotFoundError'].includes(error.name)
        )
          id = undefined
        else throw error
      }
    }
    if (!id) {
      id = randomUUID() as SessionId
      // Register the requested identity before it is visible to any UI or tools.
      store.inboxSessions.insert({ id, goalId, at: Date.now() })
      let cwd =
        store.tasks
          .list(goalId)
          .flatMap((t) => store.runs.list(t.id))
          .at(-1)?.worktreePath ?? goal.projectRoot
      try {
        await access(cwd)
      } catch {
        cwd = goal.projectRoot
      }
      const created = await controller.create({ sessionId: id, cwd })
      if (created.sessionId !== id) throw Error('inbox-identity-mismatch')
      const fresh = store.goals.get(goalId)!
      store.goals.update({ ...fresh, inboxSessionId: id, version: fresh.version + 1 }, fresh.version)
    }
    await controller.rename({ sessionId: id, title: `[WhaleDot] ${shortTitle(goal.title)}` })
    const agents = ctx.get('agents') as Context['agents'] | undefined
    const presets = ctx.get('permissionPresets') as Context['permissionPresets'] | undefined
    const agent = agents?.get(id)
    if (!agent || !presets) throw Error('inbox-agent-unavailable')
    presets.set(agent.session, 'read-only')
    if (presets.current(agent.session) !== 'read-only') throw Error('inbox-preset-mismatch')
    return id
  }
  const ready = (goalId: GoalId): Promise<SessionId> => {
    let pending = preparing.get(goalId)
    if (!pending) {
      pending = prepare(goalId).finally(() => preparing.delete(goalId))
      preparing.set(goalId, pending)
    }
    return pending
  }
  return {
    async prepare(goalId) {
      await ready(goalId)
    },
    async ask(goalId, question, signal) {
      const id = await ready(goalId)
      signal.throwIfAborted()
      const agents = ctx.get('agents') as Context['agents'] | undefined
      const questions = ctx.get('userQuestions') as Context['userQuestions'] | undefined
      const agent = agents?.get(id)
      if (!agent || !questions) throw Error('inbox-service-unavailable')
      return questions.ask({ agent, questions: [question], signal })
    },
  }
}
