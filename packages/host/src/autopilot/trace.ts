import type { GoalId } from '@whaledot/core'
import type { WhaleStore } from '../store/index.js'
/** Export only the addressed goal ledger; no caller path, credential file or session body is read. */
export function exportTrace(store: WhaleStore, goalId: GoalId): { markdown: string; filename: string } {
  const goal = store.goals.get(goalId)
  if (!goal) throw new Error('goal-not-found')
  const tasks = store.tasks.list(goalId),
    runs = tasks.flatMap((task) => store.runs.list(task.id))
  const section = (title: string, value: unknown) =>
    `## ${title}\n\n\`\`\`json\n${JSON.stringify(value, null, 2).replaceAll('`', '\\u0060')}\n\`\`\`\n`
  const markdown = [
    `# WhaleDot trace: ${goalId}\n`,
    section('Goal and authorization versions', { goal, scopes: store.scopes.list(goalId) }),
    section(
      'Tasks and transitions',
      tasks.map((task) => ({ task, transitions: store.transitions.list(task.id) })),
    ),
    section(
      'Runs',
      runs.map((run) => ({ ...run, durationMs: (run.endedAt ?? run.startedAt) - run.startedAt })),
    ),
    section('Verification evidence and diff statistics', {
      verifications: store.verifications
        .list()
        .filter((report) => tasks.some((task) => task.id === report.taskId)),
      evidence: runs.flatMap((run) => store.evidence.list(run.run_id)),
    }),
    section('Checkpoints', store.checkpoints.list(goalId)),
    section('Decisions and user choices', {
      notifications: store.notifications.list().filter((n) => n.goalId === goalId),
      suggestions: store.suggestions.list().filter((s) => s.bindTo.goalId === goalId),
    }),
    section('Notifications, notes and delivery', {
      notes: store.userNotes.list(goalId),
      choices: store.notificationChoices.list(goalId),
      deliveries: store.notificationDeliveries.list(goalId),
      inboxSessions: store.inboxSessions.list(goalId),
    }),
    section('Scheduler events', store.autopilotEvents.list(goalId)),
  ].join('\n')
  return { markdown, filename: `whaledot-${goalId}-trace.md` }
}
