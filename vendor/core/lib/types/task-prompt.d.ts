import type { ProjectGoal } from './model/goal.js';
import type { Task } from './model/task.js';
import type { RunScope } from './run-scope.js';
import type { Locale } from './i18n/index.js';
/** Human summary is display-only; model output cannot grant permissions or establish acceptance. */
export declare function buildTaskPrompt(goal: ProjectGoal, task: Task, scope: RunScope, locale: Locale, userNotes?: readonly string[]): string;
