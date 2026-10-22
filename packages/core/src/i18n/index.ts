export type Locale = 'zh-CN' | 'en'
export type LanguageSetting = 'auto' | Locale

export const en = {
  subtitle: 'A long-term goal, within the scope you confirm.',
  status: 'Status',
  version: 'Plugin version',
  startedAt: 'Started',
  dataDir: 'Data directory',
  dependencies: 'Dependencies',
  available: 'Available',
  unavailable: 'Service unavailable',
  pet: 'Whale desktop pet',
  petDetected: 'dsh-coopanion detected',
  petMissing: 'Not installed',
  petLink: 'Get dsh-coopanion',
  language: 'Language',
  auto: 'Follow DSH',
  goals: 'Goals',
  emptyGoals:
    'No goals yet. Later, describe a long-term goal here and WhaleDot will advance it within the scope you confirm.',
  createGoal: 'Create goal',
  globalSwitch: 'Global control',
  pauseAll: 'Pause all autonomous execution',
  store: 'Storage',
  storeOk: 'Available',
  storeReadOnly: 'Another DSH is using WhaleDot data',
  takeoverStore: 'I confirm no other DSH is running; take over WhaleDot data',
  storeError: 'Storage unavailable',
  storeRecords: 'Record integrity',
  corruptRows: 'Corrupt records: {count}',
  afterP07: 'Available in P07',
  loading: 'Loading…',
  refresh: 'Refresh',
  requestFailed: 'Request failed ({code}).',
  saving: 'Saving…',
} as const

export type MessageKey = keyof typeof en
export const zhCN: Record<MessageKey, string> = {
  subtitle: '在你确认的范围内，推进长期目标。',
  status: '状态',
  version: '插件版本',
  startedAt: '启动时间',
  dataDir: '数据目录',
  dependencies: '依赖服务',
  available: '可用',
  unavailable: '服务不可用',
  pet: '鲸鱼桌宠',
  petDetected: '已检测到 dsh-coopanion',
  petMissing: '未安装',
  petLink: '获取 dsh-coopanion',
  language: '语言',
  auto: '跟随 DSH',
  goals: '目标列表',
  emptyGoals: '还没有目标。之后可以在这里描述一个长期目标，WhaleDot 会在你确认的范围内推进。',
  createGoal: '创建目标',
  globalSwitch: '全局开关',
  pauseAll: '暂停所有自主执行',
  store: '存储状态',
  storeOk: '可用',
  storeReadOnly: '另一个 DSH 正在使用 WhaleDot 数据',
  takeoverStore: '我确认没有其他 DSH 正在运行，接管 WhaleDot 数据',
  storeError: '存储不可用',
  storeRecords: '记录完整性',
  corruptRows: '损坏记录 {count} 条',
  afterP07: 'P07 实现',
  loading: '正在加载…',
  refresh: '刷新',
  requestFailed: '请求失败（{code}）。',
  saving: '正在保存…',
}

export const messages = { 'zh-CN': zhCN, en }

export function resolveLocale(setting: LanguageSetting, hostLocale?: string): Locale {
  if (setting !== 'auto') return setting
  if (hostLocale === 'zh' || hostLocale?.toLowerCase() === 'zh-cn') return 'zh-CN'
  return 'en'
}

export function t(locale: Locale, key: MessageKey, params: Record<string, string | number> = {}): string {
  return messages[locale][key].replace(/\{(\w+)\}/g, (token, name: string) =>
    Object.hasOwn(params, name) ? String(params[name]) : token,
  )
}
