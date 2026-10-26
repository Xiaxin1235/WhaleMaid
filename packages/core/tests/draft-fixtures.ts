import { DEFAULT_PROTECTED_NAMES } from '../src/model/authorization.js'
import { DEFAULT_LIMITS } from '../src/model/limits.js'
import { DEFAULT_INTAKE_ACTIONS } from '../src/goal-draft.js'
import type { GoalDraft, ConfirmedGoalForm } from '../src/goal-draft.js'
export const draft: GoalDraft = {
  title: 'Improve tests',
  objective: 'Find and fix the failing test',
  expectedOutcome: 'Tests pass',
  acceptance: ['All fixed tests pass'],
  stopConditions: ['Stop when blocked'],
  mode: 'autonomous',
  proposedVerifyCommands: ['pnpm test'],
  proposedProtectedPaths: [],
  initialTasks: [
    { title: 'Analyze failure', kind: 'analyze', dependsOnIndex: [] },
    { title: 'Fix failure', kind: 'edit', dependsOnIndex: [0] },
    { title: 'Verify fix', kind: 'test', dependsOnIndex: [1] },
  ],
}
export function confirmed(projectRoot = 'C:\\proj'): ConfirmedGoalForm {
  return {
    title: draft.title,
    objective: draft.objective,
    expectedOutcome: draft.expectedOutcome,
    acceptance: [...draft.acceptance],
    stopConditions: [...draft.stopConditions],
    mode: 'autonomous',
    initialTasks: structuredClone(draft.initialTasks),
    projectRoot,
    allowedPaths: [projectRoot],
    protectedPaths: [
      projectRoot + (projectRoot.startsWith('/') ? '/.git' : '\\.git'),
      projectRoot + (projectRoot.startsWith('/') ? '/.env*' : '\\.env*'),
    ],
    protectedNames: [...DEFAULT_PROTECTED_NAMES],
    allowedActions: [...DEFAULT_INTAKE_ACTIONS],
    permissionPreset: 'read-only',
    commandMode: 'confirmed',
    verifyCommands: [],
    limits: { ...DEFAULT_LIMITS },
    limitsExpandedConfirmed: false,
    confirm: true,
  }
}
