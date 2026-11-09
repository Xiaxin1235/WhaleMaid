import type { Locale } from '../i18n/index.js'
import type { DetectorId, InitiativeChoice } from './model.js'

const findings = {
  en: {
    repeatedFailure: ['Repeated failure', 'The same acceptance failure occurred at least three times.'],
    stallWarning: ['Progress stall', 'The goal is one unchanged round away from pausing.'],
    noAcceptance: ['Limited acceptance evidence', 'Several tasks lack a measured acceptance result.'],
    budgetBurn: [
      'Budget running low',
      'At least 80% of a limit is used, with at most half the tasks passed.',
    ],
    pendingBacklog: ['Decision waiting', 'A decision has been unanswered for at least 24 hours.'],
    idleGoal: ['Idle goal', 'An authorized goal has been idle for at least seven days.'],
    leftovers: ['Remaining work', 'A completed goal still has cancelled tasks.'],
  },
  'zh-CN': {
    repeatedFailure: ['同一原因反复失败', '同一种验收失败至少出现了三次。'],
    stallWarning: ['停滞前兆', '再有一轮进度不变，目标就会暂停。'],
    noAcceptance: ['验收依据不足', '部分任务缺少可测量的验收结果。'],
    budgetBurn: ['预算将尽', '至少一项额度已用八成，通过的任务不超过一半。'],
    pendingBacklog: ['决定积压', '有一项决定已等待至少 24 小时。'],
    idleGoal: ['目标长期闲置', '一个已授权的目标至少闲置了七天。'],
    leftovers: ['完成后的遗留', '已完成目标还有被取消的任务。'],
  },
} satisfies Record<Locale, Record<DetectorId, [string, string]>>

export function initiativeFindingCopy(locale: Locale, detector: DetectorId) {
  const [name, summary] = findings[locale][detector]
  return { name, summary }
}

const choices = {
  'zh-CN': {
    'draft-diagnosis': '起草只读排查目标',
    'draft-followup': '起草后续目标',
    pause: '暂停目标',
    'split-note': '备注提醒我拆分任务',
    'open-goal': '查看目标详情',
    'open-decision': '打开待处理决定',
    'idle-pause': '暂停到明天',
    'idle-keep': '保持现状',
    snooze: '稍后',
    dismiss: '忽略',
    mute: '不再提醒这类事',
    inaccurate: '这条不准',
    evidence: '查看证据',
  },
  en: {
    'draft-diagnosis': 'Draft a read-only investigation',
    'draft-followup': 'Draft a follow-up goal',
    pause: 'Pause goal',
    'split-note': 'Add a note to split the task',
    'open-goal': 'Open goal details',
    'open-decision': 'Open pending decision',
    'idle-pause': 'Pause until tomorrow',
    'idle-keep': 'Keep as is',
    snooze: 'Later',
    dismiss: 'Dismiss',
    mute: 'Stop reminders like this',
    inaccurate: 'This is inaccurate',
    evidence: 'View evidence',
  },
} satisfies Record<Locale, Record<InitiativeChoice, string>>

export function initiativeChoiceCopy(locale: Locale, choice: InitiativeChoice) {
  const zh = locale === 'zh-CN'
  if (choice === 'snooze')
    return { label: choices[locale].snooze, description: zh ? '1 小时后再提醒。' : 'Remind me in one hour.' }
  const description =
    choice === 'draft-diagnosis' || choice === 'draft-followup'
      ? zh
        ? '只生成草案，需在 WhaleMaid 面板审核授权。'
        : 'Creates a draft for review and authorization in WhaleMaid.'
      : choice === 'mute'
        ? zh
          ? '只静默当前目标的这类发现，可在面板恢复。'
          : 'Mutes this finding type for this goal. Restore it in the panel.'
        : choice === 'idle-pause'
          ? zh
            ? '暂停并记录明日复查，不会自动恢复。'
            : 'Pauses and notes a review tomorrow. Resuming requires your action.'
          : undefined
  return { label: choices[locale][choice], description }
}
