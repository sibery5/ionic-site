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

  // ---- butik kategorileri ----
  c_top: S('<path d="M22 8 L32 14 L42 8 L58 18 L50 30 L46 26 L46 56 L18 56 L18 26 L14 30 L6 18Z"/><path d="M28 12 L32 22 L36 12" fill="none" stroke="rgba(0,0,0,0.45)" stroke-width="3"/>'),
  c_pants: S('<path d="M16 6 L48 6 L52 58 L38 58 L32 24 L26 58 L12 58Z"/><rect x="16" y="6" width="32" height="6" fill="rgba(0,0,0,0.35)"/>'),
  c_shoes: S('<path d="M4 40 L6 22 L22 22 L26 32 Q44 34 56 40 Q60 44 58 50 L6 50Z"/><rect x="4" y="48" width="55" height="5" rx="2" fill="rgba(0,0,0,0.45)"/>'),
  c_hat: S('<path d="M18 40 Q16 16 32 14 Q48 16 46 40Z"/><ellipse cx="32" cy="42" rx="28" ry="7"/><rect x="18" y="34" width="28" height="5" fill="rgba(0,0,0,0.4)"/>'),
  c_glasses: S('<circle cx="18" cy="34" r="11"/><circle cx="46" cy="34" r="11"/><path d="M28 32 Q32 28 36 32" fill="none" stroke="currentColor" stroke-width="4"/><path d="M7 30 L2 22 M57 30 L62 22" stroke="currentColor" stroke-width="4" stroke-linecap="round"/><path d="M12 30 L20 28" stroke="rgba(255,255,255,0.35)" stroke-width="3"/>'),
  c_jewelry: S('<path d="M10 8 Q32 40 54 8" fill="none" stroke="currentColor" stroke-width="5" stroke-dasharray="4 3"/><path d="M32 30 L44 42 L32 58 L20 42Z"/><path d="M20 42 L44 42 M32 30 L28 42 L32 58 M32 30 L36 42 L32 58" stroke="rgba(0,0,0,0.35)" stroke-width="2" fill="none"/>'),
  c_watch: S('<rect x="22" y="2" width="20" height="14" rx="3"/><rect x="22" y="48" width="20" height="14" rx="3"/><circle cx="32" cy="32" r="18"/><circle cx="32" cy="32" r="13" fill="rgba(0,0,0,0.5)"/><path d="M32 24 L32 32 L38 36" stroke="currentColor" stroke-width="3" fill="none" stroke-linecap="round"/><rect x="50" y="29" width="5" height="6" rx="1"/>'),
  c_bag: S('<path d="M22 18 Q22 6 32 6 Q42 6 42 18" fill="none" stroke="currentColor" stroke-width="5"/><rect x="8" y="18" width="48" height="40" rx="5"/><rect x="8" y="30" width="48" height="5" fill="rgba(0,0,0,0.35)"/><rect x="28" y="27" width="8" height="10" rx="1" fill="rgba(0,0,0,0.5)"/>'),

  // ---- emlak ----
  p_flat: S('<rect x="12" y="6" width="40" height="52"/><g fill="rgba(0,0,0,0.45)"><rect x="18" y="12" width="8" height="8"/><rect x="38" y="12" width="8" height="8"/><rect x="18" y="26" width="8" height="8"/><rect x="38" y="26" width="8" height="8"/><rect x="18" y="40" width="8" height="8"/><rect x="28" y="44" width="8" height="14"/><rect x="38" y="40" width="8" height="8"/></g><rect x="6" y="56" width="52" height="4"/>'),
  p_yali: S('<path d="M8 28 L32 12 L56 28Z"/><rect x="12" y="28" width="40" height="18"/><g fill="rgba(0,0,0,0.45)"><rect x="17" y="32" width="6" height="8"/><rect x="29" y="32" width="6" height="8"/><rect x="41" y="32" width="6" height="8"/></g><path d="M2 50 Q10 46 18 50 T34 50 T50 50 T64 50 L64 54 Q56 58 48 54 T32 54 T16 54 T2 54Z"/><path d="M2 58 Q10 54 18 58 T34 58 T50 58 T64 58 L64 62 L2 62Z" opacity="0.6"/>'),
  p_tower: S('<rect x="20" y="10" width="24" height="50"/><rect x="16" y="6" width="32" height="6"/><g fill="rgba(0,0,0,0.45)"><rect x="24" y="16" width="5" height="5"/><rect x="35" y="16" width="5" height="5"/><rect x="24" y="26" width="5" height="5"/><rect x="35" y="26" width="5" height="5"/><rect x="24" y="36" width="5" height="5"/><rect x="35" y="36" width="5" height="5"/><rect x="28" y="48" width="8" height="12"/></g><circle cx="32" cy="9" r="2" fill="rgba(0,0,0,0.6)"/>'),
  pin_property: S('<path d="M32 6 L60 30 L52 30 L52 58 L12 58 L12 30 L4 30Z"/><path d="M32 30 L36 38 L45 38 L38 44 L41 53 L32 47 L23 53 L26 44 L19 38 L28 38Z" fill="rgba(0,0,0,0.5)"/>'),
  pin_job: S('<rect x="6" y="20" width="52" height="36" rx="5"/><path d="M22 20 L22 12 Q22 8 26 8 L38 8 Q42 8 42 12 L42 20" fill="none" stroke="currentColor" stroke-width="5"/><rect x="6" y="32" width="52" height="5" fill="rgba(0,0,0,0.4)"/><rect x="27" y="29" width="10" height="10" rx="2" fill="rgba(0,0,0,0.55)"/>'),
  pin_crime: S('<path d="M6 22 Q32 6 58 22 L54 40 Q44 50 32 44 Q20 50 10 40Z"/><ellipse cx="21" cy="28" rx="7" ry="5" fill="rgba(0,0,0,0.7)"/><ellipse cx="43" cy="28" rx="7" ry="5" fill="rgba(0,0,0,0.7)"/>'),

  // ---- lüks araçlar ----
  v_speedboat: S('<path d="M2 36 L50 36 L62 28 L58 44 Q30 52 6 44Z"/><path d="M24 36 L30 24 L44 24 L48 36Z"/><path d="M32 26 L42 26 L44 34 L30 34Z" fill="rgba(0,0,0,0.4)"/><path d="M0 54 Q8 50 16 54 T32 54 T48 54 T64 54" fill="none" stroke="currentColor" stroke-width="3" opacity="0.6"/>'),
  v_yacht: S('<path d="M2 38 L60 38 L54 48 L10 48Z"/><path d="M10 38 L14 28 L48 28 L54 38Z"/><path d="M18 28 L22 20 L40 20 L44 28Z"/><g fill="rgba(0,0,0,0.45)"><rect x="18" y="31" width="5" height="4"/><rect x="27" y="31" width="5" height="4"/><rect x="36" y="31" width="5" height="4"/><rect x="24" y="22" width="12" height="4"/></g><rect x="30" y="8" width="2" height="12"/><path d="M0 56 Q8 52 16 56 T32 56 T48 56 T64 56" fill="none" stroke="currentColor" stroke-width="3" opacity="0.6"/>'),
  v_helicopter: S('<rect x="4" y="12" width="56" height="3" rx="1"/><rect x="30" y="14" width="4" height="8"/><path d="M14 22 Q14 42 30 42 L42 42 Q50 42 50 32 L50 26 Q50 22 44 22Z"/><path d="M16 24 Q16 34 26 34 L26 24Z" fill="rgba(0,0,0,0.45)"/><path d="M50 30 L62 28 L62 34 L50 34Z"/><path d="M60 24 L62 24 L62 38 L60 38Z"/><path d="M20 48 L48 48 M26 42 L24 48 M40 42 L42 48" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>'),
  v_plane: S('<path d="M4 34 Q4 28 12 28 L52 28 Q62 30 62 32 Q62 34 52 36 L12 36 Q4 36 4 34Z"/><path d="M24 30 L36 10 L42 10 L36 30Z"/><path d="M24 34 L36 54 L42 54 L36 34Z"/><path d="M8 28 L4 18 L10 18 L16 28Z"/><g fill="rgba(0,0,0,0.45)"><circle cx="48" cy="32" r="2"/><circle cx="42" cy="32" r="2"/><circle cx="18" cy="32" r="2"/><circle cx="24" cy="32" r="2"/></g>'),

  // ---- telefon uygulamaları ----
  app_map: S('<path d="M6 14 L22 8 L42 14 L58 8 L58 50 L42 56 L22 50 L6 56Z"/><path d="M22 8 L22 50 M42 14 L42 56" stroke="rgba(0,0,0,0.4)" stroke-width="3"/><path d="M32 20 Q24 20 24 28 Q24 34 32 42 Q40 34 40 28 Q40 20 32 20Z" fill="#fff"/><circle cx="32" cy="28" r="3.5" fill="rgba(0,0,0,0.6)"/>'),
  app_bank: S('<path d="M32 4 L60 18 L4 18Z"/><rect x="8" y="22" width="6" height="26"/><rect x="22" y="22" width="6" height="26"/><rect x="36" y="22" width="6" height="26"/><rect x="50" y="22" width="6" height="26"/><rect x="4" y="50" width="56" height="8"/>'),
  app_jobs: S('<rect x="6" y="20" width="52" height="36" rx="5"/><path d="M22 20 L22 12 Q22 8 26 8 L38 8 Q42 8 42 12 L42 20" fill="none" stroke="currentColor" stroke-width="5"/><rect x="6" y="32" width="52" height="5" fill="rgba(0,0,0,0.4)"/><rect x="27" y="29" width="10" height="10" rx="2" fill="rgba(0,0,0,0.55)"/>'),
  app_estate: S('<path d="M32 6 L60 30 L52 30 L52 58 L12 58 L12 30 L4 30Z"/><rect x="26" y="40" width="12" height="18" fill="rgba(0,0,0,0.45)"/><rect x="18" y="32" width="8" height="7" fill="rgba(0,0,0,0.35)"/><rect x="38" y="32" width="8" height="7" fill="rgba(0,0,0,0.35)"/>'),
  app_garage: S('<path d="M6 40 L10 26 Q12 20 20 20 L44 20 Q52 20 54 26 L58 40 L58 48 L6 48Z"/><circle cx="18" cy="48" r="6" fill="rgba(0,0,0,0.7)"/><circle cx="46" cy="48" r="6" fill="rgba(0,0,0,0.7)"/><path d="M16 26 L48 26 L50 34 L14 34Z" fill="rgba(0,0,0,0.4)"/><circle cx="12" cy="40" r="3" fill="#fff"/><circle cx="52" cy="40" r="3" fill="#fff"/>'),
  app_stock: S('<rect x="6" y="6" width="52" height="52" rx="6" fill="none" stroke="currentColor" stroke-width="4"/><path d="M12 46 L24 34 L32 40 L50 18" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/><path d="M42 16 L52 16 L52 26" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round"/>'),
  app_contacts: S('<circle cx="32" cy="22" r="13"/><path d="M8 58 Q8 38 32 38 Q56 38 56 58Z"/>'),
  app_settings: S('<path d="M28 4 L36 4 L38 12 L44 15 L51 10 L56 15 L51 22 L54 28 L62 30 L62 38 L54 40 L51 46 L56 53 L51 58 L44 53 L38 56 L36 62 L28 62 L26 56 L20 53 L13 58 L8 53 L13 46 L10 40 L2 38 L2 30 L10 28 L13 22 L8 15 L13 10 L20 15 L26 12Z"/><circle cx="32" cy="33" r="10" fill="rgba(0,0,0,0.6)"/>'),
  app_inventory: S('<path d="M22 18 Q22 6 32 6 Q42 6 42 18" fill="none" stroke="currentColor" stroke-width="5"/><rect x="8" y="18" width="48" height="40" rx="5"/><rect x="8" y="30" width="48" height="5" fill="rgba(0,0,0,0.35)"/><rect x="28" y="27" width="8" height="10" rx="1" fill="rgba(0,0,0,0.5)"/>'),
  app_camera: S('<rect x="4" y="16" width="56" height="40" rx="6"/><rect x="20" y="8" width="24" height="10" rx="3"/><circle cx="32" cy="36" r="13" fill="rgba(0,0,0,0.55)"/><circle cx="32" cy="36" r="7"/>'),

  // ---- işler ----
  j_taxi: S('<rect x="24" y="8" width="16" height="7" rx="2"/><path d="M6 40 L10 26 Q12 20 20 20 L44 20 Q52 20 54 26 L58 40 L58 48 L6 48Z"/><circle cx="18" cy="48" r="6" fill="rgba(0,0,0,0.7)"/><circle cx="46" cy="48" r="6" fill="rgba(0,0,0,0.7)"/><path d="M6 38 L58 38 L58 42 L6 42Z" fill="rgba(0,0,0,0.35)"/>'),
  j_courier: S('<path d="M32 4 L58 16 L58 46 L32 60 L6 46 L6 16Z"/><path d="M6 16 L32 28 L58 16 M32 28 L32 60" fill="none" stroke="rgba(0,0,0,0.45)" stroke-width="3"/><path d="M19 10 L45 22 L45 32" fill="none" stroke="rgba(255,255,255,0.5)" stroke-width="4"/>'),
  j_bus: S('<rect x="6" y="10" width="52" height="40" rx="6"/><g fill="rgba(0,0,0,0.45)"><rect x="11" y="16" width="12" height="12"/><rect x="26" y="16" width="12" height="12"/><rect x="41" y="16" width="12" height="12"/><rect x="11" y="36" width="10" height="4"/><rect x="43" y="36" width="10" height="4"/></g><circle cx="18" cy="52" r="5"/><circle cx="46" cy="52" r="5"/>'),
  j_mechanic: S('<path d="M44 6 A14 14 0 0 0 30 24 L8 46 L18 56 L40 34 A14 14 0 0 0 58 20 L50 28 L40 24 L36 14Z"/>'),
  j_guard: S('<path d="M32 4 L56 12 L56 30 C56 44 46 54 32 60 C18 54 8 44 8 30 L8 12Z"/><path d="M20 22 L28 22 L28 28 L20 28Z M36 22 L44 22 L44 28 L36 28Z" fill="rgba(0,0,0,0.55)"/><path d="M28 24 L36 24" stroke="rgba(0,0,0,0.55)" stroke-width="2"/>'),
  j_chop: S('<path d="M4 44 L8 32 Q10 28 16 28 L38 28 Q44 28 46 32 L50 44 L50 50 L4 50Z"/><circle cx="14" cy="50" r="5" fill="rgba(0,0,0,0.7)"/><circle cx="40" cy="50" r="5" fill="rgba(0,0,0,0.7)"/><path d="M48 4 A10 10 0 0 0 40 18 L30 28 L36 34 L46 24 A10 10 0 0 0 60 16 L54 22 L48 20 L46 14Z"/>'),
  j_rob: S('<path d="M6 22 Q32 6 58 22 L54 40 Q44 50 32 44 Q20 50 10 40Z"/><ellipse cx="21" cy="28" rx="7" ry="5" fill="rgba(0,0,0,0.75)"/><ellipse cx="43" cy="28" rx="7" ry="5" fill="rgba(0,0,0,0.75)"/><path d="M24 52 L40 52 L44 60 L20 60Z"/>'),
  j_protect: S('<path d="M14 24 Q14 16 22 16 L44 16 Q52 16 52 24 L52 40 Q52 50 42 50 L24 50 Q14 50 14 40Z"/><g fill="rgba(0,0,0,0.35)"><rect x="20" y="22" width="6" height="10" rx="2"/><rect x="29" y="22" width="6" height="10" rx="2"/><rect x="38" y="22" width="6" height="10" rx="2"/></g><text x="33" y="46" font-size="13" text-anchor="middle" font-weight="bold" fill="rgba(0,0,0,0.6)">₺</text>'),
  j_hit: S('<circle cx="32" cy="32" r="24" fill="none" stroke="currentColor" stroke-width="5"/><circle cx="32" cy="32" r="6"/><path d="M32 2 L32 18 M32 46 L32 62 M2 32 L18 32 M46 32 L62 32" stroke="currentColor" stroke-width="4"/>'),

  // ---- genel ----
  cart: S('<path d="M2 8 L12 8 L18 40 L52 40 L58 16 L15 16" fill="none" stroke="currentColor" stroke-width="5" stroke-linejoin="round"/><path d="M16 18 L56 18 L51 37 L19 37Z"/><circle cx="22" cy="52" r="5"/><circle cx="48" cy="52" r="5"/>'),
  phone: S('<rect x="16" y="2" width="32" height="60" rx="7"/><rect x="20" y="9" width="24" height="42" rx="2" fill="rgba(0,0,0,0.55)"/><circle cx="32" cy="56" r="3" fill="rgba(0,0,0,0.55)"/>'),
  card: S('<rect x="2" y="12" width="60" height="40" rx="6"/><rect x="2" y="20" width="60" height="8" fill="rgba(0,0,0,0.5)"/><rect x="10" y="36" width="12" height="8" rx="2" fill="rgba(0,0,0,0.35)"/><rect x="28" y="40" width="26" height="4" rx="2" fill="rgba(0,0,0,0.35)"/>'),
  cash: S('<rect x="4" y="16" width="56" height="32" rx="3"/><circle cx="32" cy="32" r="9" fill="rgba(0,0,0,0.45)"/><text x="32" y="37" font-size="13" text-anchor="middle" font-weight="bold" fill="currentColor">₺</text><circle cx="12" cy="32" r="2.5" fill="rgba(0,0,0,0.45)"/><circle cx="52" cy="32" r="2.5" fill="rgba(0,0,0,0.45)"/>'),
  trash: S('<rect x="10" y="12" width="44" height="6" rx="2"/><rect x="24" y="4" width="16" height="8" rx="2"/><path d="M14 20 L50 20 L46 60 L18 60Z"/><path d="M26 26 L27 54 M38 26 L37 54" stroke="rgba(0,0,0,0.45)" stroke-width="3"/>'),
  check: S('<path d="M6 34 L24 52 L58 14" fill="none" stroke="currentColor" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/>'),
  back: S('<path d="M40 8 L16 32 L40 56" fill="none" stroke="currentColor" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>'),
  lock: S('<path d="M18 28 L18 18 Q18 6 32 6 Q46 6 46 18 L46 28" fill="none" stroke="currentColor" stroke-width="6"/><rect x="10" y="28" width="44" height="32" rx="5"/><circle cx="32" cy="42" r="5" fill="rgba(0,0,0,0.55)"/><rect x="30" y="44" width="4" height="9" fill="rgba(0,0,0,0.55)"/>'),
  key: S('<circle cx="18" cy="32" r="13" fill="none" stroke="currentColor" stroke-width="7"/><path d="M30 29 L60 29 L60 37 L54 37 L54 44 L47 44 L47 37 L30 37Z"/>'),
  signal: S('<rect x="4" y="44" width="10" height="16" rx="1"/><rect x="19" y="32" width="10" height="28" rx="1"/><rect x="34" y="20" width="10" height="40" rx="1"/><rect x="49" y="6" width="10" height="54" rx="1"/>'),
  battery: S('<rect x="2" y="16" width="54" height="32" rx="5" fill="none" stroke="currentColor" stroke-width="5"/><rect x="57" y="25" width="5" height="14" rx="1"/><rect x="9" y="23" width="34" height="18" rx="2"/>'),
  trophy: S('<path d="M16 6 L48 6 L48 22 Q48 38 32 40 Q16 38 16 22Z"/><path d="M16 12 L6 12 Q6 26 18 28 M48 12 L58 12 Q58 26 46 28" fill="none" stroke="currentColor" stroke-width="4"/><rect x="28" y="40" width="8" height="10"/><rect x="18" y="50" width="28" height="8" rx="2"/>'),
  scale: S('<rect x="30" y="6" width="4" height="48"/><rect x="14" y="54" width="36" height="6" rx="2"/><path d="M8 14 L56 14" stroke="currentColor" stroke-width="4"/><path d="M2 36 L10 16 L18 36Z M46 36 L54 16 L62 36Z"/><path d="M0 36 Q10 46 20 36Z M44 36 Q54 46 64 36Z"/>'),
  cuffs: S('<circle cx="18" cy="36" r="13" fill="none" stroke="currentColor" stroke-width="6"/><circle cx="46" cy="36" r="13" fill="none" stroke="currentColor" stroke-width="6"/><path d="M28 26 L36 26" stroke="currentColor" stroke-width="6"/>'),
  trend_up: S('<path d="M6 50 L24 30 L36 40 L58 14" fill="none" stroke="currentColor" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>'),
  trend_dn: S('<path d="M6 14 L24 34 L36 24 L58 50" fill="none" stroke="currentColor" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>'),
  hanger: S('<path d="M32 22 L32 16 Q32 10 38 10 Q42 12 40 16" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round"/><path d="M32 22 L4 44 Q2 48 8 48 L56 48 Q62 48 60 44Z" fill="none" stroke="currentColor" stroke-width="5" stroke-linejoin="round"/>'),
  mirror: S('<ellipse cx="32" cy="26" rx="18" ry="22" fill="none" stroke="currentColor" stroke-width="5"/><path d="M22 18 L30 10 M24 28 L38 14" stroke="currentColor" stroke-width="3" opacity="0.6"/><rect x="28" y="48" width="8" height="10"/><rect x="18" y="58" width="28" height="4" rx="2"/>'),
  gamepad: S('<path d="M12 18 L52 18 Q62 18 62 34 Q62 54 52 54 Q46 54 42 44 L22 44 Q18 54 12 54 Q2 54 2 34 Q2 18 12 18Z"/><path d="M14 28 L14 40 M8 34 L20 34" stroke="rgba(0,0,0,0.55)" stroke-width="4"/><circle cx="46" cy="30" r="3.5" fill="rgba(0,0,0,0.55)"/><circle cx="52" cy="38" r="3.5" fill="rgba(0,0,0,0.55)"/>'),
  speaker: S('<path d="M6 24 L18 24 L32 10 L32 54 L18 40 L6 40Z"/><path d="M40 22 Q46 32 40 42 M46 14 Q58 32 46 50" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round"/>'),
  monitor: S('<rect x="4" y="8" width="56" height="38" rx="4"/><rect x="9" y="13" width="46" height="28" fill="rgba(0,0,0,0.5)"/><rect x="28" y="46" width="8" height="8"/><rect x="18" y="54" width="28" height="5" rx="2"/>'),
  globe: S('<circle cx="32" cy="32" r="26" fill="none" stroke="currentColor" stroke-width="5"/><ellipse cx="32" cy="32" rx="11" ry="26" fill="none" stroke="currentColor" stroke-width="4"/><path d="M6 32 L58 32 M11 18 L53 18 M11 46 L53 46" stroke="currentColor" stroke-width="4"/>'),
};

export const PIN_FOR = {
  gun: 'pin_gun', clothes: 'pin_clothes', food: 'pin_food', trade: 'pin_trade', dealer: 'pin_dealer', bank: 'pin_bank', hospital: 'pin_hospital',
  police: 'pin_police', safehouse: 'pin_house', konak: 'pin_reis', estate: 'pin_estate', cafe: 'pin_cafe', club: 'pin_club', garage: 'pin_garage',
  mosque_small: 'pin_mosque', warehouse: 'pin_warehouse', rival: 'pin_target', bazaar: 'pin_trade', mosque: 'pin_mosque',
  property: 'pin_property', job: 'pin_job', crimejob: 'pin_crime',
};
export const PIN_COLOR = {
  gun: '#ff5544', clothes: '#ff8ad8', food: '#7cdd6a', trade: '#7cff8a', dealer: '#6ab8ff', bank: '#d4af37', hospital: '#ff4444', police: '#5a8aff',
  safehouse: '#ffffff', konak: '#d4af37', estate: '#e8b060', cafe: '#e8a070', club: '#ff3df0', garage: '#ffcc00', mosque_small: '#9ac8e8', mosque: '#9ac8e8',
  warehouse: '#aaaaaa', rival: '#ff3030', bazaar: '#e8c060',
  property: '#ffe9a8', job: '#5ad1ff', crimejob: '#ff5a5a',
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
