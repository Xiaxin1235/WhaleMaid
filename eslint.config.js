import js from '@eslint/js'
import { defineConfig, globalIgnores } from 'eslint/config'
import prettier from 'eslint-config-prettier/flat'
import tseslint from 'typescript-eslint'

export default defineConfig([
  globalIgnores(['**/node_modules/**', '**/lib/**', '**/dist/**', '**/coverage/**', '.dsh-dev/**']),
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    languageOptions: {
      globals: { console: 'readonly' },
    },
  },
  prettier,
])
