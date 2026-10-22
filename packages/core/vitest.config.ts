import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    name: 'core',
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: {
      enabled: true,
      provider: 'v8',
      include: ['src/task-state.ts', 'src/scope.ts'],
      reporter: ['text', 'json-summary', 'html'],
      thresholds: { perFile: true, lines: 90 },
    },
  },
})
