import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    projects: ['packages/*/vitest.config.ts'],
    coverage: {
      enabled: true,
      provider: 'v8',
      include: ['packages/core/src/task-state.ts', 'packages/core/src/scope.ts'],
      reporter: ['text', 'json-summary', 'html'],
      thresholds: { perFile: true, lines: 90 },
    },
  },
})
