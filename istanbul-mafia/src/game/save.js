// Kayıt sistemi: masaüstünde (Electron) dosyaya (atomik yazım + yedek), tarayıcıda localStorage'a yazar.
const PREFIX = 'istanbul-mafia-save-';
export const SLOTS = ['auto', '1', '2', '3'];

function bridge() { return typeof window !== 'undefined' && window.desktop ? window.desktop : null; }

// Not: tarayıcı yolunda gövde senkron çalışır (beforeunload içinde güvenle çağrılabilir).
export async function writeSave(slot, data) {
  const json = JSON.stringify({ v: 1, time: Date.now(), data });
  const b = bridge();
  if (b) { try { return await b.writeSave(slot, json); } catch (e) { return false; } }
  try {
    // önceki kaydı yedekle: yazım yarıda kalırsa (kota vb.) yedekten dönülür
    const prev = localStorage.getItem(PREFIX + slot);
    if (prev) localStorage.setItem(PREFIX + slot + '.bak', prev);
    localStorage.setItem(PREFIX + slot, json);
    return true;
  } catch (e) { return false; }
}

function parse(json) {
  if (!json) return null;
  try { const r = JSON.parse(json); return r && r.data ? r : null; } catch (e) { return null; }
}

export async function readSave(slot) {
  const b = bridge();
  try {
    if (b) return parse(await b.readSave(slot)); // masaüstü: bozuksa yedeği ana süreç döndürür
    return parse(localStorage.getItem(PREFIX + slot)) || parse(localStorage.getItem(PREFIX + slot + '.bak'));
  } catch (e) { return null; }
}

export async function listSaves() {
  const out = {};
  const rs = await Promise.all(SLOTS.map((s) => readSave(s)));
  SLOTS.forEach((s, i) => {
    const r = rs[i];
    if (r) out[s] = { time: r.time, money: r.data.money, respect: r.data.respect, day: r.data.day, mission: r.data.storyIndex, name: r.data.name, play: r.data.stats && r.data.stats.playTime };
  });
  return out;
}

// en son yazılan kayıt: { slot, ...bilgi } ya da null
export async function latestSave(saves) {
  const all = saves || await listSaves();
  let best = null;
  for (const [slot, info] of Object.entries(all)) if (!best || info.time > best.time) best = { slot, ...info };
  return best;
}

export async function deleteSave(slot) {
  const b = bridge();
  if (b) return b.deleteSave(slot);
  try { localStorage.removeItem(PREFIX + slot); localStorage.removeItem(PREFIX + slot + '.bak'); } catch (e) { /* yok say */ }
  return true;
}

export function loadSettings() {
  try { return JSON.parse(localStorage.getItem('istanbul-mafia-settings') || 'null'); } catch (e) { return null; }
}
export function storeSettings(s) {
  try { localStorage.setItem('istanbul-mafia-settings', JSON.stringify(s)); } catch (e) { /* yok say */ }
}
