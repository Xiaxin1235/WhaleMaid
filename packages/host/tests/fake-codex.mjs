import { appendFileSync, writeFileSync } from 'node:fs'
import { spawn } from 'node:child_process'
import process from 'node:process'
import { setInterval } from 'node:timers'
let input = ''
for await (const part of process.stdin) input += part
const task = JSON.parse(input)
const event = (value) => process.stdout.write(JSON.stringify(value) + '\n')
event({ type: 'thread.started', thread_id: 'fictional-thread' })
if (task.inspectEnv) event({ type: 'test-env', keys: Object.keys(process.env) })
if (task.hang) {
  const child = spawn(process.execPath, ['-e', 'setInterval(()=>{},1000)'], {
    stdio: 'ignore',
    windowsHide: true,
  })
  writeFileSync('child.pid', String(child.pid))
  event({ type: 'item.started', item: { type: 'command_execution' } })
  setInterval(() => {}, 1000)
} else {
  if (task.append) appendFileSync('README.md', '\nfictional appended line\n')
  if (task.stderr) {
    process.stderr.write(task.stderr.slice(0, 8))
    process.stderr.write(task.stderr.slice(8) + '\n')
  }
  if (task.blocked)
    event({
      type: 'item.completed',
      item: { type: 'command_execution', aggregated_output: 'rejected: blocked by policy' },
    })
  event({
    type: 'item.completed',
    item: { type: 'reasoning', text: 'fictional private reasoning must not become final output' },
  })
  event({ type: 'item.completed', item: { type: 'agent_message', text: task.message ?? 'fictional result' } })
  event({ type: 'turn.completed' })
  process.exitCode = task.exitCode ?? 0
}
