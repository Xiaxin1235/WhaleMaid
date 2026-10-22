import { defineProject } from 'vitest/config'

export default defineProject({
  test: {
    name: 'host',
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
