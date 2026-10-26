import { realpath, stat, readFile, access } from 'node:fs/promises'
import { resolve, relative, isAbsolute, join, dirname, basename } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { classifyCommand } from '@whalemaid/core'
const run = promisify(execFile)
const inside = (root: string, target: string) => {
  const rel = relative(root, target)
  return !isAbsolute(rel) && rel !== '..' && !rel.startsWith('..\\') && !rel.startsWith('../')
}
export interface ProjectFacts {
  projectRoot: string
  isGit: boolean
  clean: boolean
  branch: string | null
  candidateCommands: { command: string; class: 'safe' | 'needs-approval' | 'forbidden'; reasons: string[] }[]
}

/** Resolve existing ancestors as well as missing leaves; reject symlinks escaping the project. */
export async function projectPath(root: string, input: string): Promise<string> {
  const wildcard = /[\\/]\.env\*$/i.test(input)
  const target = resolve(root, wildcard ? input.slice(0, -1) : input)
  if (!inside(root, target)) throw new Error('path-outside-project')
  let ancestor = target
  const suffix: string[] = []
  for (;;) {
    try {
      const actual = await realpath(ancestor)
      if (!inside(root, actual)) throw new Error('symlink-outside-project')
      return join(actual, ...suffix.reverse()) + (wildcard ? '*' : '')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      suffix.push(basename(ancestor))
      ancestor = dirname(ancestor)
    }
  }
}

/** Only inspect known metadata files; candidate commands are never run or selected automatically. */
export async function inspectProject(input: string): Promise<ProjectFacts> {
  const projectRoot = await realpath(input)
  if (!(await stat(projectRoot)).isDirectory()) throw new Error('project-not-directory')
  if (
    process.platform === 'win32'
      ? resolve(input).toLowerCase() !== projectRoot.toLowerCase()
      : resolve(input) !== projectRoot
  )
    throw new Error('project-symlink-root')
  const commands = new Set<string>()
  try {
    const path = await projectPath(projectRoot, 'package.json')
    if ((await stat(path)).size <= 262144) {
      const pkg = JSON.parse(await readFile(path, 'utf8')) as {
        scripts?: Record<string, unknown>
        packageManager?: unknown
      }
      const manager = typeof pkg.packageManager === 'string' ? pkg.packageManager.split('@')[0] : 'pnpm'
      const runner = ['pnpm', 'npm', 'yarn'].includes(manager ?? '') ? manager! : 'pnpm'
      for (const name of ['test', 'lint', 'typecheck'])
        if (typeof pkg.scripts?.[name] === 'string')
          commands.add(`${runner} ${runner === 'npm' && name !== 'test' ? 'run ' : ''}${name}`)
    }
  } catch (error) {
    if (error instanceof Error && error.message === 'symlink-outside-project') throw error
    // Missing or invalid package metadata supplies no candidates.
  }
  for (const file of ['pyproject.toml', 'pytest.ini']) {
    try {
      await access(await projectPath(projectRoot, file))
      commands.add('pytest')
    } catch (error) {
      if (error instanceof Error && error.message === 'symlink-outside-project') throw error
    }
  }
  let isGit = false,
    clean = false,
    branch: string | null = null
  const git = (args: string[]) =>
    run('git', ['-c', 'core.fsmonitor=false', '-C', projectRoot, ...args], {
      windowsHide: true,
      timeout: 10000,
      maxBuffer: 1024 * 1024,
    })
  try {
    isGit = (await git(['rev-parse', '--is-inside-work-tree'])).stdout.trim() === 'true'
    if (isGit) {
      clean = (await git(['status', '--porcelain'])).stdout.trim() === ''
      branch = (await git(['branch', '--show-current'])).stdout.trim() || null
    }
  } catch {
    if (isGit) throw new Error('git-inspection-failed')
  }
  return {
    projectRoot,
    isGit,
    clean,
    branch,
    candidateCommands: [...commands].map((command) => ({
      command,
      ...classifyCommand(command, projectRoot),
    })),
  }
}
