import type { Notification } from '#whalemaid/core';
import type { ScopeService } from '../scope-service.js';
import type { WhaleStore } from '../store/index.js';
type Scopes = Pick<ScopeService, 'activeScopeFor'>;
/** Reconcile the underlying decision before using its options, independently of interruption policy. */
export declare function refreshDecision(store: WhaleStore, scopes: Scopes, n: Notification, now?: number): Notification;
export {};
