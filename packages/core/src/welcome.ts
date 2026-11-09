import type { Locale } from './i18n/index.js'

/**
 * The welcome dialog shows once per release listed here. When a release has
 * notable changes, bump this value and replace the notes alongside CHANGELOG.
 * Leave it unchanged for a release that needs no announcement.
 */
export const WELCOME_RELEASE = '1.4.0'

/** Short what's-new notes for WELCOME_RELEASE, three to five lines each. */
export const WELCOME_NOTES: Record<Locale, readonly string[]> = {
  'zh-CN': [
    '现在会主动给建议卡，通知中心和桌宠信封都能处理。建议卡默认开启，可在 WhaleMaid → 主动性 一键关闭。',
    '建议附带证据，你可以采纳、稍后提醒、忽略或静默当前目标的同类提醒。',
    '采纳只读排查建议会生成草案，仍由你在面板审核授权。',
    '主动性面板显示 7 天和 30 天效果，支持查看并恢复自动调整。',
  ],
  en: [
    'Proactive suggestion cards appear in the notification center and pet envelope. They are on by default and can be turned off under WhaleMaid → Initiative.',
    'Check the evidence, adopt a suggestion, snooze for one hour, dismiss it, or mute that finding type for the current goal.',
    'A read-only investigation suggestion creates a draft for your review and authorization in the panel.',
    'The Initiative panel shows 7-day and 30-day results and lets you undo automatic adjustments.',
  ],
}
