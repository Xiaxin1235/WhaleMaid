import type { Locale } from './index.js'
const zh = {
  enabled: '自动归档以往的大肥鱼对话',
  count: (n: number) => `以往的大肥鱼对话：${n} 条（已归档）`,
  restoreAll: '全部恢复到列表',
  restore: '恢复到列表',
  confirm: '确定恢复以往的大肥鱼对话到 Harness 列表？不会删除或改写聊天内容。',
  hint: '归档只隐藏列表，内容保留。旧对话若仍在桌宠列表中，需先在这里恢复才能继续聊天。若希望一直保留在列表，请关闭自动归档；下次启动仍按开关整理。',
  unavailable: '归档服务暂不可用，当前对话仍可使用。',
}
const en: typeof zh = {
  enabled: 'Automatically archive earlier companion conversations',
  count: (n) => `Earlier companion conversations: ${n} archived`,
  restoreAll: 'Restore all to list',
  restore: 'Restore to list',
  confirm:
    'Restore earlier companion conversations to the Harness list? No conversation content will be deleted or rewritten.',
  hint: 'Archiving hides list entries and retains their content. Earlier chats may remain in the pet list; restore them here before chatting. Turn off automatic archiving to keep them listed after the next startup.',
  unavailable: 'Archive service is unavailable; the current conversation remains usable.',
}
/** Owner-facing archive controls; no companion tool or model authority is added. */
export const archiveCopy = (locale: Locale) => (locale === 'zh-CN' ? zh : en)
