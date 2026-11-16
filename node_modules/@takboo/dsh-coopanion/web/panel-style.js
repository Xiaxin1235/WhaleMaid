// SPDX-License-Identifier: AGPL-3.0-or-later
/** Layout and accessible ink for the optional panel skin. No task state lives here. */
export function contrast(a, b = '#ffffff') {
  const luminance = hex => {
    const rgb = hex.slice(1).match(/../g).map(v => parseInt(v, 16) / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4);
    return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;
  };
  const [x, y] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (x + .05) / (y + .05);
}
export function actionInk(accent) {
  // Imported characters may use any CSS color, including short hex or named colors.
  if (!/^#[0-9a-f]{6}$/i.test(accent)) {
    const paint = globalThis.document?.createElement('canvas').getContext('2d');
    if (paint) { paint.fillStyle = accent; accent = paint.fillStyle; }
    if (!/^#[0-9a-f]{6}$/i.test(accent)) accent = '#344bbb';
  }
  const rgb = accent.slice(1).match(/../g).map(v => parseInt(v, 16));
  let color = accent;
  while (contrast(color) < 5.5) {
    for (let i = 0; i < 3; i++) rgb[i] = Math.floor(rgb[i] * .96);
    color = '#' + rgb.map(v => v.toString(16).padStart(2, '0')).join('');
  }
  return color;
}
export function apronPosition(anchor, panel, viewport, petBottom = anchor.y) {
  const x = Math.max(8, Math.min(viewport.width - panel.width - 8, anchor.x - panel.width / 2));
  const below = anchor.y < panel.height + 26 && petBottom + panel.height + 26 <= viewport.height;
  const y = Math.max(8, Math.min(viewport.height - panel.height - 12, below ? petBottom + 18 : anchor.y - panel.height - 18));
  return { x, y, tail: below ? 'top' : 'bottom', offset: Math.max(28, Math.min(panel.width - 28, anchor.x - x)) };
}

export function createPanelStyle(document) {
  const $ = id => document.getElementById(id), root = document.documentElement;
  let active = false, moves = [], extras = [];
  const element = (tag, className, parent) => { const node = document.createElement(tag); node.className = className; parent.append(node); extras.push(node); return node; };
  const move = (node, target) => { const marker = document.createComment('classic position'); node.before(marker); moves.push([node, marker]); target.append(node); };
  function set(value) {
    const next = value !== 'classic';
    if (active === next) return;
    const focused = document.activeElement;
    active = next; root.classList.toggle('redesigned', active);
    if (!active) {
      for (const [node, marker] of moves.reverse()) { marker.replaceWith(node); }
      for (const node of extras) node.remove();
      moves = []; extras = [];
      $('message').style.removeProperty('height');
    } else {
      for (const id of ['chat', 'menu', 'requests']) {
        const panel = $(id), header = panel.querySelector('header'); header.classList.add('apron');
        if (id !== 'menu') {
          const portrait = element('span', 'portrait', header); header.prepend(portrait);
          const img = element('img', 'panel-portrait', portrait); img.alt = '';
          const fallback = $('menu-emblem').cloneNode(true); fallback.removeAttribute('id'); fallback.classList.add('panel-emblem'); portrait.append(fallback);
          extras.push(fallback);
        }
        const rings = element('span', 'apron-rings', header); rings.setAttribute('aria-hidden', 'true');
        if (id === 'chat') {
          const targets = element('div', 'chat-targets', header.querySelector('.conversation-heading'));
          move($('chat-current'), targets); move($('chat-to-companion'), targets);
          const chevron = document.createElementNS('http://www.w3.org/2000/svg', 'svg'), path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
          chevron.classList.add('chat-chevron'); chevron.setAttribute('viewBox', '0 0 24 24'); chevron.setAttribute('aria-hidden', 'true'); chevron.setAttribute('stroke', 'currentColor');
          path.setAttribute('d', 'M6 9l6 6 6-6'); chevron.append(path); $('chat-current').append(chevron); extras.push(chevron);
        }
        if (id === 'requests') move($('inbox-count'), header.querySelector('.conversation-heading'));
        if (id === 'menu') {
          const title = element('strong', 'menu-question', $('menu-name').parentElement);
          title.dataset.i18n = 'menuQuestion'; $('menu-name').after(title);
        }
        const label = $(id === 'chat' ? 'chat-character' : id === 'menu' ? 'menu-name' : 'inbox-caption');
        const identity = element('span', 'apron-identity', label.parentElement); label.before(identity);
        const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        icon.setAttribute('viewBox', '0 0 24 24'); icon.setAttribute('aria-hidden', 'true');
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', id === 'requests' ? 'M3 5h18v14H3ZM3 5l9 8 9-8' : 'M12 14V6M12 6c-1.5-2-4-2.5-5-1M12 6c1.5-2 4-2.5 5-1M7 18c2 2 8 2 10 0');
        icon.append(path); identity.append(icon); extras.push(icon); move(label, identity);
        if (id !== 'requests') {
          const content = element('div', 'panel-content', panel);
          for (const node of [...panel.children]) if (node !== header && node !== content) move(node, content);
          if (id === 'chat') {
            const previous = element('div', 'chat-previous', content); $('chat-reply').before(previous);
            move($('chat-reply'), previous); move($('chat-read'), previous);
            const composer = element('div', 'chat-composer', $('chat-form'));
            $('chat-form').prepend(composer); move($('message'), composer); move($('send'), composer);
          }
        }
      }
    }
    for (const header of document.querySelectorAll('#chat>header,#menu>header,#requests>header')) header.classList.toggle('apron', active);
    if (focused?.isConnected) focused.focus({ preventScroll: true });
  }
  function portraits() {
    const original = $('menu-portrait');
    for (const img of document.querySelectorAll('.panel-portrait')) {
      img.hidden = original.hidden;
      if (img.nextElementSibling) img.nextElementSibling.hidden = !original.hidden;
      if (!original.hidden) { img.src = original.src; img.onerror = () => { img.hidden = true; img.nextElementSibling.hidden = false; }; }
    }
  }
  return { set, portraits };
}
