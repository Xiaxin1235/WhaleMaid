import { readOnlyCommandPaths } from './read-only-command.js'
import { z } from 'zod'
import type { ActionIntent } from './model/action.js'
import { normalizeWindowsPath } from './windows-path.js'

const text = z.string().min(1)
const file = { file_path: text }
const escalation = {
  sandbox_permissions: z.enum(['use_default']).optional(),
  justification: z.string().optional(),
}
const shell = z.strictObject({
  command: text,
  workdir: text.optional(),
  timeoutMs: z.number().positive().optional(),
  description: text,
  run_in_background: z.literal(false).optional(),
  ...escalation,
})
export const RESTRICTED_TOOLS = [
  'exit_plan_mode',
  'working_directory',
  'bash_persistent',
  'pwsh_persistent',
  'terminal_open',
  'terminal_send',
  'terminal_read',
  'terminal_signal',
  'terminal_close',
  'terminal_list',
  'job_output',
  'job_list',
  'job_kill',
  'create_goal',
  'get_goal',
  'update_goal',
  'schedule',
  'schedule_create',
  'schedule_list',
  'schedule_update',
  'schedule_delete',
  'session_search',
  'session_event_search',
  'session_trace',
  'session_event_trace',
  'session_event_read',
  'send_message',
  'interrupt_agent',
  'list_agents',
  'list_subagent_models',
  'ralph',
  'run_code',
  'skill',
  'load_workspace_dependencies',
  'present',
  'workflow',
] as const

/** Resolve DOS paths without Node dependencies; reject drive-relative, UNC and ambiguous aliases. */
export function resolveToolPath(cwd: string, path: string): string | null {
  if (/^[a-z]:[\\/]/i.test(path)) return normalizeWindowsPath(path)
  if (/^[\\/]|^[a-z]:/i.test(path)) return null
  return normalizeWindowsPath(cwd + '\\' + path)
}

/** Map only verified tool shapes. Unsupported stateful/administrative surfaces fail closed. */
export function toolCallToIntents(
  name: string,
  args: unknown,
  ctx: { cwd: string; commandMode?: 'confirmed' | 'trusted' },
): { intents: ActionIntent[] } | { unknown: true } {
  const unknown = { unknown: true } as const
  const pathIntent = (path: string, write = false): { intents: ActionIntent[] } | { unknown: true } => {
    const absolute = resolveToolPath(ctx.cwd, path)
    return absolute ? { intents: [{ type: write ? 'write-file' : 'read-file', path: absolute }] } : unknown
  }
  switch (name) {
    case 'read': {
      const p = z
        .strictObject({
          ...file,
          offset: z.number().int().positive().optional(),
          limit: z.number().int().positive().optional(),
        })
        .safeParse(args)
      return p.success ? pathIntent(p.data.file_path) : unknown
    }
    case 'read_image': {
      const p = z.strictObject(file).safeParse(args)
      return p.success ? pathIntent(p.data.file_path) : unknown
    }
    case 'write': {
      const p = z.strictObject({ ...file, content: z.string(), ...escalation }).safeParse(args)
      return p.success ? pathIntent(p.data.file_path, true) : unknown
    }
    case 'edit': {
      const p = z
        .strictObject({
          ...file,
          old_string: text,
          new_string: z.string(),
          replace_all: z.boolean().optional(),
          ...escalation,
        })
        .safeParse(args)
      if (!p.success) return unknown
      const r = pathIntent(p.data.file_path, true)
      return 'unknown' in r
        ? r
        : {
            intents: [
              { type: 'read-file', path: r.intents[0]!.type === 'write-file' ? r.intents[0]!.path : '' },
              ...r.intents,
            ],
          }
    }
    case 'glob':
    case 'grep': {
      const p = z
        .strictObject({
          pattern: text,
          path: text.optional(),
          ...(name === 'grep' ? { include: text.optional() } : {}),
        })
        .safeParse(args)
      return p.success ? pathIntent(p.data.path ?? '.') : unknown
    }
    case 'str_replace_editor': {
      const p = z
        .strictObject({
          command: z.enum(['view', 'create', 'str_replace', 'insert']),
          path: text,
          file_text: z.string().nullable().optional(),
          old_str: text.nullable().optional(),
          new_str: z.string().nullable().optional(),
          insert_line: z.number().int().nonnegative().nullable().optional(),
          view_range: z.array(z.number().int()).length(2).nullable().optional(),
          ...escalation,
        })
        .safeParse(args)
      if (!p.success) return unknown
      const a = p.data
      if (
        (a.command === 'create' && typeof a.file_text !== 'string') ||
        (a.command === 'str_replace' && (!a.old_str || a.new_str === null)) ||
        (a.command === 'insert' && (a.insert_line == null || typeof a.new_str !== 'string'))
      )
        return unknown
      const r = pathIntent(a.path, a.command !== 'view')
      if ('unknown' in r || a.command === 'view' || a.command === 'create') return r
      const absolute = resolveToolPath(ctx.cwd, a.path)!
      return {
        intents: [
          { type: 'read-file', path: absolute },
          { type: 'write-file', path: absolute },
        ],
      }
    }
    case 'bash':
    case 'pwsh': {
      const p = shell.safeParse(args)
      if (!p.success) return unknown
      const cwd = resolveToolPath(ctx.cwd, p.data.workdir ?? '.')
      if (!cwd) return unknown
      const intents: ActionIntent[] = [{ type: 'run-command', cmdline: p.data.command, cwd }]
      const read = readOnlyCommandPaths(p.data.command, cwd)
      if (ctx.commandMode !== 'trusted' && 'paths' in read)
        for (const path of read.paths) intents.push({ type: 'read-file', path })
      return { intents }
    }
    case 'web_fetch': {
      const p = z.strictObject({ url: z.url() }).safeParse(args)
      return p.success ? { intents: [{ type: 'network', url: p.data.url, method: 'GET' }] } : unknown
    }
    case 'web_search': {
      const p = z.strictObject({ queries: z.array(text).min(1).max(4) }).safeParse(args)
      return p.success
        ? { intents: [{ type: 'network', url: 'https://search.invalid/', method: 'GET' }] }
        : unknown
    }
    case 'subagent':
    case 'subagent_fork': {
      const p = z.strictObject({ prompt: text, description: text, cwd: text.optional() }).safeParse(args)
      return p.success ? { intents: [{ type: 'spawn-subagent' }] } : unknown
    }
    case 'ask_user_question': {
      const p = z
        .strictObject({
          questions: z
            .array(
              z.strictObject({
                id: text,
                question: text,
                header: text.optional(),
                options: z.array(z.strictObject({ label: text, description: text.optional() })).optional(),
                multi_select: z.boolean().optional(),
              }),
            )
            .min(1),
          timeout: z
            .number()
            .refine((value) => value === -1 || value > 0)
            .optional(),
        })
        .safeParse(args)
      return p.success ? { intents: [] } : unknown
    }
    case 'todo_write': {
      const p = z
        .strictObject({
          todos: z.array(
            z.strictObject({ content: text, status: z.enum(['pending', 'in_progress', 'completed']) }),
          ),
        })
        .safeParse(args)
      return p.success ? { intents: [] } : unknown
    }
    default:
      return unknown
  }
}
