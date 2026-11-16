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
  expect(WELCOME_NOTES['zh-CN'].join(' ')).toContain('峰谷')
  expect(WELCOME_NOTES['zh-CN'].join(' ')).toContain('周末')
  expect(WELCOME_NOTES['zh-CN'].join(' ')).toContain('0.2.2-rc.2')
  expect(WELCOME_NOTES.en.join(' ')).toContain('off-peak')
  expect(WELCOME_NOTES.en.join(' ')).toContain('0.2.2-rc.2')
})
