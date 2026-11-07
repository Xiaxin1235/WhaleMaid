import type { Locale } from './i18n/index.js'

/**
 * The welcome dialog shows once per release listed here. When a release has
 * notable changes, bump this value and replace the notes alongside CHANGELOG.
 * Leave it unchanged for a release that needs no announcement.
 */
export const WELCOME_RELEASE = '1.3.0'

/** Short what's-new notes for WELCOME_RELEASE, three to five lines each. */
export const WELCOME_NOTES: Record<Locale, readonly string[]> = {
  'zh-CN': [
    '新增「主动性」：反复失败、快要停滞、预算快用完等情况，会在面板和每日简报里提前提醒你。',
    '决策提问更可靠：投递失败会自动重试，重启或解除静音后会重新问你，验收时一定有「确认完成」和「再试一次」。',
    '通知中心可以看到每条决策的投递经过和下次提问时间。',
    '设置 → WhaleMaid → 帮助与反馈：随时重看这份介绍、提交问题或加入交流群。',
  ],
  en: [
    'New Initiative: repeated failures, looming stalls and budgets running low show up in the panel and your daily brief.',
    'More reliable decision questions: failed deliveries retry, interrupted asks return after a restart or unmute, and verification questions always offer accept and retry.',
    'The notification center shows each decision’s delivery history and when it will ask next.',
    'Settings → WhaleMaid → Help & feedback: reopen this tour, report an issue or join the feedback group.',
  ],
}
