// Kat haritaları. Her karakter bir hücre (CELL metre).
//  #  duvar            .  zemin           P  oyuncu başlangıcı
//  O  ocak (tezgâh)    a-c müşteri masası  D  kapı (zemin + kasa)
//  w  kaygan zemin     n  NPC yol noktası  K  kedi Paşa
//  p  saksı            k  dosya dolabı    v  sebil
//  t  kafe masası      s  merdiven (dekor, katı)

export interface LevelDef {
  grid: string[];
  theme: 'han' | 'teras' | 'bodrum';
  dark?: boolean;
  wind?: boolean;
  cat?: boolean;
  npcCount: number;
}

export const LEVELS: LevelDef[] = [
  {
    theme: 'han',
    npcCount: 4,
    grid: [
      '########################',
      '#k..a.#k..b..#....c..pk#',
      '#.....#......#.........#',
      '#p....#p.....#p........#',
      '###D######D#######D#####',
      '#P.n.....n.....n.....n.#',
      '#O.....................#',
      '#O..n.....n......n....v#',
      '########################',
    ],
  },
  {
    theme: 'han',
    npcCount: 4,
    grid: [
      '#########################',
      '#k..a..#.......#k...c..p#',
      '#......#...b...#........#',
      '#p.....#......p#........#',
      '####D#####D#########D####',
      '#P..ww...n.....ww.....n.#',
      '#O..ww.........ww.......#',
      '#O.n.....n...ww....n...v#',
      '#.......#####..##########',
      '#.n..p..#   #..#         ',
      '#########   ####         ',
    ],
  },
  {
    theme: 'han',
    cat: true,
    npcCount: 4,
    grid: [
      '########################',
      '#k..a.....#.....b....pk#',
      '#.........#............#',
      '#p........D............#',
      '#####D#####...######D###',
      '#P..n.........#........#',
      '#O......####..#..n.....#',
      '#O..n...#pp#..K..#######',
      '#.......#pp#.....D..c..#',
      '#..n....####.....#.....#',
      '#..............n.#k...p#',
      '########################',
    ],
  },
  {
    theme: 'han',
    dark: true,
    npcCount: 3,
    grid: [
      '##########################',
      '#k.a..#k..b...#k......c.p#',
      '#.....#.......#..........#',
      '#p....#p......#..........#',
      '###D#####D#########D######',
      '#P...n.......n.......n..v#',
      '#O.......................#',
      '#O..n....######...n......#',
      '#####....#    #......#####',
      '    #.n..#    #..n...#    ',
      '    ######    ########    ',
    ],
  },
  {
    theme: 'teras',
    wind: true,
    cat: true,
    npcCount: 3,
    grid: [
      '########################',
      '#p....t.....p.....t...p#',
      '#..a.......n...........#',
      '#.......t........b.....#',
      '#P..n.......p..........#',
      '#O.......t.......n..t..#',
      '#O..n.........c........#',
      '#s....t....n.......K..p#',
      '########################',
    ],
  },
];

/** Bodrum arşivi (LEVELS[5]): raf sıraları arasında dar koridorlar, sızdıran borular. */
LEVELS.push({
  theme: 'bodrum',
  npcCount: 3,
  grid: [
    '########################',
    '#k.k.k.k.#....a.....kpk#',
    '#........#.............#',
    '#k.k.k.k.D....n........#',
    '#####D####..........##D#',
    '#P....n.....ww.....n...#',
    '#O.........k.k.k.......#',
    '#O..n......k.k.k...n...#',
    '#.....ww...........#####',
    '#..b...n...k.k.k...D.c.#',
    '#.p.............n..#...#',
    '########################',
  ],
});

/** Açgözlü Çaycı arenası: tek büyük salon, ocak solda, dört masa köşelerde. */
export const ARENA: LevelDef = {
  theme: 'han',
  npcCount: 4,
  cat: true,
  grid: [
    '####################',
    '#k...a......p...b.k#',
    '#..................#',
    '#..n.....n....n....#',
    '#P.................#',
    '#O...pp......pp....#',
    '#O...pp..ww..pp...v#',
    '#O..........K......#',
    '#..n.....n....n....#',
    '#..................#',
    '#k...c......p...d.k#',
    '####################',
  ],
};

export interface ParsedLevel {
  w: number;
  h: number;
  cells: string[][];
  start: [number, number];
  ocak: [number, number][];
  desks: Map<string, [number, number]>;
  npcPoints: [number, number][];
  catStart?: [number, number];
}

const SOLID = new Set(['#', 'O', 'a', 'b', 'c', 'd', 'e', 'f', 'p', 'k', 'v', 't', 's', ' ']);

export function isSolidChar(ch: string) {
  return SOLID.has(ch);
}

export function parseLevel(def: LevelDef): ParsedLevel {
  const h = def.grid.length;
  const w = Math.max(...def.grid.map((r) => r.length));
  const cells = def.grid.map((r) => r.padEnd(w, ' ').split(''));
  let start: [number, number] = [1, 1];
  const ocak: [number, number][] = [];
  const desks = new Map<string, [number, number]>();
  const npcPoints: [number, number][] = [];
  let catStart: [number, number] | undefined;
  for (let z = 0; z < h; z++) {
    for (let x = 0; x < w; x++) {
      const ch = cells[z][x];
      if (ch === 'P') start = [x, z];
      else if (ch === 'O') ocak.push([x, z]);
      else if (/[a-f]/.test(ch)) desks.set(ch, [x, z]);
      else if (ch === 'n') npcPoints.push([x, z]);
      else if (ch === 'K') catStart = [x, z];
    }
  }
  return { w, h, cells, start, ocak, desks, npcPoints, catStart };
}
