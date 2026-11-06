import { mkdir, writeFile } from 'node:fs/promises';
import { READY_MS } from '../../web/upstream/body-host.js';

/** Match the runtime's first-body initialization budget, leaving interaction limits unchanged. */
export function observeBodyReady(page, label) {
  const messages = [];
  page.on('console', message => {
    if (['error', 'warning'].includes(message.type()) && messages.length < 12) messages.push(message.text().slice(0, 500));
  });
  return async (selector = '#pet[data-mode]') => {
    try { await page.waitForSelector(selector, { timeout: READY_MS }); }
    catch (error) {
      const startup = { label, capturedAt: new Date().toISOString(), console: messages, frames: [] };
      console.error('Browser body startup timeout:', JSON.stringify({ label, console: messages }));
      for (const frame of page.frames().slice(0, 4)) startup.frames.push(await Promise.race([
        frame.evaluate(() => ({
          readyState: document.readyState,
          pet: document.querySelector('#pet') ? { hidden: document.querySelector('#pet').hidden, ...document.querySelector('#pet').dataset } : null,
          characterStatus: document.querySelector('#character-status')?.textContent,
          canvas: [...document.querySelectorAll('canvas')].map(canvas => ({ width: canvas.width, height: canvas.height })),
        })).catch(() => ({ unavailable: true })),
        new Promise(resolve => setTimeout(() => resolve({ timeout: true }), 1500)),
      ]));
      await mkdir('artifacts', { recursive: true });
      const path = `artifacts/browser-startup-${label}-${Date.now()}`;
      await writeFile(path + '.json', JSON.stringify(startup, null, 2) + '\n', { flag: 'wx' });
      await page.screenshot({ path: path + '.png', timeout: 2000 }).catch(() => {});
      console.error('Browser body startup state:', JSON.stringify(startup));
      throw error;
    }
  };
}
