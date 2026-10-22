import { ActionKindSchema } from '../src/model/action.js'
import { AuthorizationScopeSchema, DEFAULT_LIMITS } from '../src/model/authorization.js'
import type { AuthorizationScope } from '../src/model/authorization.js'
import { GoalSchema } from '../src/model/goal.js'
import type { ProjectGoal } from '../src/model/goal.js'
import { TaskSchema } from '../src/model/task.js'
import type { Task } from '../src/model/task.js'

export function makeGoal(overrides: Partial<ProjectGoal> = {}): ProjectGoal {
  return GoalSchema.parse({
    id: 'goal_1',
    title: 'Improve project',
    objective: 'Complete authorized work',
    expectedOutcome: 'Verified changes',
    projectRoot: 'C:\\proj',
    acceptance: ['Tests pass'],
    stopConditions: ['Budget exhausted'],
    mode: 'autonomous',
    status: 'active',
    scopeId: 'scope_1',
    createdAt: 100,
    confirmedAt: 100,
    version: 0,
    ...overrides,
  })
}

export function makeTask(id = 'task_1', overrides: Partial<Task> = {}): Task {
  return TaskSchema.parse({
    id,
    goalId: 'goal_1',
    key: `key:${id}`,
    title: id,
    kind: 'edit',
    dependsOn: [],
    state: 'PENDING',
    acceptance: ['Tests pass'],
    attempts: 0,
    createdBy: 'user',
    createdAt: 100,
    version: 0,
    ...overrides,
  })
}

export function makeScope(overrides: Partial<AuthorizationScope> = {}): AuthorizationScope {
  return AuthorizationScopeSchema.parse({
    id: 'scope_1',
    goalId: 'goal_1',
    allowedPaths: ['C:\\proj'],
    protectedPaths: ['C:\\proj\\secrets'],
    allowedActions: ActionKindSchema.options,
    forbiddenActions: [],
    verifyCommands: ['pnpm test', 'git status'],
    limits: DEFAULT_LIMITS,
    permissionPreset: 'workspace-write',
    status: 'active',
    grantedAt: 100,
    hash: '0'.repeat(64),
    ...overrides,
  })
}
