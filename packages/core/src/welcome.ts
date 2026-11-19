import type { Locale } from './i18n/index.js'

/**
 * The welcome dialog shows once per release listed here. When a release has
 * notable changes, bump this value and replace the notes alongside CHANGELOG.
 * Leave it unchanged for a release that needs no announcement.
 */
export const WELCOME_RELEASE = '1.6.8'

/** Short what's-new notes for WELCOME_RELEASE, three to five lines each. */
export const WELCOME_NOTES: Record<Locale, readonly string[]> = {
  'zh-CN': [
    '修复桌宠右键菜单的设置保存，界面样式和陪伴模式会写入当前桌宠的配置。',
    '在 Harness 中修改的桌宠大小和气泡时长会保存，重启后自动恢复。',
    'WhaleMaid 完整包已内置 Coopanion 0.6.6，可随完整包一起更新。',
  ],
  en: [
    'The desktop pet menu saves interface style and companionship mode to the active configuration entry.',
    'Size and bubble duration changes made in Harness settings are restored after a restart.',
    'The WhaleMaid complete package includes Coopanion 0.6.6 and updates it automatically.',
  ],
}
