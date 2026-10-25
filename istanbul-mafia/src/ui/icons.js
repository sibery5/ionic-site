// Oyuna özel çizilmiş SVG ikonlar (hazır ikon seti kullanılmaz).
const S = (inner, vb = '0 0 64 64') => `<svg viewBox="${vb}" xmlns="http://www.w3.org/2000/svg" fill="currentColor">${inner}</svg>`;

export const ICONS = {
  // Logo: Galata Kulesi + minareler + hilal silüeti, altında revolver namlusu
  logo: S(`
    <defs><linearGradient id="lg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f6e08a"/><stop offset="1" stop-color="#a87a1a"/></linearGradient></defs>
    <g fill="url(#lg)">
      <path d="M44 34 L44 98 L56 98 L56 34 L50 18 Z"/>
      <rect x="41" y="34" width="18" height="4"/>
      <rect x="47" y="12" width="6" height="7"/>
      <path d="M14 98 L14 60 L16 50 L18 60 L18 98Z"/><rect x="12.5" y="66" width="7" height="2"/>
      <path d="M82 98 L82 60 L84 50 L86 60 L86 98Z"/><rect x="80.5" y="66" width="7" height="2"/>
      <path d="M22 98 L22 80 Q32 62 42 80 L42 98Z"/>
      <path d="M58 98 L58 80 Q68 62 78 80 L78 98Z"/>
      <path d="M72 22 A12 12 0 1 0 80 40 A9 9 0 1 1 72 22Z"/>
      <rect x="4" y="98" width="92" height="3"/>
    </g>`, '0 0 100 104'),
  money: S('<rect x="6" y="18" width="52" height="28" rx="3"/><circle cx="32" cy="32" r="8" fill="#0b1a0b"/><text x="32" y="37" font-size="12" text-anchor="middle" font-weight="bold" fill="currentColor">₺</text>'),
  star: S('<path d="M32 4 L39 23 L60 24 L43 37 L49 58 L32 46 L15 58 L21 37 L4 24 L25 23Z"/><circle cx="32" cy="31" r="6" fill="rgba(0,0,0,0.35)"/>'),
  heart: S('<path d="M32 56 C10 40 4 30 4 20 C4 11 11 6 18 6 C24 6 29 9 32 15 C35 9 40 6 46 6 C53 6 60 11 60 20 C60 30 54 40 32 56Z"/>'),
  shield: S('<path d="M32 4 L56 12 L56 30 C56 44 46 54 32 60 C18 54 8 44 8 30 L8 12Z"/><path d="M32 12 L48 17 L48 30 C48 40 41 47 32 52Z" fill="rgba(0,0,0,0.3)"/>'),
  clock: S('<circle cx="32" cy="32" r="26" fill="none" stroke="currentColor" stroke-width="5"/><path d="M32 16 L32 32 L44 38" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round"/>'),
  sun: S('<circle cx="32" cy="32" r="12"/><g stroke="currentColor" stroke-width="4" stroke-linecap="round"><path d="M32 4v8M32 52v8M4 32h8M52 32h8M12 12l6 6M46 46l6 6M12 52l6-6M46 18l6-6"/></g>'),
  moon: S('<path d="M40 6 A26 26 0 1 0 58 44 A20 20 0 1 1 40 6Z"/>'),
  rain: S('<path d="M16 34 A12 12 0 0 1 18 10 A16 16 0 0 1 48 14 A10 10 0 0 1 48 34Z"/><g stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M20 42l-4 10M32 42l-4 10M44 42l-4 10"/></g>'),
  cloud: S('<path d="M14 46 A12 12 0 0 1 16 22 A16 16 0 0 1 46 24 A11 11 0 0 1 48 46Z"/>'),
  // haritadaki yerler
  pin_gun: S('<path d="M8 22 L50 22 L56 18 L58 22 L58 30 L26 30 L22 46 L12 46 L14 30 L8 30Z"/>'),
  pin_clothes: S('<path d="M22 8 L32 14 L42 8 L58 18 L50 30 L46 26 L46 56 L18 56 L18 26 L14 30 L6 18Z"/>'),
  pin_food: S('<ellipse cx="32" cy="34" rx="24" ry="18" fill="none" stroke="currentColor" stroke-width="8"/><g fill="rgba(0,0,0,0.4)"><circle cx="22" cy="26" r="2"/><circle cx="40" cy="24" r="2"/><circle cx="30" cy="44" r="2"/></g>'),
  pin_trade: S('<path d="M10 24 L32 10 L54 24 L54 52 L10 52Z"/><rect x="24" y="32" width="16" height="20" fill="rgba(0,0,0,0.4)"/><text x="32" y="29" font-size="12" text-anchor="middle" font-weight="bold" fill="#000">$</text>'),
  pin_dealer: S('<path d="M6 40 L10 26 Q12 20 20 20 L44 20 Q52 20 54 26 L58 40 L58 48 L6 48Z"/><circle cx="18" cy="48" r="6" fill="#111"/><circle cx="46" cy="48" r="6" fill="#111"/>'),
  pin_bank: S('<path d="M32 4 L60 18 L4 18Z"/><rect x="8" y="22" width="6" height="26"/><rect x="22" y="22" width="6" height="26"/><rect x="36" y="22" width="6" height="26"/><rect x="50" y="22" width="6" height="26"/><rect x="4" y="50" width="56" height="8"/>'),
  pin_hospital: S('<rect x="24" y="6" width="16" height="52"/><rect x="6" y="24" width="52" height="16"/>'),
  pin_police: S('<path d="M32 4 L54 12 L54 32 C54 46 44 54 32 60 C20 54 10 46 10 32 L10 12Z"/><path d="M32 18 L36 28 L46 28 L38 34 L41 44 L32 38 L23 44 L26 34 L18 28 L28 28Z" fill="rgba(0,0,0,0.45)"/>'),
  pin_house: S('<path d="M32 6 L60 30 L52 30 L52 58 L12 58 L12 30 L4 30Z"/><rect x="26" y="40" width="12" height="18" fill="rgba(0,0,0,0.45)"/>'),
  pin_reis: S('<circle cx="32" cy="32" r="28"/><text x="32" y="44" font-size="34" text-anchor="middle" font-weight="900" fill="#1a1205" font-family="Georgia, serif">R</text>'),
  pin_estate: S('<circle cx="20" cy="32" r="14" fill="none" stroke="currentColor" stroke-width="7"/><path d="M32 29 L60 29 L60 37 L54 37 L54 45 L48 45 L48 37 L32 37Z"/>'),
  pin_cafe: S('<path d="M18 16 L46 16 L42 52 L22 52Z"/><path d="M14 56 L50 56" stroke="currentColor" stroke-width="5"/><path d="M28 6 Q32 10 28 14 M36 6 Q40 10 36 14" stroke="currentColor" stroke-width="3" fill="none"/>'),
  pin_club: S('<path d="M24 8 L52 4 L52 42 A8 8 0 1 1 46 34 L46 14 L30 17 L30 48 A8 8 0 1 1 24 40Z"/>'),
  pin_garage: S('<path d="M44 6 A14 14 0 0 0 30 24 L8 46 L18 56 L40 34 A14 14 0 0 0 58 20 L50 28 L40 24 L36 14Z"/>'),
  pin_mosque: S('<path d="M14 38 A18 18 0 0 1 50 38Z"/><rect x="10" y="38" width="44" height="18"/><rect x="56" y="16" width="4" height="40"/><path d="M55 16 L58 6 L61 16Z"/><path d="M32 8 A5 5 0 1 0 36 14 A4 4 0 1 1 32 8Z"/>'),
  pin_tulip: S('<path d="M32 60 L32 34" stroke="#2d8a3d" stroke-width="4"/><path d="M18 14 L24 22 L32 8 L40 22 L46 14 L46 28 Q46 40 32 40 Q18 40 18 28Z"/>'),
  pin_target: S('<circle cx="32" cy="32" r="26" fill="none" stroke="currentColor" stroke-width="6"/><circle cx="32" cy="32" r="10"/>'),
  pin_warehouse: S('<path d="M4 24 L32 8 L60 24 L60 58 L4 58Z"/><rect x="14" y="34" width="36" height="24" fill="rgba(0,0,0,0.45)"/>'),
  player: S('<path d="M32 4 L52 58 L32 46 L12 58Z"/>'),
  // silahlar (yan silüet)
  w_fists: S('<path d="M14 24 Q14 16 22 16 L44 16 Q52 16 52 24 L52 40 Q52 50 42 50 L24 50 Q14 50 14 40Z"/><g fill="rgba(0,0,0,0.35)"><rect x="20" y="22" width="6" height="10" rx="2"/><rect x="29" y="22" width="6" height="10" rx="2"/><rect x="38" y="22" width="6" height="10" rx="2"/></g>'),
  w_knife: S('<path d="M4 40 L36 26 L60 24 L40 36 Z"/><rect x="4" y="38" width="20" height="8" rx="3" transform="rotate(-20 14 42)"/>'),
  w_bat: S('<path d="M4 50 L8 54 L60 14 L56 8 Z"/>'),
  w_pistol: S('<path d="M6 18 L58 18 L58 28 L30 28 L26 50 L12 50 L16 28 L6 28Z"/>'),
  w_revolver: S('<path d="M4 20 L46 20 L46 26 L60 24 L60 28 L46 30 L32 32 L28 52 L14 52 L20 30 L6 28Z"/><circle cx="34" cy="26" r="6" fill="rgba(0,0,0,0.35)"/>'),
  w_uzi: S('<path d="M6 18 L56 18 L56 22 L62 22 L62 26 L56 26 L56 30 L36 30 L36 56 L28 56 L28 30 L20 30 L16 44 L8 44 L12 30 L6 30Z"/>'),
  w_shotgun: S('<path d="M2 28 L16 22 L64 20 L64 26 L28 28 L26 34 L12 40 L2 36Z"/><rect x="34" y="27" width="16" height="5"/>'),
  w_ak: S('<path d="M2 30 L14 24 L30 24 L30 20 L64 20 L64 24 L50 24 L50 28 L36 28 L40 46 L32 48 L28 30 L18 32 L4 38Z"/>'),
  w_m4: S('<path d="M2 26 L16 24 L22 18 L40 18 L42 22 L64 22 L64 26 L44 26 L44 30 L30 30 L30 44 L24 44 L24 30 L16 30 L4 36Z"/><rect x="26" y="12" width="12" height="5"/>'),
  w_sniper: S('<path d="M2 32 L18 26 L34 26 L34 24 L64 24 L64 27 L36 30 L28 40 L20 40 L18 32 L4 38Z"/><rect x="22" y="16" width="16" height="6" rx="3"/>'),
  w_rpg: S('<rect x="2" y="26" width="48" height="8" rx="2"/><path d="M50 22 L64 30 L50 38Z"/><rect x="16" y="34" width="5" height="10"/><rect x="30" y="34" width="5" height="10"/>'),
  w_grenade: S('<ellipse cx="32" cy="38" rx="16" ry="20"/><rect x="26" y="10" width="12" height="10"/><path d="M38 12 Q52 8 50 22" fill="none" stroke="currentColor" stroke-width="3"/><g fill="rgba(0,0,0,0.35)"><rect x="18" y="34" width="28" height="3"/><rect x="18" y="42" width="28" height="3"/></g>'),
  car: S('<path d="M6 40 L10 26 Q12 20 20 20 L44 20 Q52 20 54 26 L58 40 L58 48 L6 48Z"/><circle cx="18" cy="48" r="6" fill="#111"/><circle cx="46" cy="48" r="6" fill="#111"/><path d="M16 26 L48 26 L50 34 L14 34Z" fill="rgba(0,0,0,0.4)"/>'),
  respect: S('<path d="M8 50 L14 18 L26 34 L32 10 L38 34 L50 18 L56 50Z"/><rect x="8" y="52" width="48" height="6"/>'),
};

export const PIN_FOR = {
  gun: 'pin_gun', clothes: 'pin_clothes', food: 'pin_food', trade: 'pin_trade', dealer: 'pin_dealer', bank: 'pin_bank', hospital: 'pin_hospital',
  police: 'pin_police', safehouse: 'pin_house', konak: 'pin_reis', estate: 'pin_estate', cafe: 'pin_cafe', club: 'pin_club', garage: 'pin_garage',
  mosque_small: 'pin_mosque', warehouse: 'pin_warehouse', rival: 'pin_target', bazaar: 'pin_trade', mosque: 'pin_mosque',
};
export const PIN_COLOR = {
  gun: '#ff5544', clothes: '#ff8ad8', food: '#7cdd6a', trade: '#7cff8a', dealer: '#6ab8ff', bank: '#d4af37', hospital: '#ff4444', police: '#5a8aff',
  safehouse: '#ffffff', konak: '#d4af37', estate: '#e8b060', cafe: '#e8a070', club: '#ff3df0', garage: '#ffcc00', mosque_small: '#9ac8e8', mosque: '#9ac8e8',
  warehouse: '#aaaaaa', rival: '#ff3030', bazaar: '#e8c060',
};

export function svgImg(name, color, size = 24) {
  return `<span class="ico" style="color:${color || 'currentColor'};width:${size}px;height:${size}px">${ICONS[name] || ''}</span>`;
}

// Mini harita için ikonları önceden bitmap'e çevir
const bitmapCache = new Map();
export function iconBitmap(name, color, size = 32) {
  const key = name + color + size;
  if (bitmapCache.has(key)) return bitmapCache.get(key);
  const svg = (ICONS[name] || ICONS.pin_target).replace('fill="currentColor"', `fill="${color}"`).replace(/currentColor/g, color);
  const img = new Image();
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg.replace('<svg ', `<svg width="${size}" height="${size}" `));
  bitmapCache.set(key, img);
  return img;
}
