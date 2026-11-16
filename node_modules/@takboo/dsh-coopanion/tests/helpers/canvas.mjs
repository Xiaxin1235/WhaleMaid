import { setTimeout } from 'node:timers/promises';

/** Poll inside the canvas's own sandbox frame, leaving rendering time between readbacks. */
export async function waitForCanvasChange(canvas, previous) {
  const deadline = Date.now() + 12000;
  while (Date.now() < deadline) {
    const pixels = await canvas.evaluate(element => element.toDataURL());
    if (pixels !== previous) return pixels;
    await setTimeout(50);
  }
  throw new Error('Animation pixels did not change within the existing 12000ms UI limit');
}
