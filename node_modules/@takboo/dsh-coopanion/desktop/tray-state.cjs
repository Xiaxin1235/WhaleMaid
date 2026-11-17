const { companionRole, companionLabel } = require('../web/companion-session.js');
const { sessionActivity } = require('../web/session-ui.js');
const { petCopy, automaticPetLanguage, sessionStateLabel } = require('../web/locale.js');

function trayLocale(options = {}, presentation = {}, languages = []) {
  return options.locale ?? presentation.locale ?? automaticPetLanguage(languages);
}

/** Desktop and status bar project the same host snapshot and acknowledged preferences. */
function trayState(snapshot = {}, presentation = {}, options = {}, visible = false) {
  const copy = petCopy(options.locale ?? presentation.locale);
  const selected = snapshot.sessions?.find(session => session.id === snapshot.sessionId);
  const isCompanion = s => companionRole(snapshot, s) === 'current';
  const nameOf = s => companionLabel(snapshot, s, copy);
  const selectedLabel = selected ? nameOf(selected) : copy.noConversation;
  const activity = sessionActivity(snapshot), active = activity.active;
  const mood = !active && !activity.waiting && !activity.errors && presentation.sleeping ? 'sleeping' : activity.mood;
  const stateLabel = sessionStateLabel(selected, options.locale ?? presentation.locale, mood);
  const name = presentation.name || copy.defaultName;
  return { name, characterId: presentation.characterId || 'whale', scheme: presentation.scheme || '', iconReady: !!presentation.ready, icon: mood === 'sleeping' ? 'sleeping' : activity.icon, mood, stateLabel, activity, active, sleeping: mood === 'sleeping', visible, roam: options.roam ?? true, notifications: options.notifications ?? true, quietMode: options.quietMode ?? false, sound: presentation.sound ?? true,
    sessionId: snapshot.sessionId ?? null, sessionLabel: selectedLabel,
    sessions: (snapshot.sessions ?? []).filter(session => (!session.blank && !session.archived) || session.id === snapshot.sessionId).sort((a, b) => Number(isCompanion(b)) - Number(isCompanion(a)) || Number(b.id === snapshot.sessionId) - Number(a.id === snapshot.sessionId) || (b.updatedAt ?? 0) - (a.updatedAt ?? 0)).map(session => ({ id: session.id, label: nameOf(session), project: companionRole(snapshot, session) ? '' : session.project, selected: session.id === snapshot.sessionId, mood: session.mood, unread: Number(!!session.unread) })),
    tooltip: copy.trayTooltip(name, stateLabel, selectedLabel, activity.busy, activity.waiting + activity.errors, activity.unread),
    title: '',
  };
}
module.exports = { trayState, trayLocale };
