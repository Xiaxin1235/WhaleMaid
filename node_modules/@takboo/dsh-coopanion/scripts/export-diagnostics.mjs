// SPDX-License-Identifier: AGPL-3.0-or-later
/** Export the existing sanitized schema-1 snapshot, including opted-in window events. */
import { parseArgs } from 'node:util';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { writeFile } from 'node:fs/promises';
import { listDiagnostics, readDiagnostics } from './diagnostics-client.mjs';
const { values } = parseArgs({ options: { registry: { type: 'string' }, instance: { type: 'string' }, output: { type: 'string' } } });
if (!values.output) throw new Error('--output is required');
const endpoints = (await listDiagnostics(values.registry ?? join(homedir(), '.dsh-coopanion', 'diagnostics'))).filter(e => !values.instance || e.instance === values.instance);
if (endpoints.length !== 1) throw new Error('Expected one active diagnostic instance; select --instance from sample-companion.mjs --list');
await writeFile(resolve(values.output), JSON.stringify(await readDiagnostics(endpoints[0]), null, 2) + '\n', { flag: 'wx' });
console.log('Diagnostic snapshot exported.');
