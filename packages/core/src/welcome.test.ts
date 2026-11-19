import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { test, expect } from 'vitest'
import { WELCOME_NOTES, WELCOME_RELEASE } from './welcome.js'

test('welcome announcement matches package version and explains the current updates in both languages', () => {
  const packageJson = JSON.parse(
    readFileSync(fileURLToPath(new URL('../package.json', import.meta.url)), 'utf8'),
  ) as { version: string }
  expect(WELCOME_RELEASE).toBe(packageJson.version)
  for (const notes of [WELCOME_NOTES['zh-CN'], WELCOME_NOTES.en]) {
    expect(notes.length).toBeGreaterThanOrEqual(3)
    expect(notes.length).toBeLessThanOrEqual(5)
    expect(notes.every((note) => note.trim().length > 20)).toBe(true)
  }
  expect(WELCOME_NOTES['zh-CN'].join(' ')).toContain('设置保存')
  expect(WELCOME_NOTES['zh-CN'].join(' ')).toContain('重启后自动恢复')
  expect(WELCOME_NOTES.en.join(' ')).toContain('active configuration entry')
  expect(WELCOME_NOTES.en.join(' ')).toContain('restored after a restart')
})
