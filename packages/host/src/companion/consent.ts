import type { PeerScope } from '@deepseek-ai/dsh-client-connection'
const confirmed = new WeakSet<object>()
declare const consent: unique symbol
export type ManagementConsent = { readonly signal: AbortSignal; readonly [consent]: true }
export type ManagementActor = PeerScope | ManagementConsent
/** In-process capability, minted after a human answer. Never a JSON principal. */
export function managementConsent(signal: AbortSignal): ManagementConsent {
  const actor = { signal } as ManagementConsent
  confirmed.add(actor)
  return actor
}
/** Only drafting and pause management accept this; grants remain owner-only. */
export function admitManagement(actor: ManagementActor): void {
  actor.signal.throwIfAborted()
  if (confirmed.has(actor)) return
  if (!('principal' in actor) || actor.principal.kind !== 'owner') throw Error('Authenticated owner required')
}
