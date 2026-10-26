import { AutopilotView } from './autopilot.js'
import { VerificationView } from './verification.js'
import { createElement as h, useEffect, useRef, useState } from 'react'
import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client'
import {
  t,
  executionReason,
  classifyCommand,
  DEFAULT_LIMITS,
  DEFAULT_PROTECTED_NAMES,
  DEFAULT_INTAKE_ACTIONS,
  IntakeActionSchema,
  ConfirmedGoalFormSchema,
  draftToRecords,
  fixedClock,
  sequenceIdGen,
  scopePathSeparator,
} from '@whalemaid/core'
import type { ConfirmedGoalForm, GoalDraft, Locale, MessageKey } from '@whalemaid/core'
import {
  ExecuteResultSchema,
  ConfirmResultSchema,
  DraftStartedSchema,
  DraftStatusSchema,
  ProjectFactsSchema,
  GoalDetailSchema,
  PANEL_CHANNEL,
  PANEL_PREFIX,
} from '../panel-api/contract.js'
import type { z } from 'zod'

type Facts = z.infer<typeof ProjectFactsSchema>
type Detail = z.infer<typeof GoalDetailSchema>
type Command = { text: string; selected: boolean }
/** Use the existing owner-authenticated Connection channel; callers validate each response. */
export async function intakeCall(
  connection: ConnectionHandle,
  method: string,
  payload: unknown,
  signal?: AbortSignal,
): Promise<unknown> {
  const reply = await connection.rpc.call(PANEL_CHANNEL, `${PANEL_PREFIX}/${method}`, payload, signal)
  if (!reply.ok) throw new Error(reply.error.code)
  return reply.value
}
const pathAt = (root: string, leaf: string) =>
  `${root.replace(/[\\/]$/, '')}${scopePathSeparator(root)}${leaf}`
const lines = (value: string) => value.split('\n')
const actions: Record<string, MessageKey> = {
  'read-file': 'actionRead',
  'continue-goal': 'actionContinue',
  'pause-goal': 'actionPause',
  'resume-goal': 'actionResume',
  'open-workbench': 'actionOpen',
  'write-file': 'actionWrite',
  'run-command': 'actionCommand',
  git: 'actionGit',
}
const kinds: Record<string, MessageKey> = {
  analyze: 'kindAnalyze',
  edit: 'kindEdit',
  test: 'kindTest',
  doc: 'kindDoc',
  research: 'kindResearch',
}
const limitLabels: Record<keyof typeof DEFAULT_LIMITS, MessageKey> = {
  maxFixRounds: 'limitFix',
  maxStallRounds: 'limitStall',
  maxConcurrentWritePerProject: 'limitWriters',
  maxChangedFilesPerTask: 'limitFiles',
  maxRunMinutes: 'limitMinutes',
  maxRunsPerDay: 'limitRuns',
  plannerCallsPerDay: 'limitPlannerCalls',
}

/** Editable proposal and a separate second confirmation; only that final action writes records. */
export function IntakeView({
  connection,
  locale,
  onCancel,
  onCreated,
  initialDraftId,
  existing,
}: {
  connection: ConnectionHandle
  locale: Locale
  onCancel(): void
  onCreated(id: string): void
  initialDraftId?: string | undefined
  existing?: Detail | undefined
}) {
  const text = (key: MessageKey) => t(locale, key)
  const [description, setDescription] = useState(''),
    [root, setRoot] = useState('')
  const [form, setForm] = useState<ConfirmedGoalForm>(),
    [facts, setFacts] = useState<Facts>()
  const [commands, setCommands] = useState<Command[]>([]),
    [draftId, setDraftId] = useState<string | undefined>(initialDraftId)
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [approving, setApproving] = useState(false)
  const [riskOpen, setRiskOpen] = useState(false)
  const [authorizationVersion, setAuthorizationVersion] = useState(existing?.activeScope?.hash)
  const alertRef = useRef<HTMLParagraphElement>(null)
  // The form is long and the buttons sit at the bottom; bring a new error into view.
  useEffect(() => {
    if (error) alertRef.current?.scrollIntoView({ block: 'center' })
  }, [error])
  function edit(patch: Partial<ConfirmedGoalForm>) {
    setForm((previous) => previous && { ...previous, ...patch })
    setApproving(false)
  }
  function fill(next: Facts, draft?: GoalDraft, id?: string) {
    setFacts(next)
    const initialTasks = draft?.initialTasks ?? [
      { title: text('taskAnalyze'), kind: 'analyze' as const, dependsOnIndex: [] },
    ]
    setForm({
      title: draft?.title ?? '',
      objective: draft?.objective ?? description,
      expectedOutcome: draft?.expectedOutcome ?? '',
      acceptance: draft?.acceptance ?? [],
      stopConditions: draft?.stopConditions ?? [],
      mode: draft?.mode ?? 'autonomous',
      initialTasks,
      projectRoot: next.projectRoot,
      allowedPaths: [next.projectRoot],
      protectedPaths: [
        pathAt(next.projectRoot, '.git'),
        pathAt(next.projectRoot, '.env*'),
        ...(draft?.proposedProtectedPaths ?? []).map((path) =>
          /^[a-z]:[\\/]|^\//i.test(path) ? path : pathAt(next.projectRoot, path),
        ),
      ],
      protectedNames: [...DEFAULT_PROTECTED_NAMES],
      permissionPreset: 'read-only',
      commandMode: 'confirmed',
      allowedActions: [...DEFAULT_INTAKE_ACTIONS],
      verifyCommands: [],
      limits: { ...DEFAULT_LIMITS },
      limitsExpandedConfirmed: false,
      confirm: true,
      ...(id ? { draftId: id } : {}),
    })
    setCommands(
      [
        ...new Set([
          ...next.candidateCommands.map((item) => item.command),
          ...(draft?.proposedVerifyCommands ?? []),
        ]),
      ].map((value) => ({ text: value, selected: false })),
    )
  }
  useEffect(() => {
    if (!existing?.activeScope) return
    const scope = existing.activeScope,
      goal = existing.goal
    setAuthorizationVersion(scope.hash)
    setForm({
      title: goal.title,
      objective: goal.objective,
      expectedOutcome: goal.expectedOutcome,
      acceptance: goal.acceptance,
      stopConditions: goal.stopConditions,
      mode: goal.mode,
      initialTasks: [{ title: text('taskAnalyze'), kind: 'analyze', dependsOnIndex: [] }],
      projectRoot: goal.projectRoot,
      allowedPaths: scope.allowedPaths,
      protectedPaths: scope.protectedPaths,
      protectedNames: scope.protectedNames,
      allowedActions: scope.allowedActions.filter(
        (action): action is ConfirmedGoalForm['allowedActions'][number] =>
          IntakeActionSchema.safeParse(action).success,
      ),
      permissionPreset: scope.permissionPreset,
      commandMode: scope.commandMode,
      ...(scope.commandMode === 'trusted' ? { trustedConfirmed: true as const } : {}),
      verifyCommands: scope.verifyCommands,
      limits: scope.limits,
      limitsExpandedConfirmed: true,
      confirm: true,
    })
    setCommands(scope.verifyCommands.map((command) => ({ text: command, selected: true })))
    void intakeCall(connection, 'project-facts', { projectRoot: goal.projectRoot })
      .then((value) => setFacts(ProjectFactsSchema.parse(value)))
      .catch((error) => setError(String(error)))
  }, [connection, existing?.goal.id])
  useEffect(() => {
    if (!draftId) return
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout>
    async function poll() {
      try {
        const value = DraftStatusSchema.parse(
          await intakeCall(connection, 'draft-status', { draftId }, controller.signal),
        )
        if (controller.signal.aborted) return
        if (value.state === 'ready' && value.draft && value.projectFacts) {
          fill(value.projectFacts, value.draft, draftId)
          setDraftId(undefined)
          setBusy(false)
        } else if (value.state === 'failed') {
          setError(value.error ?? 'model-call-failed')
          if (value.projectFacts) setFacts(value.projectFacts)
          setDraftId(undefined)
          setBusy(false)
        } else timer = setTimeout(poll, 700)
      } catch (error) {
        if (!controller.signal.aborted) {
          setError(String(error))
          setBusy(false)
          setDraftId(undefined)
        }
      }
    }
    void poll()
    return () => {
      controller.abort()
      clearTimeout(timer)
    }
    // fill only consumes the current draft job's input; edits are unavailable while it runs.
  }, [connection, draftId])
  async function start(manual: boolean) {
    setBusy(true)
    setError('')
    try {
      if (manual) {
        const value = ProjectFactsSchema.parse(
          await intakeCall(connection, 'project-facts', { projectRoot: root }),
        )
        fill(value)
        setBusy(false)
      } else {
        const value = DraftStartedSchema.parse(
          await intakeCall(connection, 'draft-goal', { text: description, projectRoot: root, locale }),
        )
        setDraftId(value.draftId)
      }
    } catch (error) {
      setError(String(error))
      setBusy(false)
    }
  }

  async function recheckProject() {
    if (!form) return
    setBusy(true)
    try {
      const next = ProjectFactsSchema.parse(
        await intakeCall(connection, 'project-facts', { projectRoot: form.projectRoot }),
      )
      setFacts(next)
      edit({
        projectRoot: next.projectRoot,
        allowedPaths: [next.projectRoot],
        protectedPaths: [pathAt(next.projectRoot, '.git'), pathAt(next.projectRoot, '.env*')],
        permissionPreset: 'read-only',
        commandMode: 'confirmed',
        trustedConfirmed: undefined,
      })
      setError('')
    } catch (error) {
      setError(String(error))
    } finally {
      setBusy(false)
    }
  }
  async function cancel() {
    if (draftId) await intakeCall(connection, 'cancel-draft', { draftId }).catch(() => {})
    setDraftId(undefined)
    setBusy(false)
    onCancel()
  }
  const selected = commands
    .filter(
      (command) =>
        command.selected && classifyCommand(command.text, form?.projectRoot ?? root).class !== 'forbidden',
    )
    .map((command) => command.text)
  const parsed = form && ConfirmedGoalFormSchema.safeParse({ ...form, verifyCommands: selected })
  const preview = parsed?.success
    ? draftToRecords(undefined, parsed.data, { clock: fixedClock(0), idGen: sequenceIdGen() })
    : undefined
  async function confirm() {
    if (!parsed?.success) {
      setError(
        parsed && !parsed.success
          ? parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ')
          : text('invalidForm'),
      )
      return
    }
    if (!approving) {
      setApproving(true)
      return
    }
    setBusy(true)
    try {
      if (existing?.activeScope) {
        const result = GoalDetailSchema.parse(
          await intakeCall(connection, 'reauthorize-goal', {
            ...parsed.data,
            goalId: existing.goal.id,
            scopeHash: authorizationVersion,
          }),
        )
        onCreated(result.goal.id)
      } else {
        const result = ConfirmResultSchema.parse(await intakeCall(connection, 'confirm-goal', parsed.data))
        onCreated(result.goal.id)
      }
    } catch (error) {
      setError(String(error))
      setApproving(false)
    } finally {
      setBusy(false)
    }
  }
  function field(label: string, value: string, update: (value: string) => void, multiline = false) {
    return h(
      'label',
      { className: 'whaledot-field' },
      label,
      h(multiline ? 'textarea' : 'input', {
        value,
        disabled: busy || approving,
        onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
          update(event.target.value),
      }),
    )
  }
  function group(label: MessageKey, ...children: React.ReactNode[]) {
    return h('fieldset', { disabled: busy || approving }, h('legend', null, text(label)), ...children)
  }
  return h(
    'section',
    { className: 'whaledot-intake' },
    h('h2', null, text(existing ? 'reauthorizeScope' : 'createGoal')),
    error &&
      h(
        'p',
        { role: 'alert', ref: alertRef },
        text('draftError'),
        ' ',
        error.includes('model-not-configured') ? text('modelNotConfigured') : error,
        ' ',
        text('manualAvailable'),
      ),
    !form
      ? h(
          'div',
          null,
          field(text('goalDescription'), description, setDescription, true),
          field(text('projectRoot'), root, setRoot),
          h(
            'button',
            {
              disabled: busy || !root || !description,
              onClick: () => {
                void start(false)
              },
            },
            text('generateDraft'),
          ),
          h(
            'button',
            {
              disabled: busy || !root,
              onClick: () => {
                void start(true)
              },
            },
            text('manualEntry'),
          ),
          busy && h('p', { role: 'status' }, text('generatingDraft')),
        )
      : h(
          'div',
          null,
          h(
            'p',
            { className: 'whaledot-summary' },
            t(locale, 'authorizationSummary', {
              path: form.projectRoot,
              permission: text(form.permissionPreset === 'read-only' ? 'readOnly' : 'workspaceWrite'),
              count: form.limits.maxRunsPerDay,
              commands: selected.join('; ') || text('none'),
              mode: text(form.commandMode === 'trusted' ? 'commandTrusted' : 'commandConfirmed'),
            }),
          ),
          approving &&
            h('p', { role: 'alert' }, text(existing ? 'secondReauthorization' : 'secondConfirmation')),
          !existing &&
            group(
              'goalInformation',
              field(text('goalTitle'), form.title, (title) => edit({ title })),
              field(text('objective'), form.objective, (objective) => edit({ objective }), true),
              field(
                text('expectedOutcome'),
                form.expectedOutcome,
                (expectedOutcome) => edit({ expectedOutcome }),
                true,
              ),
              field(
                text('acceptance'),
                form.acceptance.join('\n'),
                (value) => edit({ acceptance: lines(value) }),
                true,
              ),
              field(
                text('stopConditions'),
                form.stopConditions.join('\n'),
                (value) => edit({ stopConditions: lines(value) }),
                true,
              ),
              h(
                'label',
                null,
                text('goalMode'),
                h(
                  'select',
                  {
                    value: form.mode,
                    onChange: (e: React.ChangeEvent<HTMLSelectElement>) =>
                      edit({ mode: e.target.value as ConfirmedGoalForm['mode'] }),
                  },
                  ...(['suggest', 'autonomous', 'high'] as const).map((mode) =>
                    h('option', { key: mode, value: mode }, text(mode)),
                  ),
                ),
              ),
            ),
          group(
            'projectScope',
            !existing && field(text('projectRoot'), form.projectRoot, (projectRoot) => edit({ projectRoot })),
            h(
              'button',
              {
                onClick: () => {
                  void recheckProject()
                },
              },
              text('recheckProject'),
            ),
            h(
              'p',
              null,
              !facts
                ? text('loading')
                : facts.isGit
                  ? `${text('gitProject')}: ${facts.branch ?? text('none')}; ${text(facts.clean ? 'cleanWorkspace' : 'dirtyWorkspace')}`
                  : text('nonGitReadOnly'),
            ),
            field(
              text('allowedPaths'),
              form.allowedPaths.join('\n'),
              (value) => edit({ allowedPaths: lines(value) }),
              true,
            ),
            field(
              text('protectedPaths'),
              form.protectedPaths.join('\n'),
              (value) => edit({ protectedPaths: lines(value) }),
              true,
            ),
            h('p', null, `${text('defaultProtectedNames')}: ${DEFAULT_PROTECTED_NAMES.join(', ')}`),
            field(
              text('protectedNames'),
              form.protectedNames
                .filter((name) => !DEFAULT_PROTECTED_NAMES.some((item) => item === name))
                .join('\n'),
              (value) =>
                edit({ protectedNames: [...DEFAULT_PROTECTED_NAMES, ...lines(value).filter(Boolean)] }),
              true,
            ),
            h(
              'label',
              null,
              text('permissionPreset'),
              h(
                'select',
                {
                  value: form.permissionPreset,
                  onChange: (e: React.ChangeEvent<HTMLSelectElement>) =>
                    edit({
                      permissionPreset: e.target.value as ConfirmedGoalForm['permissionPreset'],
                      commandMode: 'confirmed',
                      trustedConfirmed: undefined,
                    }),
                },
                h('option', { value: 'read-only' }, text('readOnly')),
                h(
                  'option',
                  {
                    value: 'workspace-write',
                    disabled: !facts?.isGit || facts.projectRoot !== form.projectRoot,
                  },
                  text('workspaceWrite'),
                ),
              ),
            ),
            h(
              'label',
              { className: 'whaledot-check' },
              h('input', {
                type: 'checkbox',
                checked: form.commandMode === 'trusted',
                disabled: form.permissionPreset !== 'workspace-write',
                onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
                  if (e.target.checked) setRiskOpen(true)
                  else edit({ commandMode: 'confirmed', trustedConfirmed: undefined })
                },
              }),
              text('enableTrusted'),
            ),
            riskOpen &&
              h(
                'div',
                { role: 'dialog', 'aria-label': text('enableTrusted') },
                h('p', { style: { whiteSpace: 'pre-wrap' } }, text('trustedRisk')),
                h(
                  'button',
                  {
                    onClick: () => {
                      edit({ commandMode: 'trusted', trustedConfirmed: true })
                      setRiskOpen(false)
                    },
                  },
                  text('confirmTrusted'),
                ),
                h('button', { onClick: () => setRiskOpen(false) }, text('cancel')),
              ),
            ...IntakeActionSchema.options.map((action) =>
              h(
                'label',
                { key: action, className: 'whaledot-check' },
                h('input', {
                  type: 'checkbox',
                  checked: form.allowedActions.includes(action),
                  onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
                    edit({
                      allowedActions: e.target.checked
                        ? [...form.allowedActions, action]
                        : form.allowedActions.filter((item) => item !== action),
                    }),
                }),
                text(actions[action]!),
              ),
            ),
          ),
          group(
            'verifyCommands',
            h('p', null, text('commandsUnchecked')),
            ...commands.map((command, index) => {
              const classification = classifyCommand(command.text, form?.projectRoot ?? root)
              return h(
                'div',
                { key: index, className: 'whaledot-command' },
                h('input', {
                  type: 'checkbox',
                  'aria-label': `${text('selectCommand')} ${index + 1}`,
                  checked: command.selected && classification.class !== 'forbidden',
                  disabled: classification.class === 'forbidden',
                  onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
                    setCommands(
                      commands.map((value, i) =>
                        i === index ? { ...value, selected: e.target.checked } : value,
                      ),
                    )
                    setApproving(false)
                  },
                }),
                field(`${text('command')} ${index + 1}`, command.text, (value) => {
                  setCommands(
                    commands.map((item, i) => (i === index ? { text: value, selected: false } : item)),
                  )
                  setApproving(false)
                }),
                h(
                  'small',
                  null,
                  text(
                    classification.class === 'safe'
                      ? 'classSafe'
                      : classification.class === 'forbidden'
                        ? 'classForbidden'
                        : 'classApproval',
                  ),
                  ' ',
                  classification.reasons.join(', '),
                ),
              )
            }),
            h(
              'button',
              { onClick: () => setCommands([...commands, { text: '', selected: false }]) },
              text('addCommand'),
            ),
          ),
          group(
            'executionLimits',
            ...Object.keys(DEFAULT_LIMITS).map((name) => {
              const key = name as keyof typeof DEFAULT_LIMITS
              return h(
                'label',
                { key, className: 'whaledot-field' },
                text(limitLabels[key]),
                h('input', {
                  type: 'number',
                  value: form.limits[key],
                  onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
                    edit({
                      limits: { ...form.limits, [key]: Number(e.target.value) },
                      limitsExpandedConfirmed: false,
                    }),
                }),
              )
            }),
            Object.keys(DEFAULT_LIMITS).some(
              (name) =>
                form.limits[name as keyof typeof DEFAULT_LIMITS] >
                DEFAULT_LIMITS[name as keyof typeof DEFAULT_LIMITS],
            ) &&
              h(
                'label',
                null,
                h('input', {
                  type: 'checkbox',
                  checked: form.limitsExpandedConfirmed,
                  onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
                    edit({ limitsExpandedConfirmed: e.target.checked }),
                }),
                text('confirmHigherLimits'),
              ),
          ),
          !existing &&
            group(
              'initialTasks',
              ...form.initialTasks.map((task, index) =>
                h(
                  'div',
                  { key: index, className: 'whaledot-task-editor' },
                  h('strong', null, `${text('task')} ${index + 1}`),
                  field(text('taskTitle'), task.title, (title) =>
                    edit({
                      initialTasks: form.initialTasks.map((item, i) =>
                        i === index ? { ...item, title } : item,
                      ),
                    }),
                  ),
                  h(
                    'label',
                    null,
                    text('taskKind'),
                    h(
                      'select',
                      {
                        value: task.kind,
                        disabled: index === 0,
                        onChange: (e: React.ChangeEvent<HTMLSelectElement>) =>
                          edit({
                            initialTasks: form.initialTasks.map((item, i) =>
                              i === index ? { ...item, kind: e.target.value as typeof task.kind } : item,
                            ),
                          }),
                      },
                      ...Object.entries(kinds).map(([kind, key]) =>
                        h('option', { key: kind, value: kind }, text(key)),
                      ),
                    ),
                  ),
                  field(
                    text('taskDependencies'),
                    task.dependsOnIndex.map((id) => id + 1).join(','),
                    (value) =>
                      edit({
                        initialTasks: form.initialTasks.map((item, i) =>
                          i === index
                            ? {
                                ...item,
                                dependsOnIndex: value.trim()
                                  ? value.split(',').map((id) => Number(id.trim()) - 1)
                                  : [],
                              }
                            : item,
                        ),
                      }),
                  ),
                  h(
                    'small',
                    null,
                    `${text('taskDependencies')}: ${task.dependsOnIndex.map((id) => `${id + 1}. ${form.initialTasks[id]?.title ?? '?'}`).join(' → ') || text('none')}`,
                  ),
                  h(
                    'button',
                    {
                      disabled: form.initialTasks.length <= 1,
                      onClick: () =>
                        edit({
                          initialTasks: form.initialTasks
                            .filter((_, i) => i !== index)
                            .map((item) => ({
                              ...item,
                              dependsOnIndex: item.dependsOnIndex
                                .filter((id) => id !== index)
                                .map((id) => (id > index ? id - 1 : id)),
                            })),
                        }),
                    },
                    text('removeTask'),
                  ),
                  h(
                    'button',
                    {
                      disabled: index <= 1,
                      onClick: () => {
                        const tasks = [...form.initialTasks]
                        ;[tasks[index - 1], tasks[index]] = [tasks[index]!, tasks[index - 1]!]
                        edit({
                          initialTasks: tasks.map((item) => ({
                            ...item,
                            dependsOnIndex: item.dependsOnIndex.map((id) =>
                              id === index ? index - 1 : id === index - 1 ? index : id,
                            ),
                          })),
                        })
                      },
                    },
                    text('moveUp'),
                  ),
                ),
              ),
              h(
                'button',
                {
                  disabled: form.initialTasks.length >= 5,
                  onClick: () =>
                    edit({
                      initialTasks: [
                        ...form.initialTasks,
                        { title: '', kind: 'analyze', dependsOnIndex: [] },
                      ],
                    }),
                },
                text('addTask'),
              ),
            ),
          preview &&
            preview.rejected.length > 0 &&
            h(
              'p',
              { role: 'alert' },
              text('rejectedTasks'),
              ': ',
              preview.rejected.map((item) => `${item.task.title} (${item.reason})`).join('; '),
            ),
          !parsed?.success && h('p', { role: 'status' }, text('invalidForm')),
          h(
            'button',
            {
              disabled: busy,
              onClick: () => {
                void confirm()
              },
            },
            text(approving ? (existing ? 'finalReauthorize' : 'finalConfirm') : 'confirmAuthorization'),
          ),
          approving &&
            h('button', { disabled: busy, onClick: () => setApproving(false) }, text('backToEdit')),
        ),
    h(
      'button',
      {
        disabled: busy && !draftId,
        onClick: () => {
          void cancel()
        },
      },
      text('cancel'),
    ),
  )
}

/** Display persisted values, including revoked grants; all controls reuse the owner-authenticated API. */
export function GoalDetailView({
  connection,
  locale,
  goalId,
  onBack,
  onOpenSession,
}: {
  connection: ConnectionHandle
  locale: Locale
  goalId: string
  onBack(): void
  onOpenSession(id: string): void
}) {
  const [detail, setDetail] = useState<Detail>(),
    [error, setError] = useState(''),
    [saving, setSaving] = useState(false)
  const [reauthorizing, setReauthorizing] = useState(false)
  const text = (key: MessageKey) => t(locale, key)
  useEffect(() => {
    let disposed = false
    const refresh = () =>
      intakeCall(connection, 'goal-detail', { goalId })
        .then((value) => {
          if (!disposed) setDetail(GoalDetailSchema.parse(value))
        })
        .catch((error) => {
          if (!disposed) setError(String(error))
        })
    void refresh()
    const timer = setInterval(() => {
      void refresh()
    }, 2000)
    return () => {
      disposed = true
      clearInterval(timer)
    }
  }, [connection, goalId])
  async function write(method: string, payload: unknown) {
    setSaving(true)
    try {
      const result = await intakeCall(connection, method, payload)
      if (method === 'execute-next') {
        const execution = ExecuteResultSchema.parse(result)
        if (!execution.started)
          throw new Error(
            t(locale, 'executionBlocked', { reason: executionReason(locale, execution.reason) }),
          )
      }
      setDetail(GoalDetailSchema.parse(await intakeCall(connection, 'goal-detail', { goalId })))
      setError('')
    } catch (error) {
      setError(String(error))
    } finally {
      setSaving(false)
    }
  }
  const scope = detail?.scope
  if (reauthorizing && detail)
    return h(IntakeView, {
      connection,
      locale,
      existing: detail,
      onCancel: () => setReauthorizing(false),
      onCreated: () => {
        setReauthorizing(false)
        void write('goal-detail', { goalId })
      },
    })
  return h(
    'section',
    { className: 'whaledot-detail' },
    h('button', { onClick: onBack }, text('backToGoals')),
    error && h('p', { role: 'alert' }, error),
    !detail
      ? h('p', null, text('loading'))
      : h(
          'div',
          null,
          h('h2', null, detail.goal.title),
          detail.goal.inboxSessionId &&
            h(
              'button',
              { onClick: () => onOpenSession(detail.goal.inboxSessionId!) },
              text('openInboxSession'),
            ),
          h(AutopilotView, {
            detail,
            locale,
            saving,
            write,
            call: (method: string, input: unknown) => intakeCall(connection, method, input),
          }),
          h('p', null, detail.goal.objective),
          h('p', null, detail.goal.expectedOutcome),
          h('p', null, text('projectRoot'), ': ', detail.goal.projectRoot),
          h('p', null, text('goalState'), ': ', detail.goal.status),
          h('h3', null, text('acceptance')),
          h('ul', null, ...detail.goal.acceptance.map((value, i) => h('li', { key: i }, value))),
          h('h3', null, text('stopConditions')),
          h('ul', null, ...detail.goal.stopConditions.map((value, i) => h('li', { key: i }, value))),
          h(
            'button',
            {
              disabled: saving,
              onClick: () => {
                void write('set-goal-paused', { goalId, paused: detail.goal.status !== 'paused' })
              },
            },
            text(detail.goal.status === 'paused' ? 'resumeGoal' : 'pauseGoal'),
          ),
          h(
            'button',
            {
              disabled:
                saving ||
                !detail.activeScope ||
                detail.goal.status !== 'active' ||
                detail.runs.some((run) => run.status === 'running'),
              onClick: () => {
                void write('execute-next', { goalId })
              },
            },
            text('executeNext'),
          ),
          h('h3', null, text('runHistory')),
          h(
            'table',
            null,
            h(
              'thead',
              null,
              h(
                'tr',
                null,
                ...[
                  text('task'),
                  text('status'),
                  text('sessionLink'),
                  text('elapsed'),
                  text('permissionPreset'),
                  text('toolCalls'),
                  text('deniedCalls'),
                ].map((label) => h('th', { key: label }, label)),
              ),
            ),
            h(
              'tbody',
              null,
              ...detail.runs.map((run) =>
                h(
                  'tr',
                  { key: run.run_id },
                  h('td', null, detail.tasks.find((task) => task.id === run.taskId)?.title),
                  h('td', null, `${run.status} · ${executionReason(locale, run.reason ?? '')}`),
                  h(
                    'td',
                    null,
                    h(
                      'button',
                      { onClick: () => onOpenSession(run.sessionId), title: text('sessionLink') },
                      run.sessionId.slice(0, 8),
                    ),
                  ),
                  h(
                    'td',
                    null,
                    Math.max(0, Math.floor(((run.endedAt ?? Date.now()) - run.startedAt) / 1000)),
                  ),
                  h('td', null, run.runScope?.permissionPreset ?? text('none')),
                  h('td', null, run.toolCalls),
                  h('td', null, run.deniedCalls),
                ),
              ),
            ),
          ),
          h(VerificationView, {
            detail,
            locale,
            saving,
            write,
            call: (method: string, input: unknown) => intakeCall(connection, method, input),
          }),
          h('h3', null, text('checkpoints')),
          h(
            'ul',
            null,
            ...detail.checkpoints.map((item) =>
              h(
                'li',
                { key: item.id },
                `${item.commit.slice(0, 10)} · ${item.kind} · ${item.files.length}`,
                h('pre', null, item.diffStat),
              ),
            ),
          ),
          h(
            'details',
            null,
            h('summary', null, text('evidence')),
            ...detail.evidence.map((item) => h('pre', { key: item.id }, `${item.kind}: ${item.summary}`)),
          ),
          h('h3', null, text('authorization')),
          scope
            ? h(
                'div',
                null,
                h(
                  'p',
                  { role: 'status' },
                  text(scope.status === 'active' && detail.activeScope ? 'scopeActive' : 'scopeRevoked'),
                ),
                h(
                  'dl',
                  null,
                  ...Object.entries({
                    [text('permissionPreset')]: scope.permissionPreset,
                    [text('commandMode')]: text(
                      scope.commandMode === 'trusted' ? 'commandTrusted' : 'commandConfirmed',
                    ),
                    [text('allowedPaths')]: scope.allowedPaths.join('\n'),
                    [text('protectedPaths')]: scope.protectedPaths.join('\n'),
                    [text('protectedNamesAll')]: scope.protectedNames.join(', '),
                    ...(scope.legacyAuthorization
                      ? { [text('permissionPreset') + ' ⚠']: text('legacyAuthorization') }
                      : {}),
                    [text('allowedActions')]: scope.allowedActions.join(', '),
                    [text('verifyCommands')]: scope.verifyCommands.join('\n') || text('none'),
                    [text('executionLimits')]: Object.entries(scope.limits)
                      .map(
                        ([key, value]) =>
                          `${text(limitLabels[key as keyof typeof DEFAULT_LIMITS])}: ${value}`,
                      )
                      .join('; '),
                  }).flatMap(([key, value]) => [h('dt', { key: key + 'dt' }, key), h('dd', { key }, value)]),
                ),
                h(
                  'button',
                  {
                    disabled:
                      saving ||
                      !detail.activeScope ||
                      !['active', 'paused'].includes(detail.goal.status) ||
                      detail.runs.some((run) => run.status === 'running'),
                    onClick: () => setReauthorizing(true),
                  },
                  text('reauthorizeScope'),
                ),
                h(
                  'button',
                  {
                    disabled: saving || scope.status !== 'active',
                    onClick: () => {
                      void write('revoke-scope', { scopeId: scope.id })
                    },
                  },
                  text('revokeScope'),
                ),
              )
            : h('p', null, text('scopeRevoked')),
          h('h3', null, text('initialTasks')),
          h(
            'ol',
            null,
            ...detail.tasks.map((task) =>
              h(
                'li',
                { key: task.id },
                `${task.title} · ${task.kind} · ${task.state}`,
                h(
                  'small',
                  null,
                  `${text('taskDependencies')}: ${task.dependsOn.map((id) => detail.tasks.find((item) => item.id === id)?.title ?? id).join(' → ') || text('none')}`,
                ),
              ),
            ),
          ),
          h('h3', null, text('recentTransitions')),
          h(
            'ul',
            null,
            ...detail.transitions.map((record) =>
              h(
                'li',
                { key: record.id },
                `${record.from} → ${record.to}: ${executionReason(locale, record.reason)}`,
              ),
            ),
          ),
        ),
  )
}
