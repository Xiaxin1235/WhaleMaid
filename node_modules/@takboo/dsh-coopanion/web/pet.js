import { companionRole, companionLabel } from './companion-session.js';
import { createPanelStyle, apronPosition, actionInk } from './panel-style.js';
import { InboxReceipts, continuedInboxKey } from './inbox-receipts.js';
import { automaticExpression, taskExpression } from './task-expression.js';
import { reactionFor } from './reaction.js';
import { createQuestionForms } from './inline-questions.js';
import { createApprovalForms } from './inline-approvals.js';
import { advanceRenderCadence } from './render-cadence.js';
import { createDiagnosticCounters } from './diagnostics.js';
import { createCompanionStroke } from './companion-touch.js';
import { initialNpc, stepNpc, npcSpace } from './npc-life.js';
import { initialCompanionship, stepCompanionship, companionshipMode } from './companionship.js';
import { CompanionClient, browserCompanionship } from './companion-client.js';
import { loadBody, knownScheme } from './upstream/body-host.js';
import { createSfx } from './upstream/sound.js';
import { createSpeech, replyPreview } from './speech.js';
import { createNoticeQueue, pendingInteractions, notificationPresentation, notificationCopy } from './notification-ui.js';
import { ChatComposer, SessionAttention, shortSessionIds, sessionTime, sessionActivity, inboxContents, unreadReplies } from './session-ui.js';
import { renderReplyMarkdown } from './markdown-runtime.js';
import { petLanguage, petCopy, localizedText, appNoticeCopy, automaticPetLanguage, sessionStateLabel } from './locale.js';
import { textScale } from './text-scale.js';
import { viewportPoint, panelPosition } from './display-geometry.js';
const PACK_LIMIT = 128 * 1024 * 1024;
const isCompanionSession = s => companionRole(snapshot, s) === 'current';
const isCompanionHistory = s => !!companionRole(snapshot, s);
const sessionName = s => companionLabel(snapshot, s, uiCopy());
import { browserCharacters } from './character-library.js';
const BUILTIN_ID = 'whale';
const $ = id => document.getElementById(id);
const native = window.dshPetBridge;
const pet = $('pet'), bubble = $('bubble'), conversations = $('conversations'), chat = $('chat'), menu = $('menu'), characters = $('characters'), reader = $('reader');
const interaction = $('interaction'), requests = $('requests');
const companionInvitation = $('companion-invitation'), companionFeedback = $('companion-feedback');
const panels = [conversations, chat, menu, characters, reader, requests];
const noticeQueue = createNoticeQueue();
let notificationState, currentNotice, interactionExpires = 0;
let toastNotice;
const snoozing = new Map();
// At most one invitation, feedback and application notice, local to this window.
const quietInbox = new Map();
const questionForms = createQuestionForms({ send, changed: () => { renderRequests(); position(); } });
const approvalForms = createApprovalForms({ send, changed: () => { renderRequests(); position(); }, feedback: text => { $('request-feedback').textContent = text; } });
const notificationLocale = () => options.locale ? petLanguage(options.locale) : automaticPetLanguage(navigator.languages ?? [navigator.language]);
const uiCopy = () => petCopy(notificationLocale(), options.interfaceStyle !== 'classic');
const noticeCopy = () => notificationCopy(notificationLocale(), options.interfaceStyle !== 'classic');
const panelStyle = createPanelStyle(document);
const allRequests = () => pendingInteractions(notificationState);
const pendingRequests = () => allRequests().filter(item => !inboxReceipts.hides(item));
const userInputOccupied = () => pressing || dragging || panels.some(p => !p.hidden) || !bubble.hidden;
const userOccupied = () => userInputOccupied() || body?.layout?.busy;
const panelAnchors = new WeakMap();
const library = native?.characters ?? browserCharacters;
const sfx = createSfx({ storageKey: 'dsh-pet.sound.v2', volume: .35 });
const nameIn = names => localizedText(names, notificationLocale());
const wordName = (word, view = previewCharacter) => word.names?.[notificationLocale()]?.[0] ?? (view?.builtin ? uiCopy().words[word.id] : undefined) ?? nameIn(word.names)?.[0] ?? word.id;
let npc = initialNpc(1), npcGeneration = 1, npcEvent, npcRelocated = false, keyboardActivity = 'unknown', keyboardAt = -Infinity, keyboardBackend = 'none', keyboardStatus = 'disabled', npcSoundUntil = 0, npcGeometry, npcGroundLayout, npcSeated = false;
const homeMarker = document.createElement('div'); homeMarker.id = 'npc-home'; homeMarker.hidden = true; homeMarker.setAttribute('aria-hidden', 'true'); document.body.appendChild(homeMarker);
let body, previewBody, previewCharacter, activeView, activeScheme, activeName = 'DeepSeek 大肥鱼', libraryState, libraryBusy = false;
let appliedMood, appliedControls, speech, speechExpires = Infinity, pressing = false, dragStart, dragPoint, dragging = false, previewScheme = "", reducedNeedsStep = true;
let options = { interfaceStyle: 'new', inlineQuestions: true, preferOpeningParagraph: true, textScale: 1, size: 180, roam: true, companionship: 'off', notifications: true, quietMode: false, bubbleDurationMs: 12000 };
let snapshot = { mood: 'idle', text: '你好。点点我，或双击和我说话。', sessionId: null, sessions: [] };
let pendingSelectionId;
let x = innerWidth * .68, y = innerHeight - 155, hovered = false, asleep = false, toastTimer, noticeSession;
let cursorPoint, lastHit;
let renderedSessionId = null, reactionUntil = 0, reactionMood, reactionExpression, bubbleSession, trayKey, touchTimer, touchBlockedUntil = 0;
let bubbleResult, readerResult, pendingOnly = false, talkAt = 0;
let readerQueue, inboxState = { requests: [], issues: [], replies: [], total: 0 };
let resizeLayout, displayGeometry, pendingDisplayPlacement, resizeOrigin;
let stageWidth = innerWidth, pressedPointerId;
const composer = new ChatComposer();
const inboxReceipts = new InboxReceipts(key => { void native?.inboxReceipt?.(key).then(ok => { if (!ok) console.warn('Inbox viewing receipt could not be saved'); }).catch(() => console.warn('Inbox viewing receipt could not be saved')); });
const sessionAttention = new SessionAttention(inboxReceipts);
let attentionSnapshot = snapshot;
const chatTimers = new Map();
let draftSessionId;
let activityWords = [], actionRestorePending = false, localHour, hourCheckedAt = -Infinity;
let companion = initialCompanionship(), companionAction, companionManualId, companionFeedbackUntil = 0, companionReadAt = 0;
const companionStroke = createCompanionStroke();
const diagnosticCounters = createDiagnosticCounters();
const companionClient = new CompanionClient(native?.companionship ?? browserCompanionship, () => refreshCompanionCopy());
const shownResults = new Set(), acknowledgedResults = new Set();
let renderedLocale;
let characterFeedback = { key: 'characterHint', args: [] };
const motionPreference = matchMedia('(prefers-reduced-motion: reduce)');
let reduced = motionPreference.matches;
motionPreference.addEventListener('change', event => { reduced = event.matches; if (reduced) $('attention').classList.remove('inbox-pulse'); if (reduced && companion.active) companionAction = 'dismiss'; });

function send(action) {
  if (native) { native.action(action); return; }
  if (action.type === 'read') {
    const result = snapshot.results?.find(r => r.id === action.resultId);
    if (result && !result.read) { result.read = true; const session = snapshot.sessions.find(s => s.id === result.sessionId); if (session) session.unread = Math.max(0, (session.unread ?? 0) - 1); }
    render();
  }
  if (action.type === 'select') {
    const session = snapshot.sessions.find(session => session.id === action.sessionId);
    if (session) snapshot = { ...snapshot, ...session, sessionId: session.id };
    render();
  }
}

function setCopyNode(id, key) { const node = $(id); node.dataset.i18n = key; node.textContent = uiCopy()[key]; }
function characterStatus(key, ...args) {
  characterFeedback = { key, args }; delete $('character-status').dataset.i18n;
  const value = uiCopy()[key]; $('character-status').textContent = typeof value === 'function' ? value(...args) : value;
}
function refreshPreviewCopy() {
  const view = previewCharacter; if (!view) return;
  for (const option of $('character-action').options) { const word = view.vocab.find(word => word.id === option.value); if (word) option.textContent = wordName(word); }
  const selected = $('character-scheme').value; fillSchemes(view, previewScheme); $('character-scheme').value = selected;
  $('character-about').textContent = nameIn(view.about);
  $('character-credit').textContent = uiCopy().authorCredit(view.author ?? uiCopy().unknownAuthor, view.credits?.map(c => c.name).join('、') ?? '', view.builtin ? uiCopy().builtinLicense : view.license ?? uiCopy().authorLicense);
}
function applyLocale() {
  const locale = notificationLocale(), key = locale + options.interfaceStyle; if (renderedLocale === key) return;
  renderedLocale = key;
  const text = uiCopy(), notice = noticeCopy();
  document.documentElement.lang = locale === 'zh' ? 'zh-CN' : 'en'; document.title = text.title;
  const lookup = key => key.startsWith('notice:') ? notice[key.slice(7)] : key.startsWith('demo:') ? text.demoButtons[key.slice(5)] : text[key];
  for (const [attribute, target] of [['data-i18n', null], ['data-i18n-aria-label', 'aria-label'], ['data-i18n-placeholder', 'placeholder'], ['data-i18n-title', 'title']]) {
    for (const node of document.querySelectorAll(`[${attribute}]`)) {
      const value = lookup(node.getAttribute(attribute));
      if (typeof value !== 'string') throw new Error(`Missing locale text: ${node.getAttribute(attribute)}`);
      if (target) node.setAttribute(target, value); else node.textContent = value;
    }
  }
  activeName = activeView ? nameIn(activeView.name) : text.defaultName;
  $('chat-character').textContent = activeName; $('menu-name').textContent = activeName;
  pet.setAttribute('aria-label', text.petLabel(activeName));
  if (bubbleResult) bubble.setAttribute('aria-label', text.finalReply(sessionName(snapshot.sessions.find(session => session.id === bubbleResult.sessionId)) ?? activeName));
  if (libraryState) for (const option of $('character-select').options) { const view = libraryState.characters.find(view => view.id === option.value); if (view) option.textContent = nameIn(view.name); }
  refreshPreviewCopy(); characterStatus(characterFeedback.key, ...characterFeedback.args);
  if (currentNotice && !interaction.hidden) {
    const value = notificationPresentation(currentNotice, locale, body?.words ?? []);
    $('interaction-title').textContent = value.title; $('interaction-preview').textContent = value.body;
  }
  if (toastNotice && !$('toast').hidden) { const value = appNoticeCopy(toastNotice, locale); $('toast-title').textContent = value.title; $('toast-body').textContent = value.body; }
  refreshCompanionCopy();
  trayKey = undefined;
}

function bounds() { return { W: innerWidth, H: innerHeight, floorY: innerHeight - 24, S: options.size / 256 }; }
function previewBounds() { const el = $('character-preview'); return { W: el.clientWidth, H: el.clientHeight, floorY: el.clientHeight - 14, S: Math.min(el.clientWidth, el.clientHeight - 22) / 256 }; }
function position() {
  const layout = body?.layout;
  const box = layout?.box;
  // Bounds are applied inside the figure frame. Reanchor once its new geometry arrives.
  if (resizeLayout && layout !== resizeLayout && box?.w > 0 && box?.h > 0) {
    for (const panel of [bubble, interaction, companionInvitation, companionFeedback, ...panels, $('attention')]) panelAnchors.delete(panel);
    resizeLayout = undefined;
  }
  if (box) {
    pet.hidden = false;
    x = box.x; y = box.y;
    // Keep the invisible input region on pixel boundaries while the artwork
    // breathes at subpixel precision. Round outwards to contain the whole body.
    const left = Math.floor(x), top = Math.floor(y);
    Object.assign(pet.style, { left: `${left}px`, top: `${top}px`, width: `${Math.max(1, Math.ceil(x + box.w) - left)}px`, height: `${Math.max(1, Math.ceil(y + box.h) - top)}px` });
    pet.dataset.mode = layout.mode; pet.dataset.pressing = String(layout.pressing);
    pet.style.cursor = layout.cursor || 'grab';
  }
  const anchor = layout?.bubble ?? { x: x + options.size / 2, y };
  for (const panel of [bubble, interaction, companionInvitation, companionFeedback, ...panels]) {
    if (panel.hidden) { panelAnchors.delete(panel); continue; }
    if (!panelAnchors.has(panel)) panelAnchors.set(panel, { ...anchor, petX: box ? box.x + box.w / 2 : anchor.x, petTop: box?.y ?? anchor.y, petBottom: box ? box.y + box.h : anchor.y });
    const panelAnchor = panelAnchors.get(panel);
    const apron = options.interfaceStyle !== 'classic' && [chat, menu, requests].includes(panel);
    if (apron) panel.style.setProperty('--panel-room', `${Math.max(160, panelAnchor.petTop - 26, innerHeight - panelAnchor.petBottom - 30)}px`);
    const pw = panel.offsetWidth, ph = panel.offsetHeight;
    const placement = apron ? apronPosition({ x: panelAnchor.petX, y: panelAnchor.petTop }, { width: pw, height: ph }, { width: innerWidth, height: innerHeight }, panelAnchor.petBottom) : panelPosition(panelAnchor, { width: pw, height: ph }, { width: innerWidth, height: innerHeight });
    const { x: px, y: py } = placement;
    if (apron) { panel.dataset.tail = box && py >= box.y + box.h / 2 ? 'top' : 'bottom'; placement.offset = Math.max(28, Math.min(pw - 28, (box ? box.x + box.w / 2 : panelAnchor.x) - px)); }
    panel.style.left = `${px}px`; panel.style.top = `${py}px`;
    panel.style.setProperty('--tail', `${apron ? placement.offset : Math.max(22, Math.min(pw - 22, panelAnchor.x - px))}px`);
  }
  const attention = $('attention');
  attention.hidden = !inboxState.total || panels.some(p => !p.hidden);
  const holding = !attention.hidden && (attention.matches(':hover') || document.activeElement === attention);
  if (!holding) panelAnchors.delete(attention);
  else if (!panelAnchors.has(attention)) { const b = attention.getBoundingClientRect(); panelAnchors.set(attention, { x: b.x, y: b.y }); }
  const point = panelAnchors.get(attention) ?? { x: Math.max(8, Math.min(innerWidth - 55, anchor.x + options.size * .25)), y: Math.max(8, Math.min(innerHeight - 38, anchor.y + 15)) };
  Object.assign(attention.style, { left: `${Math.round(Math.max(8, Math.min(innerWidth - attention.offsetWidth - 8, point.x)))}px`, top: `${Math.round(Math.max(8, Math.min(innerHeight - attention.offsetHeight - 8, point.y)))}px` });
}
function speak(result) {
  const source = snapshot.sessions.find(session => session.id === result.sessionId);
  const preview = replyPreview(result.text, 180, options.preferOpeningParagraph !== false);
  const sourceName = sessionName(source) ?? '';
  $('bubble-status').textContent = sourceName;
  bubble.setAttribute('aria-label', uiCopy().finalReply(sourceName || activeName));
  bubbleSession = result.sessionId; bubbleResult = result;
  $('bubble-session').hidden = !bubbleSession;
  $('bubble-expand').hidden = !preview.long;
  bubble.hidden = false;
  panelAnchors.delete(bubble);
  bubble.classList.remove('pop'); void bubble.offsetWidth; bubble.classList.add('pop');
  speech = createSpeech({ text: preview.text, node: $('bubble-text'), immediate: reduced, onCharacter: ch => { sfx.babble(ch); body?.talk(); } });
  shownResults.add(result.id);
  speechExpires = Infinity;
  bubble.dataset.typing = String(!speech.done);
  $('bubble-reveal').hidden = speech.done;
  position();
}
function showNextReply() {
  if (options.quietMode) {
    // Suppress presentation only; opening the envelope is still the read action.
    for (const result of snapshot.results ?? []) shownResults.add(result.id);
    return;
  }
  if (!bubble.hidden || !interaction.hidden || panels.some(p => !p.hidden) || pressing || dragging) return;
  const result = unreadReplies(snapshot, acknowledgedResults).find(r => r.sessionId === snapshot.sessionId && !shownResults.has(r.id));
  if (result) speak(result);
}
function completionHasReply(notice) {
  return ['completed', 'reply', 'goal-progress'].includes(notice?.category) && notice.sessionId === snapshot.sessionId &&
    snapshot.results?.some(result => result.id === `${notice.sessionId}:${notice.turn}:${notice.seq}`);
}
function acknowledge(result) {
  if (!result || result.read) return;
  // Use the identities captured when this reply was shown. A new turn arriving
  // during reading remains unread, even if it belongs to the same session.
  for (const id of result.unreadIds ?? [result.id]) {
    if (acknowledgedResults.has(id)) continue;
    acknowledgedResults.add(id); send({ type: 'read', resultId: id });
  }
}
function openReader(result, queue) {
  if (!result) return;
  interaction.hidden = true;
  clearTimeout(touchTimer); touchBlockedUntil = performance.now() + 1000;
  panels.forEach(p => { p.hidden = true; }); bubble.hidden = true; reader.hidden = false;
  readerResult = result; readerQueue = queue;
  const source = snapshot.sessions.find(s => s.id === result.sessionId);
  const isComp = isCompanionHistory(source);
  $('reader-title').textContent = sessionName(source) ?? uiCopy().sessionReply;
  $('reader-detail').textContent = isComp ? sessionTime({ updatedAt: result.time }, notificationLocale()) : `${source?.project ?? ''} · ${sessionTime({ updatedAt: result.time }, notificationLocale())}`;
  renderReplyMarkdown($('reader-text'), result.text); $('reader-text').scrollTop = 0;
  updateReaderNavigation(); acknowledge(result); updateMood(); position(); $('reader-text').focus();
}
function updateReaderNavigation() {
  const copy = noticeCopy();
  $('reader-caption').textContent = copy.replyCaption; $('reader-inbox').textContent = copy.inbox; $('reader-inbox').hidden = !readerQueue;
  $('reader-session').textContent = copy.continue; $('reader-prev').ariaLabel = copy.previous; $('reader-next').ariaLabel = copy.next;
  $('reader-session').hidden = !!snapshot.sessions.find(session => session.id === readerResult?.sessionId)?.archived;
  const history = readerQueue ?? (snapshot.results ?? []).filter(r => r.sessionId === readerResult?.sessionId);
  const index = history.findIndex(r => r.id === readerResult?.id);
  $('reader-count').textContent = `${Math.max(1, index + 1)} / ${Math.max(1, history.length)}`;
  $('reader-prev').disabled = index <= 0; $('reader-next').disabled = index < 0 || index >= history.length - 1;
  if (readerResult) {
    const source = snapshot.sessions.find(session => session.id === readerResult.sessionId);
    const isComp = isCompanionHistory(source);
    $('reader-detail').textContent = isComp ? sessionTime({ updatedAt: readerResult.time }, notificationLocale()) : `${source?.project ?? ''} · ${sessionTime({ updatedAt: readerResult.time }, notificationLocale())}`;
  }
}
function react(mood) { reactionExpression = undefined; reactionMood = mood; reactionUntil = performance.now() + 700; }
function act(actor, pack, word, exactExpression = false) {
  if (!exactExpression) word = automaticExpression(word);
  if (pack?.vocab.some(w => w.id === word) && (!actor.words || actor.words.includes(word))) actor.do(word);
}
function refreshCompanionCopy() {
  const copy = uiCopy(), summary = companionClient.summary;
  const text = options.companionship === 'off' ? copy.companionDisabled : companionClient.error ? copy.companionUnavailable : summary?.relation.unlocked ? copy.companionFamiliar : summary?.relation.total ? copy.companionProgress(summary.relation.total) : copy.companionNew;
  if ($('companion-status').textContent !== text) $('companion-status').textContent = text;
  if ($('companion-mode').value !== options.companionship) $('companion-mode').value = options.companionship;
  for (const button of document.querySelectorAll('#companion-segments [data-companionship]')) { const checked = button.dataset.companionship === options.companionship; button.setAttribute('aria-checked', String(checked)); button.tabIndex = checked ? 0 : -1; }
  const disabled = options.companionship === 'off' || !!companion.active?.manual;
  if ($('companion-play').disabled !== disabled) $('companion-play').disabled = disabled;
  const hidden = !summary?.invitation.quiet && !(summary?.invitation.laterUntil > Date.now());
  if ($('companion-resume').hidden !== hidden) $('companion-resume').hidden = hidden;
}
function companionBlocked(manual, mood, readingAttention, active) {
  const runtime = notificationState?.runtime, layout = body?.layout;
  return active || mood !== 'idle' || pendingRequests().length > 0 || userInputOccupied() || !interaction.hidden || readingAttention ||
    [...composer.sessions.values()].some(s => !!s.text.trim() || s.phase === 'sending') || pressing || dragging || asleep ||
    !layout || ['air', 'drag', 'crouch'].includes(layout.mode) || layout.busy && !companion.active || hovered && !manual ||
    document.hidden || !!runtime && (runtime.phase !== 'running' || !runtime.visible || runtime.suspended);
}
function companionMessage(key, now = performance.now()) {
  if (options.quietMode) { keepQuietCard('feedback', key); return; }
  companionFeedback.dataset.copy = key;
  companionFeedback.textContent = uiCopy()[key]; companionFeedback.hidden = false; companionFeedbackUntil = now + 3000; panelAnchors.delete(companionFeedback);
}
function updateCompanion(now, mood, readingAttention, active) {
  const mode = options.companionship;
  if (mode === 'off' && companion.mode === 'off') return;
  if (now < hourCheckedAt || now - hourCheckedAt >= 1000) { localHour = new Date().getHours(); hourCheckedAt = now; }
  const manual = companionAction === 'play' || companion.active?.manual;
  // A poke's short expression is presentation, not a busy Host session.
  const blocked = companionBlocked(manual, manual ? sessionActivity(attentionSnapshot).mood : mood, readingAttention, active);
  const summary = companionClient.summary;
  const eligible = !quietInbox.has('invitation') && !!summary?.writable && !companionClient.error && summary.invitation.remaining > 0 && !summary.invitation.quiet && Date.now() >= summary.invitation.laterUntil;
  const inputQuiet = keyboardActivity !== 'idle' || performance.now() - keyboardAt > 2500;
  const result = stepCompanionship(companion, { mode, now, hour: localHour, words: activityWords, occupied: blocked, motionBusy: !!body?.layout?.moving, automatic: options.roam && !reduced && !inputQuiet && !['pointer', 'work'].includes(npc.reason), eligible: eligible && !npc.walkId, unlocked: summary?.relation.unlocked, action: companionAction });
  if (result.showInvitation) diagnosticCounters.event('invitationsShown');
  if (result.hideInvitation && companion.invitation === 'shown' && now >= companion.invitationUntil) diagnosticCounters.event('invitationsExpired');
  companionAction = undefined; companion = result.state;
  diagnosticCounters.activity(companion.active?.kind ?? 'idle');
  pet.dataset.companionship = mode; pet.dataset.companionActivity = companion.active?.kind ?? 'idle';
  if (result.hideInvitation || mode === 'off') companionInvitation.hidden = true;
  if (result.release) {
    if (!result.completed) companionManualId = undefined;
    if (!pressing && !dragging && !['air', 'drag', 'crouch'].includes(body?.layout?.mode)) act(body, activeView, 'stand');
    appliedMood = undefined; actionRestorePending = true; reducedNeedsStep = true;
  }
  if (result.word && !reduced) { act(body, activeView, result.word); reducedNeedsStep = true; }
  if (result.showInvitation) {
    if (options.quietMode) keepQuietCard('invitation', true);
    else { companionInvitation.hidden = false; panelAnchors.delete(companionInvitation); }
  }
  if (result.reserveInvitation) {
    const epoch = companionClient.epoch;
    void companionClient.request('invite').then(receipt => { if (epoch === companionClient.epoch && companion.invitation === 'pending') companionAction = receipt?.applied ? 'reserved' : 'failed'; });
  }
  if (result.completed && companionManualId) {
    const id = companionManualId; companionManualId = undefined;
    companionMessage('companionPlayed', now); void companionClient.request('play', id);
  }
  // A stroke necessarily hovers the pet. Keep its feedback visible while still
  // yielding to work, reading, input and physical interaction.
  if (companionBlocked(true, sessionActivity(attentionSnapshot).mood, readingAttention, active) || mode === 'off' || now >= companionFeedbackUntil) companionFeedback.hidden = true;
  if (mode !== 'off' && activeView && now >= companionReadAt) { companionReadAt = now + 60000; void companionClient.request('read'); }
  refreshCompanionCopy();
}
function updateNpc(now, active, readingAttention) {
  const runtime = notificationState?.runtime, layout = body?.layout;
  const lifecycle = document.hidden || !!runtime && (runtime.phase !== 'running' || !runtime.visible || runtime.suspended);
  const user = userInputOccupied() || !interaction.hidden || readingAttention || hovered || pressing || dragging || asleep ||
    [...composer.sessions.values()].some(s => !!s.text.trim() || s.phase === 'sending') || !!companion.active || !!companion.invitation ||
    !layout || layout.busy || ['air', 'drag', 'crouch', 'sleep'].includes(layout.mode);
  const keyboard = performance.now() - keyboardAt <= 2500 ? keyboardActivity : 'unknown';
  const geometryReady = !native?.nativeGeometry || displayGeometry && innerWidth === displayGeometry.contentBounds.width && innerHeight === displayGeometry.contentBounds.height;
  // A held body's x stays at its old foot anchor while box follows the pointer.
  // Only grounded frames describe a footprint relative to the same anchor.
  if (layout && !layout.busy && !['air', 'drag', 'crouch'].includes(layout.mode)) npcGroundLayout = layout;
  const space = geometryReady ? npcSpace({ width: innerWidth, layout: npcGroundLayout, size: options.size, home: options.npcHome, range: options.npcRange }) : null;
  if (space) space.key += ':' + (displayGeometry?.revision ?? 0);
  npcGeometry = space;
  const result = stepNpc(npc, { enabled: options.companionship !== 'off' && options.roam && !reduced,
    now, space, keyboard, pointer: cursorPoint, layout, words: activityWords, event: npcEvent, relocated: npcRelocated, user, lifecycle,
    work: active || performance.now() < npcWorkUntil, quiet: pendingRequests().length > 0 || ['waiting', 'error'].includes(sessionActivity(attentionSnapshot).mood), canWalk: activeView?.can?.walk === true && localHour >= 7 && localHour < 22 });
  npcEvent = undefined; npcRelocated = false; npc = result.state;
  if (result.stop) body?.stopWalk(result.stop);
  if (result.word && !user && !active) { if (result.word === 'sit') npcSeated = true; else if (result.word === 'stand') npcSeated = false; npcSoundUntil = performance.now() + 3500; act(body, activeView, result.word); }
  if (npcSeated && npc.reason === 'disabled' && !user && layout?.mode === 'sit') { act(body, activeView, 'stand'); npcSeated = false; }
  if (result.place !== undefined) body?.place(result.place, result.place > innerWidth / 2 ? -1 : 1);
  if (result.walk) { npcSoundUntil = performance.now() + 3500; body?.walk(result.walk.x, false, result.walk.id); }
  pet.dataset.npcPhase = npc.phase; pet.dataset.npcReason = npc.reason;
  homeMarker.hidden = !space || options.companionship === 'off' || !options.roam || lifecycle || reduced;
  if (space) { homeMarker.style.left = `${space.home}px`; homeMarker.style.width = `${Math.min(70, options.size * .4)}px`; }
}
let npcWorkUntil = 0;
function attentionToWork() { npcWorkUntil = performance.now() + 12000; }
function startCompanionPlay() {
  closePanels();
  const activity = sessionActivity(attentionSnapshot);
  if (options.companionship === 'off' || companionBlocked(true, activity.mood, false, activity.active)) { companionMessage('companionBusy'); return; }
  if (!companionInvitation.hidden || quietInbox.has('invitation')) diagnosticCounters.event('invitationsAccepted');
  quietInbox.delete('invitation'); refreshInbox();
  companionInvitation.hidden = true; companionAction = 'play'; companionManualId = crypto.randomUUID();
  companionMessage('companionPlaying'); updateMood();
  if (!companion.active?.manual) { companionManualId = undefined; companionMessage('companionNoActivity'); }
}
$('companion-play').onclick = startCompanionPlay;
$('companion-accept').onclick = startCompanionPlay;
for (const [id, type] of [['companion-later', 'later'], ['companion-quiet', 'quiet']]) $(id).onclick = () => {
  diagnosticCounters.event(type === 'later' ? 'invitationsLater' : 'invitationsQuiet');
  quietInbox.delete('invitation'); refreshInbox(); renderRequests(); position();
  companionAction = type; companionInvitation.hidden = true; void companionClient.request(type); updateMood();
};
$('companion-resume').onclick = () => { void companionClient.request('resume'); };
$('companion-mode').onchange = event => {
  const value = companionshipMode(event.target.value);
  if (native) send({ type: 'preference', field: 'companionship', value }); else { applyOptions({ companionship: value }); updateMood(); }
};
$('interface-style').onchange = event => {
  const value = event.target.value === 'classic' ? 'classic' : 'new';
  if (native) send({ type: 'preference', field: 'interfaceStyle', value }); else { applyOptions({ interfaceStyle: value }); render(); }
};
$('default-chat-target').onchange = event => {
  const value = event.target.value === 'last' ? 'last' : 'companion';
  if (native) send({ type: 'preference', field: 'defaultChatTarget', value }); else { applyOptions({ defaultChatTarget: value }); render(); }
};
const segments = [...document.querySelectorAll('#companion-segments [data-companionship]')];
for (const button of segments) {
  button.onclick = () => { $('companion-mode').value = button.dataset.companionship; $('companion-mode').dispatchEvent(new Event('change')); };
  button.onkeydown = event => { const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key]; if (!step && !['Home', 'End'].includes(event.key)) return; event.preventDefault(); const next = segments[event.key === 'Home' ? 0 : event.key === 'End' ? segments.length - 1 : (segments.indexOf(button) + step + segments.length) % segments.length]; next.focus(); next.click(); };
}
function updateMood() {
  // Event callbacks and animation frames must share one live monotonic clock.
  // A requestAnimationFrame timestamp can predate an already processed click.
  const now = performance.now();
  const labels = uiCopy().labels;
  const activity = sessionActivity(attentionSnapshot), active = activity.active;
  if (active || activity.waiting || activity.errors) asleep = false;
  const baseMood = active || activity.waiting || activity.errors ? activity.mood : pendingRequests().length ? 'waiting' : asleep ? 'sleeping' : activity.mood;
  const priority = ['working', 'waiting', 'error'].includes(baseMood);
  if (reactionExpression && (now >= reactionUntil || priority || reduced || pressing || dragging || ['air', 'drag'].includes(body?.layout?.mode) || !body?.words?.includes(reactionExpression) || !options.decisionsReactions)) {
    reactionExpression = undefined; reactionUntil = 0; appliedMood = undefined;
  }
  const holdingReaction = !!reactionExpression && now < reactionUntil;
  const mood = priority || holdingReaction ? baseMood : now < reactionUntil && !userInputOccupied() ? reactionMood : baseMood;
  pet.dataset.replyReaction = holdingReaction ? reactionExpression : '';
  pet.dataset.mood = mood;
  if (!body) return;
  const dialogOpen = panels.some(p => !p.hidden);
  const readingAttention = !$('attention').hidden && ($('attention').matches(':hover') || document.activeElement === $('attention'));
  if (!holdingReaction) { updateCompanion(now, mood, readingAttention, active); updateNpc(now, active, readingAttention); }
  if (!holdingReaction && mood !== appliedMood && !npc.walkId && !companion.active && !body.layout?.busy && (!actionRestorePending || !pressing && !dragging)) {
    reducedNeedsStep = true;
    if (mood !== 'sleeping' && (appliedMood === 'sleeping' || ['sleep', 'sit'].includes(body.layout?.mode))) act(body, activeView, 'stand');
    const { word } = taskExpression(mood);
    if (word) act(body, activeView, word);
    appliedMood = mood;
    actionRestorePending = false;
  }
  const controls = { roam: 'off', dialogOpen: dialogOpen || !interaction.hidden, thinking: mood === 'thinking', thoughtShown: false, expression: holdingReaction ? reactionExpression : automaticExpression(taskExpression(mood).expression ?? (npc.reason === 'none' && !userInputOccupied() && activityWords.includes(npc.emotion) ? npc.emotion : null)), listening: !chat.hidden && !active };
  const key = JSON.stringify(controls);
  if (key !== appliedControls) { body.set(controls); appliedControls = key; }
  $('toggle-roam').setAttribute('aria-checked', String(options.roam));
  $('toggle-sleep').setAttribute('aria-checked', String(asleep));
  $('toggle-sleep').disabled = active; $('toggle-sleep').title = active ? uiCopy().sleepBusy : uiCopy().sleepWake;
  $('toggle-notices').setAttribute('aria-checked', String(options.notifications));
  $('toggle-quiet').setAttribute('aria-checked', String(options.quietMode));
  $('toggle-reactions').setAttribute('aria-checked', String(options.decisionsReactions === true));
  $('reaction-status').textContent = `${options.decisionsProvider === 'openrouter' ? uiCopy().reactionProviderOpenrouter : uiCopy().reactionProviderOpenai} · ${options.reactionStatus?.keyAvailable ? uiCopy().reactionKeyPresent : uiCopy().reactionKeyMissing} · ${uiCopy().reactionCalls}: ${options.reactionStatus?.calls ?? 0}`;
  $('toggle-sound').setAttribute('aria-checked', String(sfx.isOn()));
  $('menu-state').textContent = `${sessionStateLabel(snapshot.sessions?.find(s => s.id === snapshot.sessionId), notificationLocale(), mood)}${snapshot.sessionId ? ' · ' + uiCopy().connected : ''}`;
  const presentation = { type: 'presentation', locale: notificationLocale(), characterId: activeView.id, scheme: activeScheme, name: activeName, mood, sleeping: asleep, sound: sfx.isOn(), ready: !!body.layout };
  const nextTrayKey = JSON.stringify(presentation);
  if (nextTrayKey !== trayKey) { trayKey = nextTrayKey; native?.action(presentation); }
}

function render() {
  attentionSnapshot = sessionAttention.project(snapshot, allRequests());
  applyLocale(); const labels = uiCopy().labels;
  const previous = renderedSessionId;
  const selected = snapshot.sessions.find(session => session.id === snapshot.sessionId);
  const shortIds = shortSessionIds(snapshot.sessions);
  const unreadSources = new Set(unreadReplies(snapshot, acknowledgedResults).map(result => result.sessionId));
  const hasUnread = session => snapshot.results ? unreadSources.has(session.id) : !!session.unread;
  const list = $('conversation-list');
  const query = $('conversation-search').value.trim().toLocaleLowerCase();
  const attentionSources = new Set(attentionSnapshot.sessions.filter(s => ['waiting', 'error'].includes(s.mood)).map(s => s.id));
  const requestSources = new Set(pendingRequests().map(item => item.sessionId));
  const needsYou = s => attentionSources.has(s.id) || requestSources.has(s.id);
  // Harness keeps a blank draft per Workspace; it is not a conversation until something is said in it.
  // Archived conversations are hidden like in Harness's sidebar, except the one still in focus.
  const matches = snapshot.sessions.filter(session => (!session.blank || session.id === snapshot.sessionId) && (!session.archived || session.id === snapshot.sessionId) &&(!pendingOnly || hasUnread(session) || needsYou(session)) && [session.label, session.project, session.cwd, session.prompt, session.id, isCompanionHistory(session) ? sessionName(session) : ''].join(' ').toLocaleLowerCase().includes(query));
  matches.sort((a, b) => Number(isCompanionSession(b)) - Number(isCompanionSession(a)) || Number(needsYou(b)) - Number(needsYou(a)) || Number(hasUnread(b)) - Number(hasUnread(a)) || Number(b.id === snapshot.sessionId) - Number(a.id === snapshot.sessionId) || (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
  const listKey = JSON.stringify([notificationLocale(), query, pendingOnly, matches.map(session => [session.id, companionRole(snapshot, session), session.label, session.prompt, session.cwd, session.updatedAt, session.mood, hasUnread(session), session.chatAvailable, session.archived, session.id === snapshot.sessionId])]);
  if (list.dataset.key !== listKey) {
    const activeId = document.activeElement?.dataset?.sessionId;
    const entries = matches.map(session => {
      const isComp = isCompanionSession(session);
      const card = document.createElement('button'); card.type = 'button'; card.className = isComp ? 'conversation-card companion-card' : 'conversation-card';
      card.dataset.sessionId = session.id; card.dataset.mood = session.mood; card.setAttribute('role', 'option'); card.setAttribute('aria-selected', String(session.id === snapshot.sessionId));
      card.dataset.unread = String(hasUnread(session));
      card.tabIndex = session.id === snapshot.sessionId ? 0 : -1;
      const cardTitleName = sessionName(session);
      card.title = isCompanionHistory(session) ? `${cardTitleName}\n${session.prompt ?? ''}\n${session.id}` : `${session.label}\n${session.prompt ?? ''}\n${session.cwd ?? session.project ?? ''}\n${session.id}`;
      const copy = document.createElement('span'), meta = document.createElement('small'), status = document.createElement('em'), time = document.createElement('span'), name = document.createElement('strong'), detail = document.createElement('small'), prompt = document.createElement('small'), mark = document.createElement('b');
      meta.className = 'session-meta'; status.textContent = `${session.id === snapshot.sessionId ? uiCopy().focused + ' · ' : ''}${sessionStateLabel(session, notificationLocale())}${hasUnread(session) ? ' · ' + uiCopy().unread : ''}${session.chatAvailable === false ? ' · ' + uiCopy().notOpen : ''}${session.archived ? ' · ' + uiCopy().archived : ''}`;
      time.textContent = sessionTime(session, notificationLocale()); meta.append(status, time);
      name.textContent = sessionName(session);
      detail.className = 'session-detail'; detail.textContent = isCompanionHistory(session) ? '' : `${session.cwd || session.project || uiCopy().session} · #${shortIds.get(session.id)}`;
      prompt.className = 'session-prompt'; prompt.textContent = session.prompt && session.prompt !== session.label ? uiCopy().recent(session.prompt) : ''; prompt.hidden = !prompt.textContent;
      mark.textContent = '✓'; mark.setAttribute('aria-hidden', 'true');
      copy.append(meta, name, prompt, detail);
      if (isComp) {
        const portrait = document.createElement('span'); portrait.className = 'companion-card-portrait';
        const img = document.createElement('img'); img.className = 'panel-portrait'; img.alt = '';
        const fallback = $('menu-emblem').cloneNode(true); fallback.removeAttribute('id'); fallback.classList.add('panel-emblem');
        portrait.append(img, fallback);
        card.append(portrait, copy, mark);
      } else {
        card.append(copy, mark);
      }
      return card;
    });
    if (!entries.length) {
      const empty = document.createElement('p'); empty.className = 'conversation-empty'; empty.textContent = query ? uiCopy().emptySearch : pendingOnly ? uiCopy().emptyPending : uiCopy().emptySessions; entries.push(empty);
    }
    list.replaceChildren(...entries); list.dataset.key = listKey; panelStyle.portraits();
    if (activeId) list.querySelector(`[data-session-id="${CSS.escape(activeId)}"]`)?.focus();
  }
  const activity = sessionActivity(attentionSnapshot);
  $('conversation-count').textContent = uiCopy().activity(activity.busy, snapshot.results ? unreadSources.size : activity.unread);
  $('sessions-all').setAttribute('aria-pressed', String(!pendingOnly)); $('sessions-pending').setAttribute('aria-pressed', String(pendingOnly));
  refreshInbox();
  const isSelectedCompanion = isCompanionSession(selected);
  $('chat-current').disabled = !snapshot.sessions.length;
  $('chat-session-name').textContent = isSelectedCompanion ? uiCopy().chatWithMe : (sessionName(selected) ?? uiCopy().noSession);
  $('chat-current').setAttribute('aria-label', selected ? (isSelectedCompanion ? uiCopy().chatTarget(uiCopy().chatWithMe) : uiCopy().chatTarget(sessionName(selected))) : uiCopy().emptySessions);
  $('chat-session-state').textContent = `${sessionStateLabel(selected, notificationLocale())}${selected?.archived ? ' · ' + uiCopy().archived : ''}`;
  $('chat-session-detail').textContent = selected && !isCompanionHistory(selected) ? `${selected.cwd || selected.project || ''} · #${shortIds.get(selected.id)}` : '';
  $('chat-to-companion').hidden = isSelectedCompanion || !snapshot.companionSessionId;
  const latestReply = snapshot.results?.find(r => r.id === selected?.replyId)?.text || selected?.reply || '';
  $('chat-reply').textContent = latestReply ? replyPreview(latestReply, 180, false).text : ''; $('chat-reply').hidden = !latestReply;
  $('chat-read').hidden = !latestReply;
  const archivedTarget = !!selected?.archived;
  const enabled = !!snapshot.sessionId && selected?.chatAvailable !== false && !archivedTarget;
  // The redesigned panel hides the help line; surface the reason where the user looks to type.
  chat.dataset.archived = String(archivedTarget);
  $('message').placeholder = archivedTarget ? uiCopy().archivedChat : uiCopy().messagePlaceholder;
  const draft = composer.state(snapshot.sessionId);
  draftSessionId = snapshot.sessionId;
  if ($('message').value !== draft.text) $('message').value = draft.text;
  $('message').disabled = !enabled || draft.phase === 'sending'; $('send').disabled = !enabled || draft.phase === 'sending';
  $('send').textContent = draft.phase === 'failed' ? uiCopy().retrySend : isSelectedCompanion ? uiCopy().companionSend : uiCopy().send;
  $('chat-send-state').textContent = draft.phase === 'failed' ? uiCopy().sendFailure(draft.code) : uiCopy()[{ sending: 'sending', accepted: 'sendAccepted' }[draft.phase]] ?? '';
  $('chat-send-state').dataset.state = draft.phase; chat.dataset.sendState = draft.phase; $('send').ariaLabel = $('send').textContent; resizeComposer();
  $('conversation-open').disabled = !snapshot.sessionId; $('chat-session').disabled = !snapshot.sessionId;
  $('chat-help').textContent = enabled ? (isSelectedCompanion ? uiCopy().companionChatHelp : uiCopy().chatHelp(sessionName(selected))) : archivedTarget ? uiCopy().archivedChat : snapshot.sessionId ? uiCopy().unavailableChat : uiCopy().noChat;
  if (previous !== snapshot.sessionId) {
    bubble.hidden = true;
    clearTimeout(touchTimer); reactionUntil = 0;
  }
  renderedSessionId = snapshot.sessionId;
  if (!reader.hidden) updateReaderNavigation();
  // Host can enqueue the role notice before the final-result IPC frame. The
  // focused reply then supplies completion presentation for that exact event.
  if (completionHasReply(currentNotice)) { interaction.hidden = true; currentNotice = undefined; }
  showNextReply(); presentNextNotice(); renderRequests(); updateMood(); position();
}

function presentNextNotice() {
  if (options.quietMode || !options.notifications || !interaction.hidden || userOccupied()) return;
  if (notificationState && (notificationState.runtime.phase !== 'running' || !notificationState.runtime.visible || notificationState.runtime.suspended)) return;
  let notice = noticeQueue.next(false, notificationState?.interactions);
  while (notice && completionHasReply(notice)) notice = noticeQueue.next(false, notificationState?.interactions);
  if (!notice) return;
  const available = activeView?.vocab.map(word => word.id).filter(word => !body?.words || body.words.includes(word)) ?? [];
  const current = notificationState && notice.requestIds.length ? { ...notice, requestIds: notice.requestIds.filter(id => pendingRequests().some(item => item.id === id)) } : notice;
  const presentation = notificationPresentation(current, notificationLocale(), available);
  currentNotice = current;
  $('interaction-title').textContent = presentation.title;
  $('interaction-preview').textContent = presentation.body;
  const copy = noticeCopy();
  $('interaction-open').textContent = copy.open; $('interaction-close').ariaLabel = copy.close;
  $('interaction-pending').textContent = copy.pending; $('interaction-pending').hidden = !notice.requestIds.length;
  interaction.hidden = false; panelAnchors.delete(interaction);
  interactionExpires = performance.now() + options.bubbleDurationMs;
  reactionExpression = undefined; reactionMood = presentation.mood; reactionUntil = performance.now() + 2500; asleep = false;
  updateMood();
  if (!reduced && presentation.word && !(presentation.mood === 'error' && appliedMood === 'error' && presentation.word === taskExpression('error').word)) { act(body, activeView, presentation.word); reducedNeedsStep = true; }
  position();
}
function currentInbox() {
  const value = inboxContents(attentionSnapshot, pendingRequests(), acknowledgedResults);
  return { ...value, total: value.total + quietInbox.size };
}
function refreshInbox() {
  const previousCount = inboxState.total;
  inboxState = currentInbox();
  const attention = $('attention'), pendingCount = inboxState.requests.length + inboxState.issues.length + quietInbox.size;
  attention.hidden = !inboxState.total || panels.some(p => !p.hidden);
  $('attention-count').textContent = String(inboxState.total);
  attention.dataset.urgent = String(!!pendingCount);
  attention.title = attention.ariaLabel = noticeCopy().inboxSummary(inboxState.replies.length, pendingCount);
  if (options.quietMode && inboxState.total > previousCount && !attention.hidden && !reduced) {
    attention.classList.remove('inbox-pulse'); void attention.offsetWidth; attention.classList.add('inbox-pulse');
  }
}
function keepQuietCard(key, value) {
  if (JSON.stringify(quietInbox.get(key)) === JSON.stringify(value)) return;
  quietInbox.set(key, value); refreshInbox(); renderRequests(); position();
}
function renderQuietCards() {
  const copy = uiCopy();
  replaceInboxList($('inbox-local'), JSON.stringify([notificationLocale(), options.interfaceStyle, [...quietInbox]]), () => [...quietInbox].map(([key, value]) => {
    const card = document.createElement('article'), label = document.createElement('strong'), actions = document.createElement('div');
    card.className = 'inbox-card inbox-local'; card.dataset.localKind = key;
    const button = (text, action, run) => {
      const node = document.createElement('button'); node.textContent = text; node.dataset.inboxKey = key; node.dataset.action = action;
      node.onclick = run; actions.append(node);
    };
    if (key === 'invitation') {
      label.textContent = copy.companionInvite;
      button(copy.companionTogether, 'play', startCompanionPlay);
      for (const [id, text] of [['later', copy.companionLater], ['quiet', copy.companionQuietToday]]) button(text, id, () => $('companion-' + id).click());
    } else {
      const notice = key === 'notice' ? appNoticeCopy(value, notificationLocale()) : null;
      label.textContent = notice ? notice.title : copy[value];
      if (notice) { const text = document.createElement('p'); text.textContent = notice.body; card.append(text); }
      button(noticeCopy().close, 'dismiss', () => { quietInbox.delete(key); refreshInbox(); renderRequests(); position(); });
    }
    card.prepend(label); card.append(actions); return card;
  }));
}
function renderRequests() {
  if (requests.hidden) return;
  const copy = noticeCopy();
  inboxState = currentInbox();
  const { requests: items, issues, replies } = inboxState;
  const sources = new Map(snapshot.sessions.map(session => [session.id, session])), shortIds = shortSessionIds(snapshot.sessions);
  const sourceDetail = id => { const session = sources.get(id); if (isCompanionHistory(session)) return ''; return [session?.project || session?.cwd, `#${shortIds.get(id) ?? id}`].filter(Boolean).join(' · '); };
  $('requests-title').textContent = copy.inboxTitle; $('inbox-caption').textContent = copy.inboxCaption; $('requests-close').ariaLabel = copy.close;
  $('inbox-count').textContent = copy.inboxSummary(replies.length, items.length + issues.length + quietInbox.size);
  if (options.interfaceStyle !== 'classic') {
    const waiting = document.createElement('span'), fresh = document.createElement('span');
    waiting.textContent = copy.inboxWaiting(items.length + issues.length + quietInbox.size);
    fresh.textContent = copy.inboxFresh(replies.length);
    $('inbox-count').replaceChildren(waiting, fresh);
    if (!inboxState.total) $('requests-title').textContent = copy.inboxCaughtUp;
  }
  const curFocus = sources.get(snapshot.sessionId); $('inbox-focus').textContent = copy.focus(sessionName(curFocus) ?? '—');
  $('inbox-empty').textContent = copy.inboxEmpty; $('inbox-empty').hidden = !!inboxState.total;
  const keys = [notificationLocale(), options.interfaceStyle, snapshot.companionSessionId, snapshot.sessions.map(session => [session.id, session.companionRole, session.label, session.project, session.cwd])];
  renderQuietCards();
  replaceInboxList($('request-list'), JSON.stringify([...keys, items, [...snoozing.keys()], options.reminders, options.notifications, options.inlineQuestions, questionForms.revision, approvalForms.revision]), () => items.map(item => {
    const card = document.createElement('article'); card.className = 'request-card';
    const label = document.createElement('strong'), preview = document.createElement('p'), meta = document.createElement('small'), actions = document.createElement('div');
    label.textContent = item.kind === 'question' ? copy.questionLabel : copy.approvalLabel;
    preview.textContent = item.preview;
    const session = snapshot.sessions.find(session => session.id === item.sessionId);
    meta.textContent = `${sessionName(session) ?? item.sessionId}${item.state === 'continued' ? ' · ' + copy.continued : ''}${item.dueAt ? ' · ' + copy.delay + ': ' + new Intl.DateTimeFormat(notificationLocale(), { hour: '2-digit', minute: '2-digit' }).format(item.dueAt) : ''}`;
    const open = document.createElement('button'); open.textContent = item.kind === 'question' ? copy.handleHarness : copy.handle; open.dataset.requestId = item.id; open.dataset.inboxKey = item.id; open.dataset.action = 'open'; open.onclick = () => {
      inboxReceipts.remember(continuedInboxKey(item));
      noticeQueue.discard(notice => notice.requestIds?.length && notice.requestIds.every(id => allRequests().some(request => request.id === id && inboxReceipts.hides(request))));
      openSession(item.sessionId);
    };
    const later = document.createElement('button'); later.textContent = snoozing.has(item.id) ? copy.snoozing : copy.snooze; later.dataset.requestId = item.id; later.dataset.inboxKey = item.id; later.dataset.action = 'snooze'; later.disabled = snoozing.has(item.id) || !options.notifications || options.reminders === false;
    later.onclick = () => { snoozing.set(item.id, { dueAt: item.dueAt, expiresAt: performance.now() + 10000 }); $('request-feedback').textContent = ''; send({ type: 'notification-snooze', interactionId: item.id, generation: notificationState.runtime.generation }); renderRequests(); };
    actions.append(open);
    if (!(item.kind === 'approval' && item.approvalCommand?.kind === 'shell' && !item.approvalCommand.command)) actions.append(later);
    card.append(label);
    if (item.kind === 'approval') {
      const words = petCopy(notificationLocale()), detail = item.approvalCommand;
      if (detail?.kind === 'shell') {
        if (detail.command) {
          const command = document.createElement('pre'); command.className = 'approval-command'; command.textContent = detail.command; card.append(command);
          if (detail.workdir) { const directory = document.createElement('small'); directory.className = 'approval-workdir'; directory.textContent = words.approvalWorkdir(detail.workdir); card.append(directory); }
        } else { const warning = document.createElement('p'); warning.className = 'approval-command-missing'; warning.textContent = words.approvalCommandMissing; card.append(warning); }
      }
      preview.className = 'approval-reason'; preview.textContent = words.approvalModelReason + item.preview; card.append(preview);
      if (detail?.kind !== 'shell') { const hint = document.createElement('small'); hint.className = 'approval-detail-hint'; hint.textContent = words.approvalDetailHarness; card.append(hint); }
    } else card.append(preview);
    card.append(meta);
    const form = item.kind === 'question' && options.inlineQuestions !== false ? questionForms.render(item, notificationState.runtime.generation, copy, options.interfaceStyle !== 'classic') : undefined;
    if (item.kind === 'approval') { open.textContent = petCopy(notificationLocale()).approvalOpen; card.append(approvalForms.render(item, notificationState.runtime.generation, petCopy(notificationLocale()))); }
    if (form) {
      if (options.interfaceStyle !== 'classic') {
        const submit = form.querySelector('button[type=submit]'), footer = document.createElement('div');
        footer.className = 'inline-question-actions'; submit.replaceWith(footer); footer.append(open, submit);
      }
      card.append(form);
    }
    card.append(actions); return card;
  }));
  replaceInboxList($('inbox-issues'), JSON.stringify([...keys, issues.map(session => [session.id, session.mood, session.text])]), () => issues.map(session => {
    const card = document.createElement('article'); card.className = 'inbox-card inbox-issue';
    const meta = document.createElement('small'), label = document.createElement('strong'), preview = document.createElement('p'), actions = document.createElement('div'), open = document.createElement('button');
    meta.textContent = `${session.mood === 'error' ? copy.errorLabel : copy.waitingLabel} · ${sourceDetail(session.id)}`;
    label.textContent = sessionName(session); preview.textContent = session.mood === 'error' ? petCopy(notificationLocale()).issueError : petCopy(notificationLocale()).issueWaiting;
    open.textContent = copy.handle; open.dataset.inboxKey = session.id; open.dataset.action = 'open'; open.onclick = () => openSession(session.id);
    actions.append(open); card.append(meta, label, preview, actions); return card;
  }));
  // Confirmed reply text is immutable for its result id; avoid rescanning long bodies on live frames.
  replaceInboxList($('inbox-replies'), JSON.stringify([...keys, replies.map(result => [result.id, result.sessionId, result.time, !!sources.get(result.sessionId)?.archived])]), () => replies.map(result => {
    const card = document.createElement('article'); card.className = 'inbox-card inbox-reply';
    const content = document.createElement('button'), meta = document.createElement('small'), label = document.createElement('strong'), preview = document.createElement('span'), detail = document.createElement('small'), actions = document.createElement('div'), open = document.createElement('button');
    content.className = 'inbox-content'; content.dataset.resultId = result.id; content.dataset.inboxKey = result.id; content.dataset.action = 'read';
    content.ariaLabel = `${copy.readReply} · ${sessionName(sources.get(result.sessionId)) ?? result.sessionId}`;
    // Capture the queue at the explicit read action so incoming replies cannot reorder it.
    content.onclick = () => openReader(result, currentInbox().replies.map(item => ({ ...item })));
    meta.textContent = `${copy.newReply} · ${sessionTime({ updatedAt: result.time }, notificationLocale())}`;
    const replySession = sources.get(result.sessionId);
    label.textContent = sessionName(replySession) ?? result.sessionId;
    preview.className = 'inbox-preview'; preview.textContent = replyPreview(result.text, 180, false).text;
    const detailPart = sourceDetail(result.sessionId);
    detail.textContent = detailPart ? `${detailPart} · ${copy.readReply}` : copy.readReply;
    content.append(meta, label, preview, detail);
    open.textContent = copy.continue; open.dataset.resultId = result.id; open.dataset.inboxKey = result.id; open.dataset.action = 'open'; open.onclick = () => { acknowledge(result); continueSession(result.sessionId); };
    // An archived source can still be read here, but must be restored before the conversation continues.
    open.hidden = !!replySession?.archived;
    const read = document.createElement('button'); read.className = 'inbox-read'; read.textContent = copy.readReply; read.onclick = content.onclick;
    actions.append(open, read); card.append(content, actions); return card;
  }));
}
function replaceInboxList(list, key, build) {
  if (list.dataset.key === key) return;
  const focused = list.contains(document.activeElement) ? document.activeElement.dataset : undefined;
  list.replaceChildren(...build()); list.dataset.key = key; list.hidden = !list.children.length;
  if (focused?.inboxKey) (list.querySelector(`[data-inbox-key="${CSS.escape(focused.inboxKey)}"][data-action="${focused.action}"]`) ?? $('requests-close')).focus();
}
function openRequests(autoRead = true) {
  approvalForms.opened();
  clearTimeout(touchTimer); interaction.hidden = true; bubble.hidden = true; $('request-feedback').textContent = '';
  const contents = currentInbox();
  if (autoRead !== false && contents.replies.length === 1 && contents.total === 1) { openReader(contents.replies[0], contents.replies.map(item => ({ ...item }))); return; }
  panels.forEach(panel => { panel.hidden = panel !== requests; });
  renderRequests(); updateMood(); position(); $('requests-close').focus();
}
$('requests-close').onclick = closePanels;
$('interaction-close').onclick = () => {
  const notice = currentNotice;
  const source = snapshot.sessions.find(s => s.id === notice?.sessionId);
  if (notice && source?.attentionId === JSON.stringify([notice.sessionId, 'issue', notice.category, notice.turn, notice.seq])) acknowledgeIssue(source.id);
  for (const item of allRequests()) if (notice?.requestIds?.includes(item.id)) inboxReceipts.remember(continuedInboxKey(item));
  interaction.hidden = true; currentNotice = undefined; render(); presentNextNotice(); showNextReply();
};
$('interaction-open').onclick = () => openSession(currentNotice?.sessionId);
$('interaction-pending').onclick = () => openRequests(false);

function applyOptions(value) {
  const previousSize = options.size, previousCompanionship = options.companionship;
  options = { ...options, ...value, companionship: Object.hasOwn(value ?? {}, 'companionship') ? companionshipMode(value.companionship) : options.companionship, textScale: Object.hasOwn(value ?? {}, 'textScale') ? textScale(value.textScale) : options.textScale };
  if (options.quietMode) {
    noticeQueue.clear(); interaction.hidden = true; currentNotice = undefined;
    bubble.hidden = true; speech = undefined;
    if (!companionInvitation.hidden) quietInbox.set('invitation', true);
    if (!companionFeedback.hidden && companionFeedback.dataset.copy) quietInbox.set('feedback', companionFeedback.dataset.copy);
    if (!$('toast').hidden && toastNotice) quietInbox.set('notice', toastNotice);
    companionInvitation.hidden = companionFeedback.hidden = $('toast').hidden = true;
    clearTimeout(toastTimer);
    for (const result of snapshot.results ?? []) shownResults.add(result.id);
  }
  if (options.companionship === 'off') quietInbox.delete('invitation');
  panelStyle.set(options.interfaceStyle); panelStyle.portraits(); $('interface-style').value = options.interfaceStyle === 'classic' ? 'classic' : 'new';
  $('default-chat-target').value = options.defaultChatTarget === 'last' ? 'last' : 'companion';
  diagnosticCounters.configure(options.diagnostics === true);
  document.documentElement.style.setProperty('--size', `${options.size}px`);
  document.documentElement.style.setProperty('--text-scale', String(options.textScale));
  if (options.companionship !== previousCompanionship && activeView) { void companionClient.load(activeView.id); companionReadAt = performance.now() + 60000; }
  if (options.size !== previousSize) body?.set({ bounds: bounds() });
  // Keep DOM, captured reader result, composer, speech and expiry clocks intact.
  position();
}
// Font reflow and async Markdown/locale layout changes need fresh panel bounds.
const panelResize = new ResizeObserver(() => position());
for (const panel of [bubble, interaction, companionInvitation, companionFeedback, ...panels, $('attention')]) panelResize.observe(panel);

function receive(message) {
  if (!message || typeof message !== 'object') return;
  switch (message.type) {
    case 'reaction': {
      const activity = sessionActivity(attentionSnapshot);
      const expression = reactionFor(message, snapshot, { now: Date.now(), words: body?.words?.filter(w => activeView?.vocab.some(v => v.id === w)) ?? [], blocked: !options.decisionsReactions || reduced || pressing || dragging || ['air', 'drag'].includes(body?.layout?.mode) || ['working', 'waiting', 'error'].includes(activity.mood) || pendingRequests().length > 0 });
      if (!expression) break;
      reactionExpression = expression; reactionMood = activity.mood; reactionUntil = performance.now() + 2500;
      // C02 is an explicit opt-in choice; C05's ordinary error/NPC mapping stays unchanged.
      act(body, activeView, expression, true); reducedNeedsStep = true; updateMood(); break;
    }
    case 'init':
      pendingSelectionId = undefined;
      inboxReceipts.load(message.dismissedInbox);
      applyOptions(message.options);
      if (message.snapshot) snapshot = message.snapshot;
      // Recovery restores unread results as an inbox baseline, without speaking them again.
      if (message.baseline) for (const result of snapshot.results ?? []) shownResults.add(result.id);
      pet.dataset.hostReady = 'true';
      body?.set({ bounds: bounds() }); render(); break;
    case 'configure': {
      const changed = Object.keys(message.options ?? {}).some(key => !['textScale', 'size', 'companionship', 'diagnostics', 'npcHome', 'npcRange'].includes(key) && options[key] !== message.options[key]);
      applyOptions(message.options);
      if (changed) render();
      else updateMood();
      break;
    }
    case 'keyboard-activity':
      if (['idle', 'active', 'unknown'].includes(message.value)) {
        keyboardActivity = message.value; keyboardAt = performance.now();
        keyboardBackend = ['macos', 'windows', 'x11', 'none'].includes(message.backend) ? message.backend : 'none';
        keyboardStatus = ['disabled', 'starting', 'available', 'unsupported-platform', 'unsupported-session', 'missing-dependency', 'failed', 'stale', 'unavailable', 'protocol-error'].includes(message.status) ? message.status : 'unavailable';
      }
      break;
    case 'diagnostics-read':
      if (options.diagnostics === true && typeof message.requestId === 'string' && /^[a-f0-9]{32}$/.test(message.requestId)) {
        native?.diagnosticsRespond?.({ requestId: message.requestId, value: {
          npc: { phase: npc.phase, reason: npc.reason, keyboard: performance.now() - keyboardAt <= 2500 ? keyboardActivity : 'unknown', keyboardBackend, keyboardStatus: performance.now() - keyboardAt <= 2500 ? keyboardStatus : 'stale', targetValid: !!npcGeometry && npc.target !== null && npc.target >= npcGeometry.min - .01 && npc.target <= npcGeometry.max + .01, compact: false },
          mode: options.companionship, activity: companion.active?.kind ?? 'idle', invitation: companion.invitation ?? 'none',
          mood: sessionActivity(attentionSnapshot).mood, careUnavailable: !!companionClient.error, hidden: document.hidden, hour: new Date().getHours(),
          queues: { carePending: companionClient.pending, pendingInteractions: pendingRequests().length, composerSessions: composer.sessions.size,
            chatTimers: chatTimers.size, snoozing: snoozing.size, shownResults: shownResults.size, acknowledgedResults: acknowledgedResults.size },
          counts: diagnosticCounters.snapshot(), heapBytes: performance.memory?.usedJSHeapSize ?? 0, nodes: document.getElementsByTagName('*').length,
        } });
      }
      break;
    case 'ui-control':
      if (message.command === 'chat') openChat();
      else if (message.command === 'sessions') openRequests();
      else if (message.command === 'sleep') $('toggle-sleep').click();
      else if (message.command === 'sound') $('toggle-sound').click();
      break;
    case 'characters': $('open-characters').click(); break;
    case 'snapshot':
      if (JSON.stringify((message.snapshot.sessions ?? []).map(s => [s.id, s.revision, s.mood])) !== JSON.stringify((snapshot.sessions ?? []).map(s => [s.id, s.revision, s.mood]))) attentionToWork();
      // A read acknowledgement may already be in flight when the user chooses
      // its source. Keep that explicit choice until the host acknowledges it.
      if (message.snapshot.sessionId === pendingSelectionId || !message.snapshot.sessions.some(session => session.id === pendingSelectionId)) pendingSelectionId = undefined;
      snapshot = { ...message.snapshot, sessionId: pendingSelectionId ?? message.snapshot.sessionId, results: message.snapshot.results ?? snapshot.results ?? [] }; render(); break;
    case 'chat-result':
      if (composer.receive(message)) {
        clearTimeout(chatTimers.get(message.requestId)); chatTimers.delete(message.requestId); render();
      }
      break;
    case 'notification-state': {
      const value = message.snapshot;
      if (!value || value.protocol !== 1 || !Array.isArray(value.interactions)) break;
      if (notificationState && value.runtime.generation !== notificationState.runtime.generation) { noticeQueue.clear(); interaction.hidden = true; currentNotice = undefined; snoozing.clear(); }
      if (notificationState && value.runtime.generation === notificationState.runtime.generation && pendingInteractions(value).some(item => !pendingRequests().some(old => old.id === item.id))) attentionToWork();
      questionForms.retain(value.interactions, value.runtime.generation);
      approvalForms.retain(value.interactions, value.runtime.generation, petCopy(notificationLocale()));
      notificationState = value;
      for (const [id, pending] of snoozing) { const item = value.interactions.find(item => item.id === id); if (!item || item.state === 'settled' || item.dueAt !== pending.dueAt) snoozing.delete(id); }
      if (currentNotice?.requestIds.length && !currentNotice.requestIds.some(id => pendingRequests().some(item => item.id === id))) { interaction.hidden = true; currentNotice = undefined; }
      if (value.runtime.phase !== 'running' || !value.runtime.visible || value.runtime.suspended) { noticeQueue.clear(); interaction.hidden = true; }
      render(); break;
    }
    case 'question-answer-result': { questionForms.receipt(message); break; }
    case 'approval-answer-result': { approvalForms.receipt(message, petCopy(notificationLocale())); break; }
    case 'notification-snooze-result': {
      snoozing.delete(message.interactionId);
      if (!message.ok) $('request-feedback').textContent = noticeCopy().unavailable;
      renderRequests(); break;
    }
    case 'notice': {
      attentionToWork();
      if (options.quietMode) {
        if (!message.notice.category && message.notice.kind !== 'task') keepQuietCard('notice', message.notice);
        break;
      }
      if (!options.notifications) break;
      if (message.notice.requestIds?.length && message.notice.requestIds.every(id => allRequests().some(item => item.id === id && inboxReceipts.hides(item)))) break;
      if (message.notice.category && message.notice.id) {
        if (notificationState && (notificationState.runtime.phase !== 'running' || !notificationState.runtime.visible || notificationState.runtime.suspended)) break;
        noticeQueue.push(message.notice); presentNextNotice(); break;
      }
      // Task notices are expressed by the body and inbox, not another status card.
      if (message.notice.kind === 'task') { body?.cue('perk'); break; }
      noticeSession = message.notice.sessionId;
      toastNotice = message.notice;
      const toast = appNoticeCopy(message.notice, notificationLocale());
      $('toast-title').textContent = toast.title;
      $('toast-body').textContent = toast.body;
      $('toast').hidden = false; clearTimeout(toastTimer);
      toastTimer = setTimeout(() => { $('toast').hidden = true; }, options.bubbleDurationMs); break;
    }
    case 'hit-state': pet.dataset.nativeHit = String(message.active); break;
    case 'cursor': {
      if (!displayGeometry || message.revision !== displayGeometry.revision) break;
      const point = viewportPoint(message, displayGeometry.contentBounds, { width: innerWidth, height: innerHeight });
      hit(point.x, point.y); break;
    }
    case 'display-changed': {
      if (!Number.isSafeInteger(message.revision) || message.revision <= (displayGeometry?.revision ?? 0)) break;
      const interrupted = pressing || dragging || ['drag', 'air'].includes(body?.layout?.mode);
      if (displayGeometry && (message.displayId !== displayGeometry.displayId || interrupted)) {
        pendingDisplayPlacement = { ...(resizeOrigin ?? { ratio: (body?.layout?.x ?? stageWidth * .6) / stageWidth, facing: body?.layout?.facing ?? 1 }), drop: interrupted };
      }
      if (pressing) {
        // API 2 drop clears its held pointer after the new bounds arrive.
        // pointer(cancel) first would turn drag into air and make drop a no-op.
        if (pressedPointerId !== undefined && pet.hasPointerCapture(pressedPointerId)) pet.releasePointerCapture(pressedPointerId);
        pressing = false; dragging = false; pressedPointerId = undefined;
      }
      displayGeometry = message;
      pet.dataset.displayId = String(message.displayId); pet.dataset.displayRevision = String(message.revision);
      cursorPoint = undefined; lastHit = false; native?.hit(false);
      resizeStage(); break;
    }
  }
}

function hit(px, py) {
  cursorPoint = { x: px, y: py };
  const active = pressing || body?.hit({ x: px, y: py }) || [...document.querySelectorAll('.interactive')].some(el => {
    if (el === pet || el.closest('[hidden]')) return false;
    const b = el.getBoundingClientRect();
    return px >= b.left - 2 && px <= b.right + 2 && py >= b.top - 2 && py <= b.bottom + 2;
  });
  if (!!active !== lastHit) { lastHit = !!active; native?.hit(lastHit); }
}

function openChat(forceDefault = true) {
  if (forceDefault && options.defaultChatTarget !== 'last' && snapshot.companionSessionId) {
    if (snapshot.sessionId !== snapshot.companionSessionId) {
      chooseSession(snapshot.companionSessionId);
      render();
    }
  }
  interaction.hidden = true; clearTimeout(touchTimer); touchBlockedUntil = performance.now() + 1000; panels.forEach(p => { p.hidden = true; }); bubble.hidden = true; chat.hidden = false; updateMood(); position(); if (!$('message').disabled) $('message').focus();
}
function openConversations(pending = false) {
  if (!snapshot.sessions.length) return;
  interaction.hidden = true;
  pendingOnly = pending === true;
  $('conversation-search').value = '';
  panels.forEach(p => { p.hidden = true; }); bubble.hidden = true; conversations.hidden = false; render();
  ($('conversation-list').querySelector('[aria-selected=true]') ?? $('conversation-list').querySelector('button'))?.focus();
}
function closePanels() { interaction.hidden = true; panels.forEach(p => { p.hidden = true; }); render(); }
pet.addEventListener('pointerdown', event => {
  if (event.button !== 0) return;
  touchBlockedUntil = 0; clearTimeout(touchTimer);
  sfx.unlock(); pressing = true; dragging = false; dragPoint = dragStart = { x: event.clientX, y: event.clientY };
  pressedPointerId = event.pointerId; pet.setPointerCapture(event.pointerId);
  body?.pointer('down', { x: event.clientX, y: event.clientY, t: event.timeStamp });
});
function release(event) {
  if (!pressing) return;
  const moved = dragging;
  // A desktop drag places the pet. Forwarding up would turn pointer speed into
  // a throw, including a rebound when the body reaches the screen edge.
  if (moved) body?.drop(event.type === 'pointercancel' ? dragPoint : { x: event.clientX, y: event.clientY });
  else body?.pointer(event.type === 'pointercancel' ? 'cancel' : 'up', { x: event.clientX, y: event.clientY, t: event.timeStamp });
  pressing = false; dragging = false; pressedPointerId = undefined;
  if (event.type === 'pointerup' && native && moved) send({ type: 'move-display' });
}
pet.addEventListener('pointerup', release); pet.addEventListener('pointercancel', release);
// The upstream body owns poke, stroke, wake, grab and drop. Respond to its
// authenticated touch events instead of layering an unrelated random click on top.
function onBody(kind, detail) {
  if (['arrived', 'interrupted'].includes(kind) && Number.isSafeInteger(detail.walkId) && detail.walkId > 0 && detail.walkId === npc.walkId) { npcEvent = { kind, walkId: detail.walkId }; return; }
  if (kind !== 'touch') return;
  if (detail.kind === 'grab') {
    clearTimeout(touchTimer);
    // Body events arrive with a later animation frame. A completed drag must
    // not close a panel opened by a subsequent double-click.
    if (pressing) { closePanels(); bubble.hidden = true; }
    return;
  }
  if (detail.kind === 'poke' && detail.woke) { asleep = false; appliedMood = undefined; }
  if (detail.kind === 'poke' || detail.kind === 'pet') {
    if (performance.now() < touchBlockedUntil) return;
    clearTimeout(touchTimer);
    touchTimer = setTimeout(() => {
      if (panels.some(p => !p.hidden)) return;
      if (!sessionActivity(attentionSnapshot).active) react('happy');
    }, 280);
  }
}
pet.addEventListener('dblclick', openChat);
pet.addEventListener('keydown', event => { if (event.target === pet && ['Enter', ' '].includes(event.key)) { event.preventDefault(); openChat(); } });
pet.addEventListener('contextmenu', event => { event.preventDefault(); clearTimeout(touchTimer); const open = menu.hidden; panels.forEach(p => { p.hidden = true; }); bubble.hidden = true; menu.hidden = !open; interaction.hidden = true; updateMood(); position(); if (!menu.hidden) $('open-characters').focus(); });
pet.addEventListener('pointerenter', () => { hovered = true; }); pet.addEventListener('pointerleave', () => { hovered = false; });
$('chat-current').onclick = openConversations;
$('chat-to-companion').onclick = () => {
  if (!snapshot.companionSessionId) return;
  chooseSession(snapshot.companionSessionId);
  render();
  openChat(false);
};
$('menu-chat').onclick = openChat;
$('menu-close').onclick = closePanels;
$('conversation-search').oninput = render;
$('sessions-all').onclick = () => { pendingOnly = false; render(); };
$('sessions-pending').onclick = () => { pendingOnly = true; render(); };
$('attention').onclick = () => openRequests();
$('conversation-list').onkeydown = event => {
  const cards = [...$('conversation-list').querySelectorAll('button')], current = cards.indexOf(document.activeElement);
  if (!cards.length || !['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
  event.preventDefault();
  const next = event.key === 'Home' ? 0 : event.key === 'End' ? cards.length - 1 : (current + (event.key === 'ArrowDown' ? 1 : -1) + cards.length) % cards.length;
  cards[next].focus();
};
$('conversations-close').onclick = closePanels;
$('chat-close').onclick = closePanels;
$('dismiss').onclick = () => { bubble.hidden = true; acknowledge(bubbleResult); showNextReply(); };
$('bubble-reveal').onclick = () => { speech?.finish(); };
$('bubble-expand').onclick = () => openReader(bubbleResult);
$('chat-read').onclick = () => openReader(unreadReplies(snapshot, acknowledgedResults).find(r => r.sessionId === snapshot.sessionId) ?? (snapshot.results ?? []).find(r => r.id === snapshot.sessions.find(s => s.id === snapshot.sessionId)?.replyId));
$('reader-close').onclick = closePanels;
for (const [id, offset] of [['reader-prev', -1], ['reader-next', 1]]) $(id).onclick = () => {
  const history = readerQueue ?? (snapshot.results ?? []).filter(r => r.sessionId === readerResult?.sessionId);
  openReader(history[history.findIndex(r => r.id === readerResult?.id) + offset], readerQueue);
};
$('reader-inbox').onclick = () => openRequests(false);
$('reader-session').onclick = () => { acknowledge(readerResult); continueSession(readerResult?.sessionId); };
$('conversation-list').onclick = event => {
  const card = event.target.closest('[data-session-id]');
  const session = card && snapshot.sessions.find(item => item.id === card.dataset.sessionId);
  if (!session) return;
  conversations.hidden = true;
  if (session.id !== snapshot.sessionId) chooseSession(session.id);
  const result = unreadReplies(snapshot, acknowledgedResults).find(r => r.sessionId === session.id);
  if (result) openReader(result); else if (snapshot.companionSessionId) { render(); openChat(false); } else render();
};
function continueSession(id) {
  if (!id || !snapshot.sessions.some(session => session.id === id)) return;
  chooseSession(id); render(); openChat(false);
}
function chooseSession(id) {
  pendingSelectionId = native ? id : undefined;
  snapshot = { ...snapshot, sessionId: id };
  send({ type: 'select', sessionId: id });
}
function acknowledgeIssue(id) {
  if (sessionAttention.acknowledge(snapshot, allRequests(), id)) {
    reactionUntil = 0; appliedMood = undefined;
    noticeQueue.discard(notice => notice.sessionId === id && !notice.requestIds.length && ['error', 'blocked', 'interrupted', 'max-tokens'].includes(notice.category));
  }
}
function openSession(id) {
  if (!id) return;
  acknowledgeIssue(id);
  for (const item of allRequests()) if (item.sessionId === id) inboxReceipts.remember(continuedInboxKey(item));
  noticeQueue.discard(notice => notice.requestIds?.length && notice.requestIds.every(id => allRequests().some(item => item.id === id && inboxReceipts.hides(item))));
  send({ type: 'open-session', sessionId: id }); bubble.hidden = true; closePanels();
}
$('conversation-open').onclick = () => openSession(snapshot.sessionId);
$('chat-session').onclick = () => openSession(snapshot.sessionId);
$('bubble-session').onclick = () => { acknowledge(bubbleResult); openSession(bubbleSession); };
function resizeComposer() {
  const node = $('message'); if (options.interfaceStyle === 'classic') return;
  node.style.height = 'auto';
  const line = parseFloat(getComputedStyle(node).lineHeight) || 22;
  node.style.height = `${Math.min(line * 5 + 12, Math.max(line + 12, node.scrollHeight))}px`;
}
$('message').oninput = () => { composer.edit(draftSessionId, $('message').value); resizeComposer(); };
$('message').addEventListener('focus', resizeComposer);
$('chat-form').onsubmit = event => {
  event.preventDefault();
  const sessionId = snapshot.sessionId;
  if (!sessionId || snapshot.sessions.find(session => session.id === sessionId)?.chatAvailable === false) return;
  composer.edit(sessionId, $('message').value);
  const request = composer.begin(sessionId);
  if (!request) return;
  clearTimeout(touchTimer); render();
  clearTimeout(chatTimers.get(request.requestId));
  chatTimers.set(request.requestId, setTimeout(() => { chatTimers.delete(request.requestId); if (composer.expire(request)) render(); }, 15000));
  send(request);
  if (!native) {
    receive({ type: 'chat-result', sessionId, requestId: request.requestId, status: 'accepted' });
    demoState(sessionId, 'thinking');
    setTimeout(() => demoComplete(sessionId, uiCopy().demoReply(request.text)), 350);
  }
};
function preference(field) {
  if (native) send({ type: 'preference', field, value: !options[field] });
  else { applyOptions({ [field]: !options[field] }); render(); }
}
$('toggle-roam').onclick = () => preference('roam');
$('toggle-sleep').onclick = () => { if ($('toggle-sleep').disabled) return; asleep = !asleep; if (!asleep) react('happy'); menu.hidden = true; bubble.hidden = true; updateMood(); };
$('toggle-notices').onclick = () => preference('notifications');
$('toggle-quiet').onclick = () => preference('quietMode');
$('toggle-reactions').onclick = () => preference('decisionsReactions');
$('hide').onclick = () => { if (native) send({ type: 'hide' }); else closePanels(); };
$('toast').onclick = () => { $('toast').hidden = true; openSession(noticeSession); };
document.addEventListener('keydown', event => { if (event.key === 'Escape') closePanels(); });
$('message').onkeydown = event => { if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) { event.preventDefault(); $('chat-form').requestSubmit(); } };
document.querySelectorAll('[data-gesture]').forEach(button => { button.onclick = () => {
  closePanels(); act(body, activeView, button.dataset.gesture === 'wave' ? 'wave' : 'love');
  if (!snapshot.active) react('happy');
}; });
document.addEventListener('pointerdown', () => sfx.unlock(), { capture: true });
document.addEventListener('pointermove', event => {
  const point = { x: event.clientX, y: event.clientY, t: event.timeStamp };
  if (pressing) dragPoint = point;
  if (pressing && !dragging && Math.hypot(point.x - dragStart.x, point.y - dragStart.y) > 6) {
    dragging = true; npcRelocated = true; clearTimeout(touchTimer); closePanels(); bubble.hidden = true;
  }
  const activity = sessionActivity(attentionSnapshot);
  const canCare = options.companionship !== 'off' && !activity.active && activity.mood === 'idle' && !pendingRequests().length && !userInputOccupied() && !asleep && interaction.hidden && ['idle', 'look', 'sit'].includes(body?.layout?.mode);
  if (companionStroke.move(point, { trusted: event.isTrusted, over: canCare && !!body?.hit(point), pressing, now: performance.now() })) { void companionClient.request('pet'); companionMessage('companionPetThanks'); }
  body?.pointer('move', point); hit(point.x, point.y);
});
document.addEventListener('pointerleave', () => {
  body?.pointer('leave', {});
  if (!pressing) { cursorPoint = undefined; lastHit = false; native?.hit(false); }
});
function resizeStage() {
  if (innerWidth !== stageWidth) resizeOrigin ??= { ratio: (body?.layout?.x ?? stageWidth * .6) / stageWidth, facing: body?.layout?.facing ?? 1 };
  stageWidth = innerWidth;
  resizeLayout = body?.layout;
  body?.set({ bounds: bounds() });
  // Native geometry and viewport resize can arrive in either order. Placement
  // waits until this viewport reflects the newly acknowledged content bounds.
  if (pendingDisplayPlacement && innerWidth === displayGeometry?.contentBounds.width && innerHeight === displayGeometry?.contentBounds.height) {
    const targetX = innerWidth * pendingDisplayPlacement.ratio;
    if (pendingDisplayPlacement.drop) { const b = bounds(); body?.drop({ x: targetX, y: b.floorY - 220 * b.S }); }
    else body?.place(targetX, pendingDisplayPlacement.facing);
    pendingDisplayPlacement = undefined;
  }
  if (innerWidth === displayGeometry?.contentBounds.width && innerHeight === displayGeometry?.contentBounds.height) resizeOrigin = undefined;
  previewBody?.set({ bounds: previewBounds() }); position();
}
addEventListener('resize', resizeStage);
$('toggle-sound').onclick = () => { sfx.set(!sfx.isOn()); updateMood(); };


let geometryReportedAt = -Infinity;
let last = performance.now(), companionCadence = { at: -Infinity, elapsed: 0 };
function animate(now) {
  const dt = Math.min((now - last) / 1000, .05); last = now;
  for (const [id, pending] of snoozing) if (now >= pending.expiresAt) { snoozing.delete(id); $('request-feedback').textContent = noticeCopy().unavailable; renderRequests(); }
  if (!options.notifications || options.quietMode) { noticeQueue.clear(); interaction.hidden = true; }
  if (!interaction.hidden) {
    if (interaction.matches(':hover') || interaction.contains(document.activeElement)) interactionExpires = now + options.bubbleDurationMs;
    if (now >= interactionExpires) { interaction.hidden = true; currentNotice = undefined; showNextReply(); }
  }
  presentNextNotice();
  updateMood();
  if (!reduced && pet.dataset.mood === 'talking' && now >= talkAt) { body?.talk(); talkAt = now + 180; }
  // Only P1's fully idle pose renders at 30fps. Work and input retain the original cadence.
  // Accumulate real dt so rendering fewer frames never slows physics.
  const companionIdle = options.companionship !== 'off' && pet.dataset.mood === 'idle' && !companion.active && !hovered && !pressing && !dragging && !reducedNeedsStep && body?.layout && !body.layout.moving && !userInputOccupied() && ![...composer.sessions.values()].some(s => !!s.text.trim() || s.phase === 'sending') && interaction.hidden && companionInvitation.hidden;
  companionCadence = advanceRenderCadence(companionCadence, now, dt, companionIdle);
  if (companionCadence.paint) {
    body?.tick(reduced && !reducedNeedsStep && !pressing && !['air', 'drag', 'wake'].includes(body.layout?.mode) ? 0 : companionCadence.dt);
    reducedNeedsStep = false;
  }
  if (!characters.hidden || libraryBusy) previewBody?.tick(reduced ? 0 : dt);
  if (speech && !bubble.hidden) {
    if (reduced) speech.finish(); else speech.step(dt);
    bubble.dataset.typing = String(!speech.done); $('bubble-reveal').hidden = speech.done;
    if (speech.done && speechExpires === Infinity) speechExpires = now + options.bubbleDurationMs;
    if (bubble.matches(':hover') || bubble.contains(document.activeElement)) speechExpires = now + options.bubbleDurationMs;
    if (now >= speechExpires) { bubble.hidden = true; showNextReply(); }
  }
  position();
  if (options.diagnostics === true && now - geometryReportedAt >= 500) {
    geometryReportedAt = now; const r = pet.getBoundingClientRect();
    native?.geometry?.({ at: Date.now(), pet: { x: r.x, y: r.y, width: r.width, height: r.height }, viewport: { x: 0, y: 0, width: innerWidth, height: innerHeight } });
  }
  // The character can walk beneath a stationary cursor, or away from it.
  if (cursorPoint) hit(cursorPoint.x, cursorPoint.y);
  requestAnimationFrame(animate);
}
requestAnimationFrame(animate);

const demoTimers = new Map();
function demoState(id, mood, text = '') {
  clearTimeout(demoTimers.get(id));
  const session = snapshot.sessions.find(s => s.id === id);
  if (!session) return;
  Object.assign(session, { mood, active: ['thinking', 'talking', 'working', 'waiting'].includes(mood), text, updatedAt: Date.now(), revision: (session.revision ?? 0) + 1 });
  if (id === snapshot.sessionId) snapshot = { ...snapshot, ...session, sessionId: id };
  render();
}
function demoComplete(id, text) {
  const session = snapshot.sessions.find(s => s.id === id);
  const result = { id: `${id}:${Date.now()}:${snapshot.results.length}`, sessionId: id, text, time: Date.now(), read: false };
  snapshot.results.push(result);
  Object.assign(session, { reply: text, replyId: result.id, unread: (session.unread ?? 0) + 1 });
  demoState(id, 'happy', text);
  demoTimers.set(id, setTimeout(() => demoState(id, 'idle'), 2500));
}

if (native) native.subscribe(receive);
else {
  document.body.classList.add('preview'); $('demo').hidden = false;
  options.size = 190; document.documentElement.style.setProperty('--size', '190px');
  snapshot.results = [];
  snapshot.sessionId = 'demo'; snapshot.sessions = [
    { id: 'demo', label: uiCopy().demoSession, project: 'dsh-coopanion', cwd: '/workspace/dsh-coopanion', prompt: uiCopy().demoPrompt, createdAt: Date.now() - 3600000, updatedAt: Date.now(), mood: 'idle', text: snapshot.text, revision: 0 },
    { id: 'demo-notes', label: uiCopy().demoOther, project: 'dsh-coopanion', cwd: '/workspace/dsh-coopanion', prompt: uiCopy().demoOtherPrompt, createdAt: Date.now() - 7200000, updatedAt: Date.now() - 1800000, mood: 'idle', text: '', revision: 0 },
  ];

  document.querySelectorAll('[data-demo]').forEach(button => { button.onclick = () => {
    const mood = button.dataset.demo;
    if (mood === 'happy') demoComplete(snapshot.sessionId, uiCopy().demoTexts.happy);
    else if (mood === 'long') demoComplete(snapshot.sessionId, uiCopy().demoLong);
    else if (mood === 'background') demoComplete(snapshot.sessions.find(s => s.id !== snapshot.sessionId).id, uiCopy().demoBackground);
    else demoState(snapshot.sessionId, mood, uiCopy().demoTexts[mood]);
  }; });
  y = innerHeight - pet.offsetHeight - 42; render();
}

async function setCharacter(view, scheme = '') {
  const next = await loadBody({ layer: $('body-layer'), pack: view, start: { x: body?.layout?.x ?? innerWidth * .68, facing: body?.layout?.facing ?? 1, scheme }, theme: 'light', bounds: bounds(),
    onSound: (name, kind, ...args) => { if (!(options.companionship !== 'off' && (npc.walkId || performance.now() < npcSoundUntil) && !companion.active && sessionActivity(attentionSnapshot).mood === 'idle' && performance.now() >= npcWorkUntil && !pressing && !dragging && !hovered && !userInputOccupied() && !sessionActivity(attentionSnapshot).active)) sfx.play(name, kind, ...args); },
    onEvent: (kind, detail) => { if (body === next) onBody(kind, detail); },
    onError: error => { characterStatus('bodyError', error.message); if (body === next && view.id !== BUILTIN_ID) void restoreBuiltin(); },
  });
  if (npc.walkId) body?.stopWalk(npc.walkId);
  npc = initialNpc(++npcGeneration); npcEvent = undefined; npcRelocated = false; npcGeometry = undefined; npcGroundLayout = undefined; npcSeated = false;
  quietInbox.clear(); refreshInbox();
  companionStroke.reset(); companion = initialCompanionship(); companionAction = companionManualId = undefined; companionInvitation.hidden = companionFeedback.hidden = true;
  body?.dispose(); body = next; body.set({ bounds: bounds() }); activeView = view; activeScheme = knownScheme(view, scheme); activeName = nameIn(view.name);
  actionRestorePending = false; activityWords = view.vocab.map(w => w.id).filter(w => next.words?.includes(w)); hourCheckedAt = -Infinity;
  // A new body has not reported its geometry yet. Retire the previous body's
  // input region until position() receives the new body's first frame.
  pet.hidden = true; delete pet.dataset.mode; delete pet.dataset.pressing;
  appliedMood = appliedControls = undefined;
  if (options.companionship !== 'off') { void companionClient.load(view.id); companionReadAt = performance.now() + 60000; } else { companionClient.epoch++; companionClient.characterId = view.id; companionClient.summary = null; }
  sfx.usePack(view.base, view.sounds);
  pet.dataset.character = view.id; pet.dataset.scheme = activeScheme;
  applyAppearance();
  pet.setAttribute('aria-label', uiCopy().petLabel(activeName));
  render();
}
function applyAppearance() {
  const preset = activeView.presets.find(p => p.id === activeScheme);
  const accent = preset?.accent ?? activeView.axes[0]?.options.find(o => o.id === activeScheme)?.accent ?? '#4d6bfe';
  document.documentElement.style.setProperty('--skin-eye', accent);
  document.documentElement.style.setProperty('--accent', preset?.console?.light.a ?? accent);
  document.documentElement.style.setProperty('--action', actionInk(preset?.console?.light.a ?? accent));
  document.documentElement.style.setProperty('--accent2', preset?.console?.light.a2 ?? accent);
  $('chat-character').textContent = activeName; $('menu-name').textContent = activeName;
  const thumb = preset?.thumb ?? activeView.thumb;
  $('menu-portrait').hidden = !thumb; $('menu-emblem').hidden = !!thumb;
  if (thumb) { $('menu-portrait').src = new URL(activeView.base + thumb, location.href).href; $('menu-portrait').onerror = () => { $('menu-portrait').hidden = true; $('menu-emblem').hidden = false; panelStyle.portraits(); }; }
  panelStyle.portraits();
  trayKey = undefined; updateMood();
}
async function restoreBuiltin() {
  try { const view = await library.load(BUILTIN_ID); await setCharacter(view); await library.select(BUILTIN_ID, activeScheme); }
  catch (error) { characterStatus('builtinError', error.message); }
}
function setBusy(value) {
  libraryBusy = value;
  for (const id of ['character-select', 'character-import', 'character-use', 'character-scheme', 'character-action', 'character-test']) $(id).disabled = value;
  for (const el of $('character-axes').querySelectorAll('select')) el.disabled = value;
  $('character-use').disabled = value || !previewCharacter;
  $('character-remove').disabled = value || $('character-select').value === BUILTIN_ID;
}
function fillSchemes(pack, scheme) {
  previewScheme = knownScheme(pack, scheme);
  const choices = pack.presets.map(p => new Option(nameIn(p.name) || p.id, p.id));
  choices.push(new Option(pack.axes.length ? uiCopy().customOutfit : uiCopy().defaultScheme, '__custom'));
  $('character-scheme').replaceChildren(...choices);
  $('character-scheme').value = pack.presets.some(p => p.id === previewScheme) ? previewScheme : '__custom';
  const preset = pack.presets.find(p => p.id === previewScheme), parts = previewScheme.split('-');
  $('character-axes').replaceChildren(...pack.axes.map((axis, i) => {
    const label = document.createElement('label'); label.textContent = nameIn(axis.name);
    const select = document.createElement('select'); select.dataset.axis = axis.id; select.setAttribute('aria-label', nameIn(axis.name));
    select.replaceChildren(...axis.options.map(o => new Option(nameIn(o.name), o.id)));
    select.value = preset?.pick[axis.id] ?? parts[i]; label.append(select); return label;
  }));
  $('character-axes').hidden = pack.axes.length === 0 || (pack.axes.length === 1 && pack.axes[0].options.every(o => pack.presets.some(p => p.pick[pack.axes[0].id] === o.id)));
}
async function preview(id) {
  previewCharacter = undefined; previewBody?.dispose(); previewBody = undefined;
  const view = await library.load(id);
  fillSchemes(view, libraryState.schemes[id]);
  $('character-action').replaceChildren(...view.vocab.map(w => new Option(wordName(w, view), w.id)));
  $('character-action').value = view.vocab.some(w => w.id === 'wave') ? 'wave' : view.vocab[0]?.id ?? '';
  const next = await loadBody({ layer: $('character-preview'), pack: view, start: { x: previewBounds().W / 2, facing: 1, scheme: previewScheme }, theme: 'light', bounds: previewBounds(),
    onError: error => { previewCharacter = undefined; characterStatus('previewError', error.message); setBusy(false); },
  });
  previewBody = next; previewBody.set({ roam: 'off' }); previewCharacter = view;
  $('character-about').textContent = nameIn(view.about);
  $('character-credit').textContent = uiCopy().authorCredit(view.author ?? uiCopy().unknownAuthor, view.credits?.map(c => c.name).join('、') ?? '', view.builtin ? uiCopy().builtinLicense : view.license ?? uiCopy().authorLicense);
  setCopyNode('character-use', pet.dataset.character === id ? 'using' : 'useCharacter');
}
async function refreshCharacters(selected) {
  libraryState = await library.list();
  $('character-select').replaceChildren(...libraryState.characters.map(pack => new Option(nameIn(pack.name), pack.id)));
  $('character-select').value = selected ?? libraryState.selected;
  if (!$('character-select').value) $('character-select').value = BUILTIN_ID;
  await preview($('character-select').value);
  if (libraryState.problems.length) characterStatus('operationError', libraryState.problems.join('; '));
}
async function characterOperation(operation) {
  if (libraryBusy) return;
  setBusy(true);
  try { await operation(); }
  catch (error) { characterStatus('operationError', String(error.message ?? error).slice(0, 400)); }
  finally { setBusy(false); position(); }
}
$('open-characters').onclick = () => {
  closePanels(); bubble.hidden = true; characters.hidden = false; position();
  void characterOperation(() => refreshCharacters(pet.dataset.character));
};
$('characters-close').onclick = () => { previewBody?.dispose(); previewBody = undefined; closePanels(); };
$('character-select').onchange = () => void characterOperation(() => preview($('character-select').value));
$('character-scheme').onchange = () => void characterOperation(async () => {
  const scheme = $('character-scheme').value;
  const custom = [...$('character-axes').querySelectorAll('select')].map(el => el.value).join('-');
  fillSchemes(previewCharacter, scheme === '__custom' ? custom : scheme);
  await previewBody?.setScheme(previewScheme, { fade: reduced ? 0 : .25 });
  setCopyNode('character-use', 'useScheme');
});
$('character-axes').onchange = () => void characterOperation(async () => {
  const scheme = [...$('character-axes').querySelectorAll('select')].map(el => el.value).join('-');
  fillSchemes(previewCharacter, scheme);
  await previewBody?.setScheme(previewScheme, { fade: reduced ? 0 : .25 });
  setCopyNode('character-use', 'useOutfit');
});
$('character-test').onclick = () => { if (previewBody && previewCharacter) act(previewBody, previewCharacter, $('character-action').value, true); };
$('character-import').onclick = () => $('character-file').click();
$('character-file').onchange = () => void characterOperation(async () => {
  const file = $('character-file').files[0]; if (!file) return;
  try {
    if (file.size > PACK_LIMIT) throw new Error(uiCopy().packTooLarge);
    const after = await library.import(await file.arrayBuffer());
    await refreshCharacters(after.importedId);
    characterStatus('imported');
  } finally { $('character-file').value = ''; }
});
$('character-use').onclick = () => void characterOperation(async () => {
  if (!previewCharacter) return;
  const scheme = previewScheme;
  if (activeView?.id === previewCharacter.id && activeView.revision === previewCharacter.revision) {
    await body.setScheme(scheme, { fade: reduced ? 0 : .25 }); activeScheme = scheme; pet.dataset.scheme = scheme;
    applyAppearance();
  } else await setCharacter(previewCharacter, scheme);
  await library.select(previewCharacter.id, scheme);
  setCopyNode('character-use', 'using'); characterStatus('switched');
});
$('character-remove').onclick = () => void characterOperation(async () => {
  const id = $('character-select').value;
  if (pet.dataset.character === id) await restoreBuiltin();
  previewBody?.dispose(); previewBody = undefined;
  await library.remove(id); await refreshCharacters(); characterStatus('removed');
});
applyOptions({});
void (async () => {
  setBusy(true);
  try {
    libraryState = await library.list();
    try { await setCharacter(await library.load(libraryState.selected), libraryState.schemes[libraryState.selected]); }
    catch (error) { await restoreBuiltin(); characterStatus('restoreError', String(error.message ?? error).slice(0, 300)); }
  } catch (error) { characterStatus('loadError', error.message); }
  finally { setBusy(false); }
})();
