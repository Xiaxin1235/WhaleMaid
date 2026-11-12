import type { Locale } from './i18n/index.js'

/**
 * The welcome dialog shows once per release listed here. When a release has
 * notable changes, bump this value and replace the notes alongside CHANGELOG.
 * Leave it unchanged for a release that needs no announcement.
 */
export const WELCOME_RELEASE = '1.6.0'

/** Short what's-new notes for WELCOME_RELEASE, three to five lines each. */
export const WELCOME_NOTES: Record<Locale, readonly string[]> = {
  'zh-CN': [
    '新增实验功能「宅邸」。默认关闭，可在设置 → WhaleMaid 或主动性卡片旁开启。',
    '每个目标是一间房，任务进度体现在房间摆件里。可以从房间直接打开目标、决定和建议。',
    '开启「桌宠走进宅邸」后，桌面上的大肥鱼会走进宅邸活动；关闭时她留在桌面。',
    '欢迎在 QQ 群 1001092170 或 GitHub Issues 反馈宅邸体验。',
  ],
  en: [
    'The experimental Mansion is off by default. Enable it in Settings → WhaleMaid or next to the Initiative card.',
    'Each goal has a room, and its furnishings show task progress. Open goals, decisions, and suggestions from the room.',
    'Turn on Pet visits the mansion and Da Fei Yu steps from your desktop into the mansion; turn it off and she stays on the desktop.',
    'Share feedback about the mansion in QQ group 1001092170 or on GitHub Issues.',
  ],
}
