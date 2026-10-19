# Steam başarım ikonları (256x256): açık (renkli) ve kilitli (gri) sürüm. Kullanım: python3 scripts/achievement-icons.py
import json, os
from PIL import Image, ImageDraw, ImageFont, ImageOps

GLYPH = {
    'FIRST_TEA': '1', 'TOWER_8': '8', 'TOWER_12': '12', 'SPIN_1': '↻', 'SPIN_25': '25', 'COMBO_3': '×3',
    'BANK_100': '100₺', 'RUN_250': '250₺', 'CLEAN_RUN': '0', 'VIP_5': '★5', 'ALL_1STAR': '★', 'ALL_3STAR': '★★★',
    'GOSSIP_ALL': '“ ”', 'END_SAVED': '♥', 'END_SILENT': '…', 'END_DISBELIEVED': '?', 'CAT_10': '=^.^=',
    'BROKEN_100': '100', 'DAILY_7': '7', 'LEVEL_10': '10', 'LEVEL_30': '30',
    'SALE_1': '“!”', 'SALE_10': '10“', 'LIAR_5': '?!', 'ESCAPE_1': '»»', 'CAUGHT_3': '3!', 'BONK_1': 'DANK',
    'BETRAY_1': '30', 'TITLE_BAS': '↑', 'END_SOLD': '$',
    'INSPECT_PASS': 'A+', 'BACKFIRE_1': '!!', 'BOSS_BONK': 'BOSS',
}
RING = {'END_SAVED': (233, 207, 122), 'TITLE_BAS': (233, 207, 122), 'BETRAY_1': (120, 120, 120), 'END_SOLD': (120, 120, 120), 'ALL_3STAR': (233, 207, 122), 'LEVEL_30': (233, 207, 122), 'TOWER_12': (233, 207, 122)}
FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf'
SYMBOLS = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
os.makedirs('steam/achievement-icons', exist_ok=True)
rows = json.load(open('steam/achievements.json'))
for r in rows:
    aid = r['apiName']
    S = 256
    im = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    ring = RING.get(aid, (201, 204, 209))
    d.ellipse((8, 8, S - 8, S - 8), fill=ring)
    d.ellipse((22, 22, S - 22, S - 22), fill=(179, 38, 30))
    d.ellipse((34, 34, S - 34, S - 34), fill=(60, 26, 14))
    # ince belli bardak silüeti arka planda
    d.polygon([(100, 70), (156, 70), (146, 128), (158, 186), (98, 186), (110, 128)], fill=(90, 40, 22))
    g = GLYPH.get(aid, '?')
    size = 110 if len(g) <= 1 else 92 if len(g) == 2 else 64 if len(g) <= 4 else 46
    # yıldız, kalp, ok gibi işaretler serif yazı tipinde yok
    f = ImageFont.truetype(FONT if all(ord(c) < 0x2000 or c in '₺×…“”' for c in g) else SYMBOLS, size)
    bb = d.textbbox((0, 0), g, font=f)
    w, h = bb[2] - bb[0], bb[3] - bb[1]
    d.text(((S - w) / 2 - bb[0], (S - h) / 2 - bb[1] + 4), g, font=f, fill=(255, 246, 220))
    im.save(f'steam/achievement-icons/{aid}.png')
    gray = ImageOps.grayscale(im.convert('RGB')).convert('RGBA')
    gray.putalpha(im.getchannel('A'))
    gray = Image.blend(Image.new('RGBA', (S, S), (0, 0, 0, 0)), gray, 0.75)
    gray.save(f'steam/achievement-icons/{aid}_locked.png')
print(len(rows), 'ikon')
