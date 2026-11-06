import type { DatabaseSync } from 'node:sqlite';
export interface Migration {
    version: number;
    up(db: DatabaseSync): void;
}
/** Append migrations; published migration versions and SQL remain immutable. */
export declare const MIGRATIONS: readonly Migration[];
