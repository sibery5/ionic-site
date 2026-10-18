// Sıralama tabloları. Her kat ve her günlük mücadele için cihazdaki en iyi 10 tur.
// Hanın kurgusal sakinleri (Rıza Usta vb.) rakip olarak tabloda durur: onları geçmek bir hedef.
// Çevrimiçi (dünya) sıralaması için sunucu ya da Steam leaderboard desteği gerekir; steamworks.js 0.4 bunu sunmuyor.

export interface BoardEntry {
  name: string;
  score: number;
  date: string; // YYYY-MM-DD
  rival?: boolean;
}

export const BOARD_SIZE = 10;

/** Skoru tabloya ekler (en iyi 10). Dönen değer: eklenen satırın sırası (1'den başlar) ya da null. */
export function submit(board: BoardEntry[], entry: BoardEntry): number | null {
  board.push(entry);
  board.sort((a, b) => b.score - a.score || a.date.localeCompare(b.date));
  const idx = board.indexOf(entry);
  if (board.length > BOARD_SIZE) board.length = BOARD_SIZE;
  return idx < BOARD_SIZE ? idx + 1 : null;
}

/** Oyuncunun kayıtlı skorları ile o katın rakiplerini birleştirip sıralı gösterir. */
export function withRivals(board: BoardEntry[], rivals: { name: string; score: number }[]): BoardEntry[] {
  const all: BoardEntry[] = [...board, ...rivals.map((r) => ({ name: r.name, score: r.score, date: '', rival: true }))];
  return all.sort((a, b) => b.score - a.score);
}

/** Skorun geçtiği en güçlü rakip. */
export function beatenRival(score: number, rivals: { name: string; score: number }[]): { name: string; score: number } | null {
  const beaten = rivals.filter((r) => score > r.score).sort((a, b) => b.score - a.score);
  return beaten[0] ?? null;
}

/** Bir sonraki hedef rakip (skorun hemen üstündeki). */
export function nextRival(score: number, rivals: { name: string; score: number }[]): { name: string; score: number } | null {
  const above = rivals.filter((r) => r.score >= score).sort((a, b) => a.score - b.score);
  return above[0] ?? null;
}
