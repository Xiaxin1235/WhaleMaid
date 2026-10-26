import { z } from 'zod'
import { GoalIdSchema } from '../model/ids.js'
import type { ProjectGoal } from '../model/goal.js'
import type { AuthorizationScope } from '../model/authorization.js'
import type { Locale } from '../i18n/index.js'
import { t } from '../i18n/index.js'
import { redactSecrets } from './redact.js'

export const CompanionNoteSchema = z
  .string()
  .trim()
  .min(1)
  .refine((s) => Array.from(s).length <= 500, 'note-too-long')
  .refine((s) => redactSecrets(s) === s, 'contains-secret')
export const ProposeGoalSchema = z.strictObject({
  kind: z.literal('draft-goal'),
  text: z.string().trim().min(1).max(4000),
  projectRoot: z.string().trim().min(1).max(2000),
})
/** Hand a task to a new ordinary Harness conversation in the project, so she stays free to chat. */
export const ProposeWorkSchema = z.strictObject({
  kind: z.literal('start-work'),
  projectRoot: z.string().trim().min(1).max(2000),
  task: z.string().trim().min(1).max(8000),
})
export const ProposeGoalPauseSchema = z.strictObject({
  kind: z.literal('goal-pause'),
  goalId: GoalIdSchema,
  paused: z.boolean(),
})
export const ProposeAutopilotSchema = z.strictObject({
  kind: z.literal('autopilot'),
  goalId: GoalIdSchema,
  enabled: z.boolean(),
})
export const ProposeGlobalPauseSchema = z.strictObject({
  kind: z.literal('global-pause'),
  paused: z.boolean(),
})
export const ProposeGoalNoteSchema = z.strictObject({
  kind: z.literal('goal-note'),
  goalId: GoalIdSchema,
  text: CompanionNoteSchema,
})
export const CompanionActionSchema = z.discriminatedUnion('kind', [
  ProposeGoalSchema,
  ProposeGoalPauseSchema,
  ProposeAutopilotSchema,
  ProposeGlobalPauseSchema,
  ProposeGoalNoteSchema,
  ProposeWorkSchema,
])
export type CompanionAction = z.infer<typeof CompanionActionSchema>
export const CompanionProposalSchema = z.strictObject({
  proposalId: z.string().min(1),
  sessionId: z.string().min(1),
  createdAt: z.number().int().nonnegative(),
  action: CompanionActionSchema,
  version: z.string(),
})
export interface ActionFacts {
  goal?: ProjectGoal | undefined
  scope?: AuthorizationScope | undefined
  globalPaused: boolean
  globalVersion: number
  notesVersion: string
  notesCount: number
}
/** Human copy never dispatches an action. */
export const actionCopy = (locale: Locale) =>
  locale === 'zh-CN'
    ? {
        question: '要我这样处理吗？',
        confirm: '确认',
        decline: '不用了',
        disabled: '项目管理动作已关闭',
        changed: '状态已变，请重新说一次',
        missing: '目标不存在，请在 WhaleMaid 面板核对目标。',
        unchanged: '已经是这个状态，无需操作。',
        invalid: '当前目标状态不支持这个动作，请在面板查看。',
        noScope: '没有有效授权，请到 WhaleMaid 面板确认授权。',
        pendingLimit: '已有 3 条待确认提议，请先处理。',
        noEdit: '只接受确认或不用了；需要修改请重新说一次。',
        draft: '起草新目标',
        draftOnly:
          '这一步只是起草，不会开始执行。授权路径、权限、验收命令仍须你在 WhaleMaid 面板“确认授权”中逐项确认。',
        pause: '目标暂停',
        autopilot: '自动推进',
        global: '全局暂停',
        note: '给目标加备注',
        on: '开',
        off: '关',
        noteEffect: '备注会进入后续任务提示词；不修改或扩大授权。',
        pauseEffect: '保留任务和授权；继续目标可能恢复原先已启用的自动推进。',
        autoEffect: '仅使用现有授权；开启后可自动执行已授权任务。',
        globalEffect: '影响所有 WhaleMaid 目标；恢复后原先已启用的目标可继续自动推进。',
        attribution: (time: string) => `由大肥鱼提议，你在 ${time} 确认`,
        work: '开一个工作对话',
        workEffect:
          '在这个项目目录新开一个普通 Harness 对话去做这件事；它按你的权限预设和审批运行，危险操作仍会问你。我可以随时帮你看它的进展。',
        workStarted: '工作对话已开始',
        drafts: '大肥鱼起草的目标',
        review: '审核草案与授权',
        saved: '已执行',
        declined: '未执行',
        failed: '未能执行',
        paths: '允许路径',
        permission: '权限',
        actions: '允许动作',
        commands: '验收命令',
        protected: '保护路径',
        quotas: '每日额度',
        runs: '执行',
        plans: '规划',
      }
    : {
        question: 'Should I do this?',
        confirm: 'Confirm',
        decline: 'No thanks',
        disabled: 'Project management actions are disabled',
        changed: 'State changed; please ask again.',
        missing: 'Goal not found. Check the WhaleMaid panel.',
        unchanged: 'Already in that state; no action needed.',
        invalid: 'This goal cannot accept that action. Check the panel.',
        noScope: 'No active authorization. Review authorization in the WhaleMaid panel.',
        pendingLimit: 'Three proposals are already awaiting confirmation.',
        noEdit: 'Choose Confirm or No thanks. To change the action, ask again.',
        draft: 'Draft a new goal',
        draftOnly:
          'This step only drafts; it will not start execution. Review paths, permissions and verification commands yourself in the panel’s Confirm authorization screen.',
        pause: 'Goal paused',
        autopilot: 'Autopilot',
        global: 'Global pause',
        note: 'Add a goal note',
        on: 'On',
        off: 'Off',
        noteEffect: 'This note enters subsequent task prompts; it does not change or expand authorization.',
        pauseEffect:
          'Tasks and authorization are retained. Resuming may restart previously enabled autopilot.',
        autoEffect: 'Uses existing authorization only. Enabling permits automatic authorized tasks.',
        globalEffect: 'Affects all WhaleMaid goals. Resuming may restart previously enabled goals.',
        attribution: (time: string) => `Proposed by Dafeiyu; you confirmed at ${time}`,
        work: 'Start a work conversation',
        workEffect:
          'Opens an ordinary Harness conversation in this project directory to do the task. It runs under your permission preset and approvals; dangerous operations still ask you. I can check its progress for you any time.',
        workStarted: 'Work conversation started',
        drafts: 'Goals drafted by Dafeiyu',
        review: 'Review draft and authorization',
        saved: 'Executed',
        declined: 'Not executed',
        failed: 'Could not execute',
        paths: 'Allowed paths',
        permission: 'Permission',
        actions: 'Allowed actions',
        commands: 'Verification commands',
        protected: 'Protected paths',
        quotas: 'Daily quotas',
        runs: 'Runs',
        plans: 'Plans',
      }

/** Detached version token, including monotonic pause revision and current note identities. */
export function actionVersion(facts: ActionFacts): string {
  return JSON.stringify(facts)
}
/** Labels for management audit rows, independent of stable action identifiers. */
export function actionLabel(kind: string, locale: Locale): string {
  const c = actionCopy(locale)
  const labels: Record<string, string> = {
    'draft-goal': c.draft,
    'goal-pause': c.pause,
    autopilot: c.autopilot,
    'global-pause': c.global,
    'goal-note': c.note,
    'start-work': c.work,
  }
  return labels[kind] ?? kind
}
/** Refuse missing, unchanged or ineligible actions before asking. Authorization comes from host facts. */
export function describeAction(
  action: CompanionAction,
  facts: ActionFacts,
  locale: Locale,
): { ok: true; detail: string } | { ok: false; reason: string } {
  const c = actionCopy(locale),
    state = (b: boolean) => (b ? c.on : c.off)
  if (action.kind === 'draft-goal')
    return { ok: true, detail: `${c.draft}\n${action.text}\n${action.projectRoot}\n${c.draftOnly}` }
  if (action.kind === 'start-work')
    return {
      ok: true,
      detail: `${c.work}
${action.projectRoot}
${action.task}
${c.workEffect}`,
    }
  if (action.kind === 'global-pause')
    return facts.globalPaused === action.paused
      ? { ok: false, reason: c.unchanged }
      : {
          ok: true,
          detail: `${c.global}: ${state(facts.globalPaused)} → ${state(action.paused)}\n${c.globalEffect}`,
        }
  const g = facts.goal
  if (!g || g.id !== action.goalId) return { ok: false, reason: c.missing }
  if (action.kind === 'goal-note')
    return {
      ok: true,
      detail: `${g.title}\n${c.note}: ${facts.notesCount} → ${facts.notesCount + 1}\n${action.text}\n${c.noteEffect}`,
    }
  if (action.kind === 'goal-pause') {
    if (!['active', 'paused'].includes(g.status)) return { ok: false, reason: c.invalid }
    if ((g.status === 'paused') === action.paused) return { ok: false, reason: c.unchanged }
    return {
      ok: true,
      detail: `${g.title}\n${c.pause}: ${state(g.status === 'paused')} → ${state(action.paused)}\n${c.pauseEffect}`,
    }
  }
  if (g.autopilot.enabled === action.enabled) return { ok: false, reason: c.unchanged }
  const scope = facts.scope
  if (
    action.enabled &&
    (!scope || scope.goalId !== g.id || scope.id !== g.scopeId || scope.status !== 'active')
  )
    return { ok: false, reason: c.noScope }
  if (action.enabled && g.status !== 'active') return { ok: false, reason: c.invalid }
  return {
    ok: true,
    detail: `${g.title}\n${c.autopilot}: ${state(g.autopilot.enabled)} → ${state(action.enabled)}\n${c.autoEffect}${action.enabled && scope ? `\n${c.paths}: ${scope.allowedPaths.join(', ')}\n${c.permission}: ${scope.permissionPreset}\n${t(locale, 'commandMode')}: ${t(locale, scope.commandMode === 'trusted' ? 'commandTrusted' : 'commandConfirmed')}\n${c.actions}: ${scope.allowedActions.join(', ')}\n${c.protected}: ${scope.protectedPaths.join(', ')}\n${c.commands}: ${scope.verifyCommands.join(', ')}\n${c.quotas}: ${c.runs} ${scope.limits.maxRunsPerDay}, ${c.plans} ${scope.limits.plannerCallsPerDay}` : ''}`,
  }
}
