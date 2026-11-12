const { contextBridge, ipcRenderer } = require('electron');
async function characterCall(channel, value) {
  const result = await ipcRenderer.invoke(channel, value);
  if (!result.ok) throw new Error(result.error);
  return result.value;
}
contextBridge.exposeInMainWorld('dshPetBridge', {
  nativeGeometry: true,
  inboxReceipt: key => ipcRenderer.invoke('pet:inbox-receipt', key),
  ...(process.argv.includes('--dsh-pet-window-test') ? { testWindow: value => ipcRenderer.invoke('pet:test-window', value) } : {}),
  ...(process.argv.includes('--dsh-pet-display-test') ? { testScreenPoint: value => ipcRenderer.invoke('pet:test-screen-point', value) } : {}),
  subscribe(callback) {
    const listener = (_event, message) => callback(message);
    ipcRenderer.on('pet:update', listener);
    return () => ipcRenderer.removeListener('pet:update', listener);
  },
  // Chat carries its immutable target and client request identity unchanged.
  action(value) { ipcRenderer.send('pet:action', value); },
  hit(active) { ipcRenderer.send('pet:hit', active); },
  geometry(value) { ipcRenderer.send('pet:geometry', value); },
  diagnosticsRespond: value => ipcRenderer.send('pet:diagnostics-response', value),
  companionship: value => characterCall('pet:companionship', value),
  characters: {
    list: () => characterCall('pet:characters:list'),
    load: id => characterCall('pet:characters:load', id),
    select: (id, scheme = '') => characterCall('pet:characters:select', { id, scheme }),
    remove: id => characterCall('pet:characters:remove', id),
    import: bytes => characterCall('pet:characters:import', bytes),
  },
});
