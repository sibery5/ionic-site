#!/usr/bin/env python3
"""Telifsiz (CC0) fotoğraf dokularını Poly Haven'dan indirir ve oyunun biçimine paketler.

Çıktı (assets/tex/): her doku için dört dosya
  <ad>_a.webp  renk (albedo)            <ad>_n.jpg   normal haritası (DirectX yönü, 4:4:4)
  <ad>_r.webp  pürüzlülük (gri)         <ad>_h.webp  yükseklik (gri, kontrastı açılmış)
Oyun bunları yüklerken iki RGBA dokuya birleştirir (renk+pürüzlülük, normal+yükseklik); bkz. src/core/phototex.js.

Kullanım:  python3 scripts/assets/pack-textures.py        (istanbul-mafia/ klasöründen)
Yeni doku eklemek = SETS tablosuna satır eklemek + src/core/phototex.js PHOTO tablosuna aynı adı yazmak.
"""
import os, sys, urllib.request
from PIL import Image, ImageFile, ImageOps, ImageStat

ImageFile.MAXBLOCK = 1 << 24  # optimize=True ile büyük JPEG yazarken "broken data stream" hatasını önler

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..')
OUT = os.path.join(ROOT, 'assets', 'tex')
CACHE = os.path.join(ROOT, '.testout', 'texcache')
SIZE = 1024
UA = 'IstanbulMafyaAssetFetcher/1.0'

# ad: Poly Haven kısa adı, gerçek dünyada bir döşemenin kenarı (m).
# neutral/keep: rengi oyunun verdiği dokular (sıva, kiremit, kesme taş) nötr açık tona çekilir;
#   neutral = hedef ortalama (0-255), keep = özgün renk farkından korunacak oran.
SETS = {
    'asphalt': dict(slug='asphalt_pit_lane', tile=2.0),
    'pave': dict(slug='pavement_03', tile=2.0),
    'cobble': dict(slug='cobblestone_floor_08', tile=2.0),
    'grass': dict(slug='forrest_ground_01', tile=2.0),
    'plaster': dict(slug='painted_plaster_wall', tile=2.0, neutral=219, keep=0.6),
    'brick': dict(slug='red_bricks_04', tile=2.5),
    'roof': dict(slug='clay_roof_tiles_02', tile=2.5, neutral=204, keep=0.35),
    'ashlar': dict(slug='sandstone_blocks_05', tile=3.0, neutral=208, keep=0.5),
    'bark': dict(slug='bark_brown_02', tile=1.0),
}
MAPS = {'diff': 'diff', 'nor': 'nor_dx', 'rough': 'rough', 'disp': 'disp'}


def fetch(slug, kind):
    os.makedirs(CACHE, exist_ok=True)
    path = os.path.join(CACHE, f'{slug}_{kind}_1k.jpg')
    for attempt in range(3):
        if not os.path.exists(path) or os.path.getsize(path) < 1000:
            url = f'https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/{slug}/{slug}_{kind}_1k.jpg'
            req = urllib.request.Request(url, headers={'User-Agent': UA})
            with urllib.request.urlopen(req, timeout=90) as r, open(path, 'wb') as f:
                f.write(r.read())
        try:
            im = Image.open(path)
            im.load()  # yarım inmiş dosyayı burada yakala
            return im
        except OSError:
            os.remove(path)
    raise SystemExit(f'indirilemedi: {slug} {kind}')


def neutralize(im, target, keep):
    """Renk farkının 'keep' kadarını koru, kanal ortalamalarını 'target' değerine çek."""
    gray = ImageOps.grayscale(im).convert('RGB')
    im = Image.blend(gray, im, keep)
    means = ImageStat.Stat(im).mean
    chans = [c.point(lambda v, k=target / max(m, 1): min(255, int(v * k + 0.5))) for c, m in zip(im.split(), means)]
    return Image.merge('RGB', chans)


def main():
    os.makedirs(OUT, exist_ok=True)
    total = 0
    rows = []
    for name, cfg in SETS.items():
        slug = cfg['slug']
        diff = fetch(slug, MAPS['diff']).convert('RGB').resize((SIZE, SIZE), Image.LANCZOS)
        if 'neutral' in cfg:
            diff = neutralize(diff, cfg['neutral'], cfg.get('keep', 0.5))
        nor = fetch(slug, MAPS['nor']).convert('RGB').resize((SIZE, SIZE), Image.LANCZOS)
        rough = fetch(slug, MAPS['rough']).convert('L').resize((SIZE, SIZE), Image.LANCZOS)
        disp = ImageOps.autocontrast(fetch(slug, MAPS['disp']).convert('L').resize((SIZE, SIZE), Image.LANCZOS), cutoff=1)
        files = {
            f'{name}_a.webp': lambda p: diff.save(p, 'WEBP', quality=84, method=6),
            f'{name}_n.jpg': lambda p: nor.save(p, 'JPEG', quality=90, subsampling=0, optimize=True),
            f'{name}_r.webp': lambda p: rough.save(p, 'WEBP', quality=80, method=6),
            f'{name}_h.webp': lambda p: disp.save(p, 'WEBP', quality=78, method=6),
        }
        size = 0
        for fn, save in files.items():
            p = os.path.join(OUT, fn)
            save(p)
            size += os.path.getsize(p)
        total += size
        rows.append((name, slug, cfg['tile'], size))
        print(f'{name:8s} <- {slug:24s} {size / 1024:7.0f} KB')
    with open(os.path.join(OUT, 'KAYNAK.md'), 'w', encoding='utf-8') as f:
        f.write('# Doku kaynakları\n\n')
        f.write('Bu klasördeki dokular [Poly Haven](https://polyhaven.com) kaynaklıdır ve **CC0** lisanslıdır: ticari kullanım serbesttir, '
                'atıf zorunlu değildir. `scripts/assets/pack-textures.py` ile indirilip oyunun biçimine paketlenmiştir.\n\n')
        f.write('| Oyundaki ad | Poly Haven dokusu | Döşeme (m) | Boyut |\n|---|---|---|---|\n')
        for name, slug, tile, size in rows:
            f.write(f'| {name} | [{slug}](https://polyhaven.com/a/{slug}) | {tile} | {size // 1024} KB |\n')
    print(f'toplam {total / 1024 / 1024:.1f} MB -> {os.path.relpath(OUT, ROOT)}')


if __name__ == '__main__':
    sys.exit(main())
