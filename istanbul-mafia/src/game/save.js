// Kayıt sistemi: masaüstünde (Electron) dosyaya, tarayıcıda localStorage'a yazar.
const PREFIX = 'istanbul-mafia-save-';
export const SLOTS = ['auto', '1', '2', '3'];

function bridge() { return typeof window !== 'undefined' && window.desktop ? window.desktop : null; }

export async function writeSave(slot, data) {
  const json = JSON.stringify({ v: 1, time: Date.now(), data });
  const b = bridge();
  if (b) return b.writeSave(slot, json);
  try { localStorage.setItem(PREFIX + slot, json); return true; } catch (e) { return false; }
}

export async function readSave(slot) {
  const b = bridge();
  let json = null;
  try { json = b ? await b.readSave(slot) : localStorage.getItem(PREFIX + slot); } catch (e) { json = null; }
  if (!json) return null;
  try { return JSON.parse(json); } catch (e) { return null; }
}

export async function listSaves() {
  const out = {};
  for (const s of SLOTS) {
    const r = await readSave(s);
    if (r) out[s] = { time: r.time, money: r.data.money, respect: r.data.respect, day: r.data.day, mission: r.data.storyIndex, name: r.data.name, play: r.data.stats && r.data.stats.playTime };
  }
  return out;
}

export async function deleteSave(slot) {
  const b = bridge();
  if (b) return b.deleteSave(slot);
  try { localStorage.removeItem(PREFIX + slot); } catch (e) { /* yok say */ }
  return true;
}

export function loadSettings() {
  try { return JSON.parse(localStorage.getItem('istanbul-mafia-settings') || 'null'); } catch (e) { return null; }
}
export function storeSettings(s) {
  try { localStorage.setItem('istanbul-mafia-settings', JSON.stringify(s)); } catch (e) { /* yok say */ }
}
