import { appendFileSync, chmodSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright-core';

// Headless Chromium on macOS runners can initialize one WebGL context
// and then refuse the independent character-preview context. Use ANGLE's
// software WebGL backend for browser tests; native Electron is not wrapped.
if (process.platform !== 'darwin' || !process.env.GITHUB_ENV || !process.env.RUNNER_TEMP) {
  throw new Error('This setup is only for the isolated macOS CI browser lane');
}
const quote = value => `'${value.replaceAll("'", "'\\''")}'`;
const wrapper = join(process.env.RUNNER_TEMP, 'coopanion-test-chromium');
writeFileSync(wrapper, `#!/bin/sh\nexec ${quote(chromium.executablePath())} --use-angle=swiftshader "$@"\n`);
chmodSync(wrapper, 0o700);
appendFileSync(process.env.GITHUB_ENV, `CHROMIUM_PATH=${wrapper}\n`);
console.log('macOS CI browser: ANGLE SwiftShader; native Electron backend unchanged');
