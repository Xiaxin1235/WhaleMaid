import type { PanelStatus } from '../src/panel-api/contract.js'

export const snapshot: PanelStatus = {
  version: '1.1.0',
  startedAt: 1000,
  dataDir: 'D:/test/whaledot',
  language: 'auto',
  coopanion: false,
  store: { state: 'ok', corruptRows: 0 },
  paused: false,
  services: {
    gateway: true,
    commands: true,
    userQuestions: false,
    approval: false,
    permissionPresets: true,
    tools: true,
  },
}
