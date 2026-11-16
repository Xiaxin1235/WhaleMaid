import type { PeerScope } from '@deepseek-ai/dsh-client-connection';
declare const consent: unique symbol;
export type ManagementConsent = {
    readonly signal: AbortSignal;
    readonly [consent]: true;
};
export type ManagementActor = PeerScope | ManagementConsent;
/** In-process capability, minted after a human answer. Never a JSON principal. */
export declare function managementConsent(signal: AbortSignal): ManagementConsent;
/** Only drafting and pause management accept this; grants remain owner-only. */
export declare function admitManagement(actor: ManagementActor): void;
export {};
