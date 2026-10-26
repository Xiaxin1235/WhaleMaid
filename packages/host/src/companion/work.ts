import { randomUUID } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import type { SessionId } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-api-session-controller'
import { inspectProject } from '../goal-intake/project.js'

/** The one `ctx.workspaceRegistry` call used here (`create(path, title?)` returns an existing workspace). */
interface WorkspaceRegistryLike {
  create(path: string, title?: string): Promise<{ id: string }>
}

/** Title of a conversation she started. No `[WhaleMaid]` prefix: it is ordinary work, not an autopilot task. */
export function workTitle(task: string, locale: 'zh-CN' | 'en'): string {
  const first = task.split(/\r?\n/)[0]!.trim()
  const short = Array.from(first).length > 40 ? Array.from(first).slice(0, 40).join('') + '…' : first
  return locale === 'zh-CN' ? `大肥鱼派的活：${short}` : `Work from Da Fei Yu: ${short}`
}

/**
 * Open an ordinary conversation in the project and send it the task. It gets the user's default
 * permission preset and approvals like any conversation the user opens; nothing is granted here.
 */
export async function startWork(
  ctx: Context,
  input: { projectRoot: string; task: string },
  locale: 'zh-CN' | 'en',
): Promise<{ sessionId: string }> {
  const facts = await inspectProject(input.projectRoot)
  const controller = ctx.get('sessionController') as Context['sessionController'] | undefined
  if (!controller) throw Error('session-controller-unavailable')
  // A workspace makes the conversation show up under the project in Harness's sidebar.
  const registry = ctx.get('workspaceRegistry') as WorkspaceRegistryLike | undefined
  const workspace = registry ? await registry.create(facts.projectRoot) : undefined
  const created = await controller.create({
    sessionId: randomUUID() as SessionId,
    ...(workspace ? { workspaceId: workspace.id as never } : { cwd: facts.projectRoot }),
  })
  await controller.rename({ sessionId: created.sessionId, title: workTitle(input.task, locale) })
  await controller.prompt(
    {
      sessionId: created.sessionId,
      requestId: randomUUID() as Parameters<typeof controller.prompt>[0]['requestId'],
      mode: 'queue',
      content: [{ type: 'text', text: input.task }],
    },
    new AbortController().signal,
  )
  return { sessionId: created.sessionId }
}
