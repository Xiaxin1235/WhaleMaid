// SPDX-License-Identifier: AGPL-3.0-or-later
/** Host identity is authoritative; old preset sessions must not become the current companion. */
export function companionRole(snapshot, session) {
  if (!session) return undefined;
  if (snapshot.companionSessionId && session.id === snapshot.companionSessionId) return 'current';
  return session.companionRole === 'earlier' ? 'earlier' : undefined;
}
export function companionLabel(snapshot, session, copy) {
  const role = companionRole(snapshot, session);
  return role === 'current' ? copy.companionName : role === 'earlier' ? copy.earlierCompanion : session?.label;
}
