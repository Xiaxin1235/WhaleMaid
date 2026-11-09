import { createHash } from 'node:crypto';
import { AuthorizationScopeSchema, DEFAULT_PROTECTED_NAMES, hashScope } from '#whalemaid/core';
/** Append migrations; published migration versions and SQL remain immutable. */
export const MIGRATIONS = [
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
      `);
        },
    },
    {
        version: 2,
        up(db) {
            for (const row of db.prepare('SELECT id,data FROM scopes').all()) {
                const input = JSON.parse(String(row.data));
                if (!input || typeof input !== 'object' || 'protectedNames' in input)
                    continue;
                const scope = AuthorizationScopeSchema.parse({
                    ...input,
                    protectedNames: [...DEFAULT_PROTECTED_NAMES],
                    legacyAuthorization: true,
                });
                const digest = hashScope(scope, { hash: (value) => createHash('sha256').update(value).digest('hex') });
                if (!digest.ok)
                    throw new Error('scope-migration-invalid');
                db.prepare('UPDATE scopes SET data=? WHERE id=?').run(JSON.stringify({ ...scope, hash: digest.value }), String(row.id));
            }
        },
    },
    {
        version: 3,
        up(db) {
            db.exec('CREATE TABLE verifications (id TEXT PRIMARY KEY REFERENCES runs(id), task_id TEXT NOT NULL REFERENCES tasks(id), data TEXT NOT NULL)');
        },
    },
    {
        version: 4,
        up(db) {
            db.exec('CREATE TABLE autopilot_events (id TEXT PRIMARY KEY, goal_id TEXT NOT NULL REFERENCES goals(id), data TEXT NOT NULL); CREATE TABLE planner_state (id TEXT PRIMARY KEY REFERENCES goals(id), data TEXT NOT NULL)');
            for (const row of db.prepare('SELECT id,data FROM goals').all()) {
                const goal = JSON.parse(String(row.data));
                if (goal && typeof goal === 'object' && !('autopilot' in goal))
                    db.prepare('UPDATE goals SET data=? WHERE id=?').run(JSON.stringify({ ...goal, autopilot: { enabled: false } }), String(row.id));
            }
        },
    },
    {
        version: 5,
        up(db) {
            for (const table of ['user_notes', 'notification_choices', 'inbox_sessions', 'notification_deliveries'])
                db.exec(`CREATE TABLE ${table} (id TEXT PRIMARY KEY, goal_id TEXT NOT NULL REFERENCES goals(id), data TEXT NOT NULL)`);
        },
    },
    {
        version: 6,
        up(db) {
            db.exec(`CREATE TABLE memories (id TEXT PRIMARY KEY, scope_key TEXT NOT NULL, status TEXT NOT NULL, version INTEGER NOT NULL, data TEXT NOT NULL);
        CREATE INDEX memories_scope_status ON memories(scope_key,status);`);
        },
    },
    {
        version: 7,
        up(db) {
            db.exec(`CREATE TABLE memory_proposals (id TEXT PRIMARY KEY, scope_key TEXT NOT NULL, status TEXT NOT NULL, version INTEGER NOT NULL, data TEXT NOT NULL);
      CREATE INDEX memory_proposals_pending ON memory_proposals(scope_key,status);`);
        },
    },
    {
        version: 8,
        up(db) {
            db.exec(`CREATE TABLE autopilot_events_next (id TEXT PRIMARY KEY, goal_id TEXT REFERENCES goals(id), data TEXT NOT NULL);
        INSERT INTO autopilot_events_next SELECT id,goal_id,data FROM autopilot_events;
        DROP TABLE autopilot_events;
        ALTER TABLE autopilot_events_next RENAME TO autopilot_events;`);
        },
    },
    {
        version: 9,
        up(db) {
            db.exec(`CREATE TABLE companion_journal (id TEXT PRIMARY KEY, kind TEXT NOT NULL, created_at INTEGER NOT NULL, status TEXT NOT NULL, data TEXT NOT NULL);
        CREATE INDEX companion_journal_kind_date ON companion_journal(kind,created_at);
        CREATE TABLE companion_recall_state (id TEXT PRIMARY KEY, data TEXT NOT NULL);`);
        },
    },
    {
        version: 10,
        up(db) {
            db.exec(`
        CREATE TABLE opportunities (
          id TEXT PRIMARY KEY, goal_id TEXT REFERENCES goals(id), detector TEXT NOT NULL,
          dedupe_key TEXT NOT NULL, status TEXT NOT NULL, created_at INTEGER NOT NULL,
          expires_at INTEGER NOT NULL, score REAL NOT NULL, data TEXT NOT NULL
        );
        CREATE UNIQUE INDEX opportunities_open_key ON opportunities(dedupe_key) WHERE status='open';
        CREATE INDEX opportunities_expiry ON opportunities(status,expires_at);
        CREATE INDEX opportunities_created ON opportunities(created_at);
        CREATE INDEX initiative_verification_task ON verifications(task_id);
        CREATE INDEX initiative_run_task ON runs(task_id);
        CREATE INDEX initiative_event_goal ON autopilot_events(goal_id);
        CREATE INDEX initiative_notification_goal ON notifications(
          CASE WHEN json_valid(data) THEN json_extract(data,'$.goalId') END
        );
      `);
        },
    },
    {
        version: 11,
        up(db) {
            // An old attempt without positive failure evidence could have reached the owner.
            db.exec(`
        UPDATE notifications SET data = json_set(data, '$.decisionDelivery', json_object(
          'generation', 1,
          'failures', CASE WHEN json_extract(data,'$.deliveryState') = 'failed' THEN 1 ELSE 0 END,
          'outcome', CASE WHEN json_extract(data,'$.deliveryState') = 'failed' THEN 'failed' ELSE 'unanswered' END,
          'reason', CASE WHEN json_extract(data,'$.deliveryState') = 'failed' THEN 'question-service-failed' ELSE 'legacy-attempt' END
        ))
        WHERE CASE WHEN json_valid(data) THEN
          json_extract(data,'$.kind') IN ('decision','blocked')
          AND json_extract(data,'$.resolvedAt') IS NULL
          AND json_extract(data,'$.decisionDelivery') IS NULL
          AND json_extract(data,'$.deliveryAttemptedAt') IS NOT NULL
        END;
        UPDATE notifications SET data = json_set(data, '$.decisionDelivery.retryAt',
          json_extract(data,'$.deliveryAttemptedAt') + 60000)
        WHERE CASE WHEN json_valid(data) THEN json_extract(data,'$.decisionDelivery.outcome') = 'failed'
          AND json_extract(data,'$.decisionDelivery.retryAt') IS NULL END;
      `);
        },
    },
    {
        version: 12,
        up(db) {
            db.exec(`
        CREATE TABLE radar_subscriptions (id TEXT PRIMARY KEY REFERENCES goals(id), data TEXT NOT NULL);
        CREATE TABLE radar_observations (
          id TEXT PRIMARY KEY, goal_id TEXT NOT NULL REFERENCES radar_subscriptions(id), data TEXT NOT NULL
        );
        CREATE INDEX radar_observation_goal ON radar_observations(goal_id);
      `);
        },
    },
];
//# sourceMappingURL=migrations.js.map