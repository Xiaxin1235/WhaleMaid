import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdir, realpath, lstat, readdir } from 'node:fs/promises'
import { join, relative, isAbsolute, resolve } from 'node:path'
import type { ProjectGoal } from '@whalemaid/core'
const exec = promisify(execFile)
export interface Workspace {
  path: string
  baseCommit: string
  git: boolean
}
/** Git operations are argv-only, with hooks and fsmonitor disabled even in untrusted repositories. */
export class WorktreeManager {
  readonly emptyHooks: string
  constructor(private readonly dataDir: string) {
    this.emptyHooks = resolve(dataDir, 'empty-hooks')
  }
  /** Invoke Git without repository hooks, fsmonitor or shell interpolation. */
  async git(cwd: string, args: string[]): Promise<string> {
    await mkdir(this.emptyHooks, { recursive: true })
    if ((await lstat(this.emptyHooks)).isSymbolicLink() || (await readdir(this.emptyHooks)).length > 0)
      throw new Error('hooks-directory-not-empty')
    return (
      await exec(
        'git',
        [
          '-c',
          'core.fsmonitor=false',
          '-c',
          `core.hooksPath=${this.emptyHooks}`,
          '-c',
          'user.name=WhaleMaid',
          '-c',
          'user.email=whaledot@localhost',
          ...args,
        ],
        { cwd, encoding: 'utf8', timeout: 30000, maxBuffer: 4 * 1024 * 1024, windowsHide: true },
      )
    ).stdout.trimEnd()
  }
  /** Create or reconcile one external worktree; reject uncertain baselines and boundaries. */
  async prepare(goal: ProjectGoal, expected?: string): Promise<Workspace> {
    if (
      !isAbsolute(goal.projectRoot) ||
      (process.platform === 'win32'
        ? !/^[a-z]:[\\/]/i.test(goal.projectRoot)
        : !goal.projectRoot.startsWith('/'))
    )
      throw new Error('project-path-platform-mismatch')
    const project = await realpath(goal.projectRoot)
    const storage = await realpath(this.dataDir)
    const outside = (path: string) => {
      const rel = relative(project, path)
      return !!rel && (rel === '..' || rel.startsWith('..\\') || rel.startsWith('../') || isAbsolute(rel))
    }
    if (!outside(storage)) throw new Error('worktree-must-be-external')
    let git: boolean
    try {
      git = (await this.git(project, ['rev-parse', '--is-inside-work-tree'])) === 'true'
    } catch {
      git = false
    }
    if (!git) return { path: project, baseCommit: 'non-git', git: false }
    const repository = await realpath(await this.git(project, ['rev-parse', '--show-toplevel']))
    if (relative(repository, project) !== '') throw new Error('git-project-root-required')
    // Goal ids are opaque data, never paths or command options.
    if (!/^goal_[a-zA-Z0-9_-]+$/.test(goal.id)) throw new Error('invalid-goal-id')
    await mkdir(join(storage, 'worktrees'), { recursive: true })
    const parent = await realpath(join(storage, 'worktrees'))
    if (!outside(parent)) throw new Error('worktree-must-be-external')
    const path = join(parent, goal.id)
    let exists = false
    try {
      const stat = await lstat(path)
      if (stat.isSymbolicLink()) throw new Error('worktree-external-modification')
      exists = true
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
    if (!exists) {
      if (expected) throw new Error('worktree-external-modification')
      const head = await this.git(project, ['rev-parse', 'HEAD'])
      await this.git(project, ['worktree', 'add', '-b', `whaledot/${goal.id.slice(5, 21)}`, path, head])
      return { path, baseCommit: head, git: true }
    }
    const head = await this.git(path, ['rev-parse', 'HEAD'])
    if (
      !expected ||
      head !== expected ||
      (await this.git(path, ['status', '--porcelain=v1', '--untracked-files=all'])) !== ''
    )
      throw new Error('worktree-external-modification')
    return { path, baseCommit: head, git: true }
  }
  /** Preserve all task changes in a local commit and return diff evidence. */
  async checkpoint(
    workspace: Workspace,
    message: string,
  ): Promise<{ commit: string; files: string[]; diffStat: string; changed: boolean }> {
    if (!workspace.git) return { commit: workspace.baseCommit, files: [], diffStat: '', changed: false }
    if ((await this.git(workspace.path, ['rev-parse', 'HEAD'])) !== workspace.baseCommit)
      throw new Error('worktree-external-modification')
    const status = await this.git(workspace.path, ['status', '--porcelain=v1', '--untracked-files=all'])
    if (!status)
      return {
        commit: await this.git(workspace.path, ['rev-parse', 'HEAD']),
        files: [],
        diffStat: '',
        changed: false,
      }
    await this.git(workspace.path, ['add', '-A'])
    const files = (
      await this.git(workspace.path, ['diff', '--cached', '--name-only', '-z', workspace.baseCommit])
    )
      .split('\0')
      .filter(Boolean)
    const diffStat = await this.git(workspace.path, ['diff', '--cached', '--stat', workspace.baseCommit])
    await this.git(workspace.path, ['commit', '-m', message])
    return { commit: await this.git(workspace.path, ['rev-parse', 'HEAD']), files, diffStat, changed: true }
  }
}
