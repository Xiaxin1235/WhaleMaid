import type { Locale } from './i18n/index.js'

/**
 * The welcome dialog shows once per release listed here. When a release has
 * notable changes, bump this value and replace the notes alongside CHANGELOG.
 * Leave it unchanged for a release that needs no announcement.
 */
export const WELCOME_RELEASE = '1.5.0'

/** Short what's-new notes for WELCOME_RELEASE, three to five lines each. */
export const WELCOME_NOTES: Record<Locale, readonly string[]> = {
  'zh-CN': [
    '现在会主动给建议卡，通知中心和桌宠信封都能处理。建议卡默认开启，可在 WhaleMaid → 主动性 一键关闭。',
    '建议附带证据。采纳只读排查建议会生成草案，仍由你审核授权。',
    '项目雷达默认关闭。开启总开关后，在目标详情预览并确认要观察的来源。',
    '雷达检查直接依赖、本地 Git 和 GitHub。外部冲突会暂停相关目标的新执行，等你处理。',
  ],
  en: [
    'Proactive suggestion cards appear in the notification center and pet envelope. They are on by default and can be turned off under WhaleMaid → Initiative.',
    'Suggestions link to evidence. A read-only investigation creates a draft for your review and authorization.',
    'Project Radar is off by default. Enable it globally, then review and confirm sources in a goal’s details.',
    'Radar checks direct dependencies, local Git and GitHub. External conflicts hold new runs for the affected goal until you respond.',
  ],
}
