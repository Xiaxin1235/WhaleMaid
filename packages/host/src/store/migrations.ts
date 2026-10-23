import { createHash } from 'node:crypto'
import { AuthorizationScopeSchema, DEFAULT_PROTECTED_NAMES, hashScope } from '@whaledot/core'
import type { DatabaseSync } from 'node:sqlite'

export interface Migration {
  version: number
  up(db: DatabaseSync): void
}

/** Append migrations; published migration versions and SQL remain immutable. */
export const MIGRATIONS: readonly Migration[] = [
  {
    version: 1,
    up(db) {
      db.exec(`
        CREATE TABLE goals (id TEXT PRIMARY KEY, version INTEGER NOT NULL, data TEXT NOT NULL);
        CREATE TABLE scopes (
          id TEXT PRIMARY KEY, goal_id TEXT NOT NULL REFERENCES goals(id),
          status TEXT NOT NULL CHECK(status IN ('active','revoked','superseded')),
          data TEXT NOT NULL
        );
        CREATE UNIQUE INDEX one_active_scope ON scopes(goal_id) WHERE status='active';
        CREATE TABLE tasks (
          id TEXT PRIMARY KEY, goal_id TEXT NOT NULL REFERENCES goals(id),
          task_key TEXT NOT NULL, version INTEGER NOT NULL, state TEXT NOT NULL, data TEXT NOT NULL,
          UNIQUE(goal_id, task_key)
        );
        CREATE TABLE state_transitions (
          id TEXT PRIMARY KEY, task_id TEXT NOT NULL REFERENCES tasks(id), data TEXT NOT NULL
        );
        CREATE TABLE runs (
          id TEXT PRIMARY KEY, task_id TEXT NOT NULL REFERENCES tasks(id), data TEXT NOT NULL
        );
        CREATE TABLE attempts (id TEXT PRIMARY KEY, run_id TEXT NOT NULL REFERENCES runs(id), data TEXT NOT NULL);
        CREATE TABLE checkpoints (
          id TEXT PRIMARY KEY, goal_id TEXT NOT NULL REFERENCES goals(id),
          task_id TEXT NOT NULL REFERENCES tasks(id), data TEXT NOT NULL
        );
        CREATE TABLE evidence (id TEXT PRIMARY KEY, run_id TEXT NOT NULL REFERENCES runs(id), data TEXT NOT NULL);
        CREATE TABLE notifications (id TEXT PRIMARY KEY, data TEXT NOT NULL);
        CREATE TABLE suggestions (id TEXT PRIMARY KEY, data TEXT NOT NULL);
        CREATE TABLE kv_settings (id TEXT PRIMARY KEY, data TEXT NOT NULL);
      `)
    },
  },
  {
    version: 2,
    up(db) {
      for (const row of db.prepare('SELECT id,data FROM scopes').all()) {
        const input: unknown = JSON.parse(String(row.data))
        if (!input || typeof input !== 'object' || 'protectedNames' in input) continue
        const scope = AuthorizationScopeSchema.parse({
          ...input,
          protectedNames: [...DEFAULT_PROTECTED_NAMES],
          legacyAuthorization: true,
        })
        const digest = hashScope(scope, { hash: (value) => createHash('sha256').update(value).digest('hex') })
        if (!digest.ok) throw new Error('scope-migration-invalid')
        db.prepare('UPDATE scopes SET data=? WHERE id=?').run(
          JSON.stringify({ ...scope, hash: digest.value }),
          String(row.id),
        )
      }
    },
  },
  {
    version: 3,
    up(db) {
      db.exec(
        'CREATE TABLE verifications (id TEXT PRIMARY KEY REFERENCES runs(id), task_id TEXT NOT NULL REFERENCES tasks(id), data TEXT NOT NULL)',
      )
    },
  },
  {
    version: 4,
    up(db) {
      db.exec(
        'CREATE TABLE autopilot_events (id TEXT PRIMARY KEY, goal_id TEXT NOT NULL REFERENCES goals(id), data TEXT NOT NULL); CREATE TABLE planner_state (id TEXT PRIMARY KEY REFERENCES goals(id), data TEXT NOT NULL)',
      )
      for (const row of db.prepare('SELECT id,data FROM goals').all()) {
        const goal: unknown = JSON.parse(String(row.data))
        if (goal && typeof goal === 'object' && !('autopilot' in goal))
          db.prepare('UPDATE goals SET data=? WHERE id=?').run(
            JSON.stringify({ ...goal, autopilot: { enabled: false } }),
            String(row.id),
          )
      }
    },
  },
  {
    version: 5,
    up(db) {
      for (const table of ['user_notes', 'notification_choices', 'inbox_sessions', 'notification_deliveries'])
        db.exec(
          `CREATE TABLE ${table} (id TEXT PRIMARY KEY, goal_id TEXT NOT NULL REFERENCES goals(id), data TEXT NOT NULL)`,
        )
    },
  },
]
