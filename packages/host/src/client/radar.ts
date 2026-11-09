import { createElement as h, useEffect, useState } from 'react'
import type { ChangeEvent } from 'react'
import { RadarPreviewSchema, RADAR_SOURCES } from '@whalemaid/core'
import type { Locale, RadarPreview, RadarSettings, RadarSource } from '@whalemaid/core'
import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client'
import type { z } from 'zod'
import { PANEL_CHANNEL, PANEL_PREFIX, RadarDetailSchema, RouteResultSchema } from '../panel-api/contract.js'

type Detail = z.infer<typeof RadarDetailSchema>
async function intakeCall(connection: ConnectionHandle, method: string, payload: unknown) {
  const reply = await connection.rpc.call(PANEL_CHANNEL, `${PANEL_PREFIX}/${method}`, payload)
  if (!reply.ok) throw Error(reply.error.code)
  return reply.value
}
const copy = {
  'zh-CN': {
    title: '项目雷达',
    settings: '启用项目雷达',
    dependencies: 'npm / PyPI 直接依赖',
    github: 'GitHub CI、issue 和 PR',
    localGit: '本地 Git（HEAD、分支、未提交改动）',
    cadence: '联网检查间隔（小时）',
    save: '保存',
    preview: '预览观察范围',
    confirm: '确认订阅',
    stop: '关闭此目标的雷达',
    change: '调整观察来源',
    manual: '立即检查',
    hold: '等待你确认外部改动',
    disabled: '项目雷达总开关已关闭。',
    inactive: '目标已结束或授权已失效，观察已停止。',
    githubRepo: 'GitHub 仓库（owner/repo 或地址）',
    configured: '已设置',
    unconfigured: '未设置',
    key: 'GitHub 只读令牌',
    clear: '移除令牌',
    status: '最近检查',
    requests: '请求',
    hits: '304 缓存命中',
    success: '成功',
    error: '操作失败，请重试。',
    noGit: '没有识别到 Git 项目',
    history: '检查记录',
    previewing: '读取观察范围中…',
    check: '检查中…',
    settingsTitle: '项目雷达设置',
    settingsNote: '总开关默认关闭。到目标详情确认订阅后，才会读取选中的外部来源。',
    tokenNote: '留空时匿名访问 GitHub。令牌由 Harness 凭据服务保管。',
  },
  en: {
    title: 'Project Radar',
    settings: 'Enable Project Radar',
    dependencies: 'Direct npm / PyPI dependencies',
    github: 'GitHub CI, issues and PRs',
    localGit: 'Local Git (HEAD, branch and uncommitted changes)',
    cadence: 'Online check interval (hours)',
    save: 'Save',
    preview: 'Preview observations',
    confirm: 'Confirm subscription',
    stop: 'Turn off radar for this goal',
    change: 'Change sources',
    manual: 'Check now',
    hold: 'Review external changes to continue',
    disabled: 'Project Radar is off globally.',
    inactive: 'This goal has ended or its authorization is inactive. Observations are paused.',
    githubRepo: 'GitHub repository (owner/repo or URL)',
    configured: 'Set',
    unconfigured: 'Not set',
    key: 'Read-only GitHub token',
    clear: 'Remove token',
    status: 'Latest checks',
    requests: 'requests',
    hits: '304 cache hits',
    success: 'Passed',
    error: 'Could not complete the operation. Try again.',
    noGit: 'No Git project detected',
    history: 'Check history',
    previewing: 'Reading observation scope…',
    check: 'Checking…',
    settingsTitle: 'Project Radar settings',
    settingsNote:
      'Off by default. Confirm a goal subscription before Radar accesses the selected external sources.',
    tokenNote: 'GitHub access is anonymous without a token. Harness stores the credential.',
  },
} as const

const failures: Record<string, readonly [string, string]> = {
  'github-rate-limited': ['GitHub 达到额度上限', 'GitHub rate limit reached'],
  timeout: ['请求超时', 'Request timed out'],
  'not-json': ['接口未返回 JSON', 'API did not return JSON'],
  'git-unavailable': ['无法读取本地 Git', 'Could not read local Git'],
  'network-failed': ['网络连接失败', 'Network request failed'],
  'invalid-response': ['接口返回格式异常', 'Unexpected API response'],
  'response-too-large': ['接口响应超过大小限制', 'Response exceeded the size limit'],
}
const failureLabel = (locale: Locale, reason: string) =>
  failures[reason]?.[locale === 'zh-CN' ? 0 : 1] ??
  (reason.startsWith('http-') ? 'HTTP ' + reason.slice(5) : copy[locale].error)

export function RadarSettingsView({
  connection,
  locale,
  settings,
}: {
  connection: ConnectionHandle
  locale: Locale
  settings: RadarSettings
}) {
  const c = copy[locale]
  const [draft, setDraft] = useState<RadarSettings>()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)
  const current = draft ?? settings
  const save = async () => {
    setBusy(true)
    try {
      await intakeCall(connection, 'radar-settings', current)
      setError(false)
      setDraft(undefined)
    } catch {
      setError(true)
    } finally {
      setBusy(false)
    }
  }
  return h(
    'details',
    { 'data-radar-settings': '' },
    h('summary', null, c.settingsTitle),
    h('p', null, c.settingsNote),
    checkbox(c.settings, current.enabled, busy, (enabled) => setDraft({ ...current, enabled })),
    ...RADAR_SOURCES.map((source) =>
      checkbox(
        c[source],
        current.sources[source],
        busy,
        (value) => setDraft({ ...current, sources: { ...current.sources, [source]: value } }),
        source,
      ),
    ),
    h(
      'label',
      null,
      c.cadence,
      ' ',
      h('input', {
        type: 'number',
        min: 1,
        max: 168,
        value: current.checkHours,
        disabled: busy,
        onChange: (event: ChangeEvent<HTMLInputElement>) =>
          setDraft({ ...current, checkHours: Number(event.target.value) }),
      }),
    ),
    h(
      'button',
      {
        type: 'button',
        onClick: () => void save(),
        disabled:
          !draft ||
          busy ||
          !Number.isInteger(current.checkHours) ||
          current.checkHours < 1 ||
          current.checkHours > 168,
      },
      c.save,
    ),
    error && h('p', { role: 'alert' }, c.error),
  )
}

function checkbox(
  label: string,
  checked: boolean,
  disabled: boolean,
  change: (value: boolean) => void,
  key = label,
) {
  return h(
    'label',
    { key, style: { display: 'block' } },
    h('input', {
      type: 'checkbox',
      checked,
      disabled,
      onChange: (event: ChangeEvent<HTMLInputElement>) => change(event.target.checked),
    }),
    ' ',
    label,
  )
}

export function GoalRadarView({
  connection,
  locale,
  goalId,
}: {
  connection: ConnectionHandle
  locale: Locale
  goalId: string
}) {
  const c = copy[locale]
  const [detail, setDetail] = useState<Detail>()
  const [preview, setPreview] = useState<RadarPreview>()
  const [repo, setRepo] = useState('')
  const [sources, setSources] = useState<RadarSettings['sources']>({
    dependencies: false,
    localGit: false,
    github: false,
  })
  const [busy, setBusy] = useState('')
  const [error, setError] = useState(false)
  const [showChanges, setShowChanges] = useState(false)
  const [token, setToken] = useState('')
  useEffect(() => {
    let live = true
    let timer: ReturnType<typeof setTimeout>
    const load = async () => {
      try {
        const value = RadarDetailSchema.parse(await intakeCall(connection, 'radar-detail', { goalId }))
        if (live) setDetail(value)
      } catch {
        if (live) setError(true)
      } finally {
        if (live) timer = setTimeout(load, 2500)
      }
    }
    void load()
    return () => {
      live = false
      clearTimeout(timer)
    }
  }, [connection, goalId])
  const perform = async (method: string, action: () => Promise<void>) => {
    setBusy(method)
    try {
      await action()
      setError(false)
    } catch {
      setError(true)
    } finally {
      setBusy('')
    }
  }
  const call = (method: string, body: unknown = {}) =>
    intakeCall(connection, method, { goalId, ...(body as object) })
  const sourceLabel = (source: RadarSource) => c[source]
  const button = (label: string, onClick: () => void, disabled = false, key = label) =>
    h('button', { type: 'button', key, onClick, disabled: !!busy || disabled }, label)
  const previewScope = () =>
    void perform('preview', async () => {
      const value = RadarPreviewSchema.parse(await call('radar-preview'))
      setRepo(detail?.subscription?.repo ?? value.repo ?? '')
      setSources(
        detail?.subscription?.sources ?? {
          dependencies: value.dependencies.length > 0,
          localGit: value.localGit,
          github: !!value.repo,
        },
      )
      setPreview(value)
    })
  const subscribe = (enabled: boolean) =>
    void perform('subscribe', async () => {
      const value = await call('radar-subscribe', {
        enabled,
        token: preview?.token ?? '0'.repeat(64),
        repo,
        sources,
      })
      setDetail(RadarDetailSchema.parse(value))
      setPreview(undefined)
    })
  const credential = (value: string | null) =>
    void perform('credential', async () => {
      await intakeCall(connection, 'radar-credential', { token: value })
      setToken('')
    })
  const latest = RADAR_SOURCES.flatMap((source) => {
    const row = detail?.observations.find((entry) => entry.source === source && !entry.purpose)
    return row ? [row] : []
  })
  return h(
    'section',
    { 'data-goal-radar': '', 'aria-label': c.title },
    h('h3', null, c.title),
    error && h('p', { role: 'alert' }, c.error),
    detail && !detail.eligible && h('p', null, c.inactive),
    detail && !detail.settings.enabled && h('p', null, c.disabled),
    detail && h(RadarSettingsView, { connection, locale, settings: detail.settings }),
    detail?.hold &&
      h(
        'div',
        { 'data-radar-hold': '' },
        h('p', { role: 'status' }, c.hold),
        ...(detail.conflict?.suggestions ?? []).map((option) =>
          button(
            option.label,
            () =>
              void perform('choose', async () => {
                const current = RadarDetailSchema.parse(await call('radar-detail'))
                const latest = current.conflict?.suggestions.find(
                  (suggestion) => suggestion.initiative?.choice === option.initiative?.choice,
                )
                if (!latest || current.hold?.hash !== detail.hold?.hash) {
                  setDetail(current)
                  throw Error('radar-conflict-changed')
                }
                const result = RouteResultSchema.parse(
                  await intakeCall(connection, 'route-suggestion', { suggestionId: latest.id }),
                )
                if (!result.ok) throw Error('choice-failed')
                if (option.initiative?.choice === 'evidence') setShowChanges(true)
                else {
                  setShowChanges(false)
                  setDetail(RadarDetailSchema.parse(await call('radar-detail')))
                }
              }),
            false,
            option.id,
          ),
        ),
        showChanges &&
          h(
            'div',
            null,
            h('code', null, detail.hold.previous, ' → ', detail.hold.head),
            h('ul', null, ...detail.hold.paths.map((path) => h('li', { key: path }, h('code', null, path)))),
          ),
      ),
    detail?.eligible &&
      button(busy === 'preview' ? c.previewing : detail.subscribed ? c.change : c.preview, previewScope),
    detail?.subscribed && button(c.stop, () => subscribe(false)),
    detail?.subscribed &&
      button(
        busy === 'check' ? c.check : c.manual,
        () =>
          void perform('check', async () => {
            setDetail(RadarDetailSchema.parse(await call('radar-check')))
          }),
        !detail.settings.enabled || !detail.eligible,
      ),
    preview &&
      h(
        'fieldset',
        null,
        h('legend', null, c.preview),
        ...RADAR_SOURCES.map((source) =>
          checkbox(
            source === 'dependencies'
              ? `${sourceLabel(source)} (${preview.dependencies.length})`
              : source === 'localGit' && !preview.localGit
                ? c.noGit
                : sourceLabel(source),
            sources[source],
            !!busy || (source === 'localGit' && !preview.localGit),
            (value) => setSources({ ...sources, [source]: value }),
            source,
          ),
        ),
        h(
          'label',
          null,
          c.githubRepo,
          ' ',
          h('input', {
            value: repo,
            placeholder: 'owner/repo',
            maxLength: 240,
            disabled: !!busy,
            onChange: (event: ChangeEvent<HTMLInputElement>) => setRepo(event.target.value),
          }),
        ),
        button(
          c.confirm,
          () => subscribe(true),
          !Object.values(sources).some(Boolean) || (sources.github && !repo.trim()),
        ),
      ),
    detail?.subscription &&
      h(
        'p',
        null,
        RADAR_SOURCES.filter((source) => detail.subscription?.sources[source])
          .map((source) =>
            source === 'github'
              ? detail.subscription?.repo
              : source === 'dependencies'
                ? `${c.dependencies} (${detail.subscription?.dependencies.length})`
                : c.localGit,
          )
          .join(' · '),
      ),
    latest.length > 0 &&
      h(
        'details',
        { open: true },
        h('summary', null, c.status),
        h(
          'ul',
          null,
          ...latest.map((row) =>
            h(
              'li',
              { key: row.id },
              h('strong', null, sourceLabel(row.source)),
              ' · ',
              new Date(row.at).toLocaleString(locale),
              ' · ',
              row.failure ? failureLabel(locale, row.failure) : c.success,
              ' · ',
              row.requests,
              ' ',
              c.requests,
              ' · ',
              row.cacheHits,
              ' ',
              c.hits,
              row.retryAt && ' · ' + new Date(row.retryAt).toLocaleString(locale),
            ),
          ),
        ),
      ),
    detail &&
      h(
        'details',
        null,
        h('summary', null, c.key, ' · ', detail.credentialConfigured ? c.configured : c.unconfigured),
        h('p', null, c.tokenNote),
        h('input', {
          type: 'password',
          autoComplete: 'new-password',
          'aria-label': c.key,
          value: token,
          disabled: !!busy,
          onChange: (event: ChangeEvent<HTMLInputElement>) => setToken(event.target.value),
        }),
        button(c.save, () => credential(token.trim()), !token.trim()),
        button(c.clear, () => credential(null), !detail.credentialConfigured),
      ),
  )
}
