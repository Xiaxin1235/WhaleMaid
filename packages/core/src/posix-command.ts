import { parseCommandText } from './trusted-command-parser.js'

/** Native POSIX operations that must not become ordinary merely because their Windows names differ. */
export function posixCommandReasons(line: string): string[] {
  const reasons: string[] = []
  if (/`|\$\(|[<>]\(|<<|[{}]/.test(line)) reasons.push('dynamic-execution')
  for (const words of parseCommandText(line).segments) {
    const first = words[0]?.value ?? ''
    const executable = first.split('/').at(-1)!.toLowerCase()
    const args = words.slice(1).map((word) => word.value.toLowerCase())
    const operation = executable === 'service' ? args[1] : args.find((word) => !word.startsWith('-'))
    if (/^[a-z_]\w*=/i.test(first)) reasons.push('dynamic-execution')
    if (
      [
        'sudo',
        'doas',
        'su',
        'runuser',
        'pkexec',
        'mount',
        'umount',
        'diskutil',
        'fdisk',
        'parted',
        'mkfs',
        'dd',
        'reboot',
        'shutdown',
        'halt',
        'poweroff',
        'systemd-run',
        'useradd',
        'usermod',
        'userdel',
        'groupadd',
        'groupdel',
        'passwd',
        'visudo',
        'chmod',
        'chown',
        'chgrp',
        'setfacl',
        'chflags',
        'csrutil',
        'spctl',
        'security',
      ].includes(executable) ||
      executable.startsWith('mkfs.') ||
      (['systemctl', 'launchctl', 'service'].includes(executable) &&
        !['status', 'list', 'show', 'print', 'is-active', 'is-enabled'].includes(operation ?? '')) ||
      (executable === 'defaults' && ['write', 'delete', 'import'].includes(args[0] ?? '')) ||
      (executable === 'crontab' && !(args.length === 1 && args[0] === '-l')) ||
      (executable === 'flatpak' && operation === 'override') ||
      (executable === 'brew' &&
        operation === 'services' &&
        !['list', 'info'].includes(args[args.indexOf('services') + 1] ?? ''))
    )
      reasons.push('system-configuration')
    if (
      [
        'env',
        'command',
        'builtin',
        'exec',
        'eval',
        'source',
        '.',
        'nohup',
        'nice',
        'timeout',
        'setsid',
        'stdbuf',
        'xargs',
        'alias',
        'unalias',
        'export',
        'declare',
        'typeset',
        'readonly',
        'set',
        'unset',
        'shopt',
        'enable',
        'hash',
        'trap',
        'osascript',
        'ssh',
      ].includes(executable)
    )
      reasons.push('dynamic-execution')
    if (
      ['rm', 'rmdir', 'unlink', 'truncate'].includes(executable) ||
      (executable === 'find' && args.includes('-delete'))
    )
      reasons.push('delete')
    if (executable === 'find') reasons.push('dynamic-execution')
    if (
      [
        'apt',
        'apt-get',
        'brew',
        'port',
        'dnf',
        'yum',
        'pacman',
        'zypper',
        'apk',
        'snap',
        'flatpak',
        'gem',
        'bundle',
        'cargo',
        'go',
        'uv',
        'pipx',
        'poetry',
        'hatch',
      ].includes(executable) &&
      args.some((word) =>
        [
          'install',
          'uninstall',
          'remove',
          'delete',
          'purge',
          'autoremove',
          'reinstall',
          'upgrade',
          'update',
          'add',
          'get',
          'sync',
          'tap',
          'untap',
          'link',
          'unlink',
          '-s',
          '-r',
          '-u',
        ].includes(word),
      )
    )
      reasons.push('package-install')
    if (
      /^python(?:[23](?:\.\d+)*)?$/.test(executable) &&
      args.includes('-m') &&
      args.includes('pip') &&
      args.some((word) => ['install', 'uninstall'].includes(word))
    )
      reasons.push('package-install')
    if (executable === 'install') reasons.push('package-install')
    if (['dpkg', 'rpm'].includes(executable) && args.some((word) => /^-(?:-[a-z-]+|[iue])/i.test(word)))
      reasons.push('package-install')
    if (executable === 'pacman' && args.some((word) => /^-[sru]/i.test(word))) reasons.push('package-install')
    if (executable === 'installer') reasons.push('package-install')
    if (
      (['cargo', 'poetry', 'hatch'].includes(executable) && args.includes('publish')) ||
      (executable === 'gem' && args.includes('push')) ||
      (executable === 'twine' && args.includes('upload')) ||
      (executable === 'gh' &&
        args.includes('release') &&
        args.some((word) => ['create', 'upload', 'delete'].includes(word)))
    )
      reasons.push('package-publish')
  }
  return [...new Set(reasons)]
}
