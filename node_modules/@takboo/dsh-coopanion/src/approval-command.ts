// SPDX-License-Identifier: AGPL-3.0-or-later
import type { SessionEvent } from '@deepseek-ai/dsh-session';

export interface ApprovalCommand { kind: 'shell' | 'other'; command?: string; workdir?: string; }
const marker = '…（已截断）';

/** Display-only text. Remove hidden characters before recognizing secrets, then bound it. */
export function approvalText(value: string): string {
  let text = value.replace(/\r\n?/g, '\n').replace(/\t/g, ' ').replace(/[\p{Cc}\p{Cf}]/gu, ch => ch === '\n' ? ch : '');
  text = text
    .replace(/\b(?:sk-[a-z0-9_-]+|gh[pousr]_[a-z0-9_]+|github_pat_[a-z0-9_]+|AKIA[A-Z0-9]{12,}|xox[baprs]-[a-z0-9-]+)\b/gi, '[REDACTED]')
    .replace(/\bBearer\s+[^\s"'`;|<>]+/gi, 'Bearer [REDACTED]')
    .replace(/((?<![\w-])(?:\$env:)?[A-Za-z_][A-Za-z0-9_]*\s*=\s*)((?:"(?:\\[\s\S]|`[\s\S]|[^"\\`])*"|'(?:''|[^'])*'|"[^"\n]*(?=\n|$)|'[^'\n]*(?=\n|$)|\$\([^)]*\)|\\[\s\S]|`[\s\S]|[^\s"';&|<>\\`])+)/g, '$1[REDACTED]');
  const lines = text.split('\n'), clipped = lines.slice(0, 12).join('\n');
  if (lines.length <= 12 && clipped.length <= 500) return clipped;
  let prefix = clipped.slice(0, 500 - marker.length);
  if (/[\uD800-\uDBFF]$/.test(prefix)) prefix = prefix.slice(0, -1);
  return prefix + marker;
}

/** The exact public tool/call is the only command source; never forward its argument object. */
export function approvalCommand(toolName: string, callId: string | undefined, events: readonly SessionEvent[]): ApprovalCommand {
  if (toolName !== 'bash' && toolName !== 'pwsh') return { kind: 'other' };
  const missing: ApprovalCommand = { kind: 'shell' };
  if (!callId) return missing;
  const call = events.findLast(event => event.type === 'tool/call' && event.data.callId === callId);
  if (!call || call.type !== 'tool/call' || call.data.name !== toolName) return missing;
  try {
    const args: unknown = JSON.parse(call.data.arguments);
    if (!args || typeof args !== 'object' || Array.isArray(args) || !('command' in args) || typeof args.command !== 'string') return missing;
    const command = approvalText(args.command);
    if (!command.trim()) return missing;
    const workdir = 'workdir' in args && typeof args.workdir === 'string' ? approvalText(args.workdir) : undefined;
    return { kind: 'shell', command, ...(workdir?.trim() ? { workdir } : {}) };
  } catch { return missing; }
}
