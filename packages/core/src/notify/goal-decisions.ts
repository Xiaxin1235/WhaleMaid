import { z } from 'zod'
import type { DecisionChoice } from '../verify/model.js'
import type { Notification } from '../model/notification.js'
import type { Locale } from '../i18n/index.js'
import { containsMemorySecret } from '../memory/index.js'
export const DirectionSchema = z
  .string()
  .trim()
  .min(1, 'direction-required')
  .refine((s) => Array.from(s).length <= 500, 'direction-too-long')
  .refine((s) => !containsMemorySecret(s), 'contains-secret')
/** Only owner decisions about a stopped goal gain these choices; progress/digest notices do not. */
export function goalDecisionChoices(
  choices: readonly DecisionChoice[],
  reason: string,
  kind: Notification['kind'],
): DecisionChoice[] {
  const type = reason.split(':', 1)[0]!.trim()
  const eligible = [
    'stalled',
    'verification-unknown',
    'execution-needs-owner',
    'execution-stopped',
    'execution-preflight-blocked',
    'autopilot-disabled',
    'not-scorable',
    'insufficient-evidence',
    'fix-rounds-exhausted',
    'reconcile-blocked',
    'planner-need-user',
    'tampering',
  ].includes(type)
  return eligible && ['decision', 'blocked'].includes(kind)
    ? [...new Set([...choices, 'abandon' as const, 'change-direction' as const])]
    : [...choices]
}
export const goalDecisionCopy = (locale: Locale) =>
  locale === 'zh-CN'
    ? {
        abandon: '放弃这个目标',
        change: '改方向',
        confirm: '确认放弃',
        cancel: '不用了',
        abandonment: (title: string) => `放弃「${title}」后不再自动推进。记录会保留，不能自动恢复推进。`,
        direction: '新方向',
        submitDirection: '确认新方向',
        directionHint: '新方向会出现在之后每一轮任务的提示词里；授权路径、权限与验收命令保持原样。',
        inboxHint:
          '放弃目标请到 WhaleDot 面板二次确认。填写自定义文字即选择“改方向”，新方向会出现在之后每一轮任务的提示词里；只选“改方向”但不填文字不会执行。',
        directionRequired: '请填写新方向（1–500 字，不能含密钥）。',
        cancelled: '已放弃',
      }
    : {
        abandon: 'Abandon this goal',
        change: 'Change direction',
        confirm: 'Confirm abandonment',
        cancel: 'No thanks',
        abandonment: (title: string) =>
          `Abandon “${title}”? Automatic progress stops. Records are retained; automatic resumption is unavailable.`,
        direction: 'New direction',
        submitDirection: 'Confirm new direction',
        directionHint:
          'The new direction appears in every subsequent task prompt. Paths, permissions and verification commands remain unchanged.',
        inboxHint:
          'Abandonment requires a second confirmation in the WhaleDot panel. Custom text chooses Change direction and appears in every subsequent task prompt. Selecting Change direction without text does nothing.',
        directionRequired: 'Enter a new direction (1–500 characters, no secrets).',
        cancelled: 'Abandoned',
      }
