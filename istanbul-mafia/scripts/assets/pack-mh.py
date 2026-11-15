#!/usr/bin/env python3
"""Telifsiz (CC0) MakeHuman insan verisini oyunun biçimine paketler.

Kullanım:  python3 -I scripts/assets/pack-mh.py <npm makehuman-data/public/data> <makehuman/data/targets>
Çıktı:     assets/mh/mh.bin (gövde tipleri, kıyafet/saç parçaları, kemik ağırlıkları, uzaklık düzeyleri)
           assets/mh/mh.webp (doku atlası; alfa: <0.5 kesilir, 0.6 = renklendirilmez, 1.0 = görünüş rengiyle çarpılır)

Gövde bizim 27 kemikli iskeletimize oturtulur: gövde/baş tek parça (ölçek + öteleme), kollar aşağı indirilir,
bacaklar dikleştirilir. Çalışma zamanı (src/entities/charMH.js) yalnız parça oturtma + doğrusal karışımlı deri uygular.
"""
import json, os, struct, sys
import numpy as np
from PIL import Image, ImageDraw
from scipy.spatial import cKDTree
import pyfqmr

D = sys.argv[1].rstrip('/') + '/'
T = sys.argv[2].rstrip('/') + '/'
OUT = os.path.join(os.path.dirname(__file__), '..', '..', 'assets', 'mh')
os.makedirs(OUT, exist_ok=True)

BONES = ['hips', 'spine', 'chest', 'neck', 'head', 'shL', 'elL', 'wrL', 'fiL', 'fdL', 'thL', 'shR', 'elR', 'wrR', 'fiR', 'fdR', 'thR',
         'hipL', 'knL', 'anL', 'toeL', 'hipR', 'knR', 'anR', 'toeR', 'faL', 'faR']
BI = {n: i for i, n in enumerate(BONES)}
SLOT = {'skin': 0, 'top': 1, 'bottom': 2, 'shirt': 3, 'shoes': 4, 'hair': 5, 'none': 6}


def our_bone(n):
    """MakeHuman kemik adı -> bizim kemik adı."""
    n = n.replace('____head', '').replace('____tail', '')
    S = 'L' if n.endswith('.L') else 'R' if n.endswith('.R') else ''
    b = n[:-2] if S else n
    if b in ('root', 'spine05', 'pelvis'): return 'hips'
    if b in ('spine04', 'spine03', 'spine02'): return 'spine'
    if b in ('spine01', 'breast', 'clavicle', 'shoulder01'): return 'chest'
    if b in ('neck01', 'neck02'): return 'neck'
    if b.startswith('upperarm'): return 'sh' + S
    if b == 'lowerarm01': return 'el' + S
    if b == 'lowerarm02': return 'fa' + S
    if b == 'wrist' or b.startswith('metacarpal'): return 'wr' + S
    if b.startswith('finger1'): return 'th' + S
    if b.startswith('finger'): return ('fi' if b.endswith('-1') else 'fd') + S
    if b.startswith('upperleg'): return 'hip' + S
    if b.startswith('lowerleg'): return 'kn' + S
    if b == 'foot': return 'an' + S
    if b.startswith('toe'): return 'toe' + S
    return 'head'  # neck03, head, çene, göz, dil ve yüz kasları


def faces_of(d):
    f = d['faces']; i = 0; out = []
    while i < len(f):
        t = f[i]; i += 1; n = 4 if t & 1 else 3
        vi = f[i:i + n]; i += n
        m = -1
        if t & 2: m = f[i]; i += 1
        if t & 4: i += 1
        uv = None
        if t & 8: uv = f[i:i + n]; i += n
        if t & 16: i += 1
        if t & 32: i += n
        if t & 64: i += 1
        if t & 128: i += n
        out.append((vi, m, uv))
    return out


def map_weights(d, nv):
    """three.js deri ağırlıkları (MakeHuman kemikleri) -> bizim kemiklerimiz, en güçlü 4, uint8."""
    names = [b['name'] for b in d['bones']]
    lut = np.array([BI[our_bone(n)] for n in names])
    si = np.array(d['skinIndices']).reshape(nv, -1); sw = np.array(d['skinWeights'], dtype=np.float64).reshape(nv, -1)
    W = np.zeros((nv, len(BONES)))
    for j in range(si.shape[1]): np.add.at(W, (np.arange(nv), lut[si[:, j]]), sw[:, j])
    W[W.sum(1) < 1e-6, BI['hips']] = 1
    idx = np.argsort(-W, axis=1)[:, :4]
    w = np.take_along_axis(W, idx, 1); w /= w.sum(1, keepdims=True)
    q = np.round(w * 255).astype(np.int32); q[:, 0] += 255 - q.sum(1)
    return idx.astype(np.uint8), q.astype(np.uint8), W / W.sum(1, keepdims=True)


def split_render(fl, uvs, keep=None):
    """(köşe, uv) çiftlerinden çizim köşeleri; dörtgenler üçgenlenir."""
    key = {}; rv_v = []; rv_uv = []; tris = []
    for vi, m, uv in fl:
        if keep is not None and not keep(m): continue
        ids = []
        for a, b in zip(vi, uv):
            k = (a, b)
            if k not in key: key[k] = len(rv_v); rv_v.append(a); rv_uv.append(uvs[b])
            ids.append(key[k])
        tris.append((ids[0], ids[1], ids[2]))
        if len(ids) == 4: tris.append((ids[0], ids[2], ids[3]))
    return np.array(rv_v), np.array(rv_uv), np.array(tris)


def decimate(pos, rv_v, rv_uv, tris, target):
    """Kaynaklı köşeler üzerinde sadeleştir, sonucu özgün köşelere oturt (çalışma zamanında aynı köşe dizisi kullanılır)."""
    if target <= 0: return np.zeros((0, 3), dtype=np.int64)
    if target >= len(tris): return tris
    wt = rv_v[tris]
    used, inv = np.unique(wt, return_inverse=True)
    s = pyfqmr.Simplify(); s.setMesh(pos[used], inv.reshape(-1, 3))
    s.simplify_mesh(target_count=int(target), aggressiveness=7, preserve_border=True, verbose=False)
    v2, f2, _ = s.getMesh()
    if len(f2) == 0: return np.zeros((0, 3), dtype=np.int64)
    _, near = cKDTree(pos[used]).query(v2)
    f = used[near][f2]
    f = f[(f[:, 0] != f[:, 1]) & (f[:, 1] != f[:, 2]) & (f[:, 0] != f[:, 2])]
    var = {}
    for i, v in enumerate(rv_v): var.setdefault(int(v), []).append(i)
    out = []; seen = set()
    for a, b, c in f:
        k = tuple(sorted((int(a), int(b), int(c))))
        if k in seen: continue
        seen.add(k)
        best = None
        for i in var[int(a)]:
            for j in var[int(b)]:
                for l in var[int(c)]:
                    e = np.abs(rv_uv[i] - rv_uv[j]).sum() + np.abs(rv_uv[j] - rv_uv[l]).sum() + np.abs(rv_uv[l] - rv_uv[i]).sum()
                    if best is None or e < best[0]: best = (e, i, j, l)
        out.append(best[1:])
    return np.array(out, dtype=np.int64).reshape(-1, 3)


def minrot(a, b):
    a = a / np.linalg.norm(a); b = b / np.linalg.norm(b)
    v = np.cross(a, b); c = float(a @ b); s = np.linalg.norm(v)
    if s < 1e-9: return np.eye(3)
    K = np.array([[0, -v[2], v[1]], [v[2], 0, -v[0]], [-v[1], v[0], 0]])
    return np.eye(3) + K + K @ K * ((1 - c) / (s * s))


def roty(t):
    c, s = np.cos(t), np.sin(t)
    return np.array([[c, 0, s], [0, 1, 0], [-s, 0, c]])


# ---------------------------------------------------------------- taban gövde
base = json.load(open(D + 'models/human_full_size.json'))
V = np.array(base['vertices'], dtype=np.float64).reshape(-1, 3)
NV = len(V)
BF = faces_of(base)
MAT = [m['DbgName'] for m in base['materials']]
BUV = np.array(base['uvs'][0]).reshape(-1, 2)
JP = base['metadata']['joint_pos_idxs']
b_wi, b_ww, b_W = map_weights(base, NV)
brv_v, brv_uv, btri = split_render(BF, BUV, keep=lambda m: MAT[m] == 'body')
body_verts = np.unique(brv_v)
print('gövde: çizim köşesi', len(brv_v), 'üçgen', len(btri))


def target(p):
    d = np.zeros_like(V)
    for l in open(T + p):
        if l[0] == '#' or not l.strip(): continue
        s = l.split(); d[int(s[0])] = [float(s[1]), float(s[2]), float(s[3])]
    return d


TC = {}
def tg(p):
    if p not in TC: TC[p] = target(p)
    return TC[p]


def lerp3(v):  # 0..1 -> (min, ortalama, max) ağırlıkları
    return (1 - 2 * v, 2 * v, 0) if v < 0.5 else (0, 2 - 2 * v, 2 * v - 1)


def body_of(gender, old, muscle, weight, extra=()):
    P = V.copy()
    for age, wa in (('young', 1 - old), ('old', old)):
        if wa <= 0: continue
        P += wa * tg(f'macrodetails/caucasian-{gender}-{age}.target')
        for mn, wm in zip(('minmuscle', 'averagemuscle', 'maxmuscle'), lerp3(muscle)):
            for wn, ww in zip(('minweight', 'averageweight', 'maxweight'), lerp3(weight)):
                if wm * ww > 0: P += wa * wm * ww * tg(f'macrodetails/universal-{gender}-{age}-{mn}-{wn}.target')
    for p, w in extra: P += w * tg(p)
    return P


# ad: (cinsiyet, yaşlılık 0..1, kas, kilo, ek hedefler)
VARIANTS = {
    'm_avg': ('male', 0.0, 0.55, 0.5, ()),
    'm_slim': ('male', 0.0, 0.4, 0.22, ()),
    'm_heavy': ('male', 0.1, 0.5, 0.86, ()),
    'm_musc': ('male', 0.0, 0.8, 0.5, ()),
    'm_old': ('male', 0.5, 0.45, 0.5, ()),
    'm_oldheavy': ('male', 0.5, 0.5, 0.84, ()),
    'f_avg': ('female', 0.0, 0.45, 0.45, ()),
    'f_slim': ('female', 0.0, 0.4, 0.25, ()),
    'f_heavy': ('female', 0.1, 0.45, 0.82, ()),
    'f_old': ('female', 0.5, 0.4, 0.55, ()),
}


def joints(P):
    return {k: P[v].mean(0) for k, v in JP.items()}


def rig_of(P):
    """Gövdeyi bizim iskeletimize oturtan kemik dönüşümleri (3x4) ve iskelet ölçüleri (birim uzay)."""
    J = joints(P)
    g = P[body_verts][:, 1].min()
    hj = (J['upperleg01.L____head'] + J['upperleg01.R____head']) / 2
    k = 0.92 / ((hj[1] - g) * 0.1)
    s = k * 0.1
    M = np.zeros((len(BONES), 3, 4)); pos = {}
    def setm(b, R, h, H):
        M[BI[b], :, :3] = R * s; M[BI[b], :, 3] = H - (R * s) @ h
    c0 = np.array([0, hj[1], hj[2]]); C0 = np.array([0, 0.92, 0])
    for b in ('hips', 'spine', 'chest', 'neck', 'head'): setm(b, np.eye(3), c0, C0)
    tors = lambda p: s * (p - c0) + C0
    down = np.array([0, -1.0, 0])
    for S in ('L', 'R'):
        sg = 1 if S == 'L' else -1
        # bacak
        h1, h2, h3 = J[f'upperleg01.{S}____head'], J[f'lowerleg01.{S}____head'], J[f'foot.{S}____head']
        hx = s * abs(h1[0])
        d1 = (h2 - h1) / np.linalg.norm(h2 - h1); R1 = minrot(d1, down)
        A1 = np.eye(3) + (0.43 / (s * np.linalg.norm(h2 - h1)) - 1) * np.outer(d1, d1)
        setm('hip' + S, R1 @ A1, h1, np.array([sg * hx, 0.92, 0]))
        d2 = (h3 - h2) / np.linalg.norm(h3 - h2); R2 = minrot(R1 @ d2, down) @ R1
        A2 = np.eye(3) + (0.41 / (s * np.linalg.norm(h3 - h2)) - 1) * np.outer(d2, d2)
        setm('kn' + S, R2 @ A2, h2, np.array([sg * hx, 0.49, 0]))
        for b in ('an', 'toe'): setm(b + S, np.eye(3), h3, np.array([sg * hx, 0.08, 0]))
        pos['hip' + S] = [sg * hx, 0.92, 0]; pos['kn' + S] = [sg * hx, 0.49, 0]; pos['an' + S] = [sg * hx, 0.08, 0]; pos['toe' + S] = [sg * hx, 0.025, 0.12]
        # kol
        a1, a2, a3 = J[f'upperarm01.{S}____head'], J[f'lowerarm01.{S}____head'], J[f'wrist.{S}____head']
        kn = np.mean([J[f'finger{i}-1.{S}____head'] for i in (2, 3, 4, 5)], 0)
        pp = np.mean([J[f'finger{i}-2.{S}____head'] for i in (2, 3, 4, 5)], 0)
        tp = np.mean([J[f'finger{i}-3.{S}____tail'] for i in (2, 3, 4, 5)], 0)
        shX, shY = s * abs(a1[0]), tors(a1)[1]
        Lu, Lf, Lh, Lp = (s * np.linalg.norm(x) for x in (a2 - a1, a3 - a2, kn - a3, pp - kn))
        e1 = (a2 - a1) / np.linalg.norm(a2 - a1); Q1 = minrot(e1, down)
        Hs = np.array([sg * shX, shY, 0]); He = Hs + [0, -Lu, 0]; Hw = He + [0, -Lf, 0]; Hk = Hw + [0, -Lh, 0]; Hp = Hk + [0, -Lp, 0]
        setm('sh' + S, Q1, a1, Hs)
        Q2 = minrot(Q1 @ (a3 - a2), down) @ Q1
        Q3 = minrot(Q2 @ (kn - a3), down) @ Q2
        # el: başparmak tarafı öne (+z), avuç içi gövdeye baksın
        rad = Q3 @ (J[f'finger2-1.{S}____head'] - J[f'finger5-1.{S}____head'])
        th = np.arctan2(rad[0], rad[2])  # +z'ye getiren y dönüşü
        Q3 = roty(-th) @ Q3
        setm('el' + S, Q2, a2, He)
        setm('fa' + S, roty(-th * 0.5) @ Q2, a2, He)
        setm('wr' + S, Q3, a3, Hw)
        Q4 = minrot(Q3 @ (pp - kn), down) @ Q3; setm('fi' + S, Q4, kn, Hk)
        Q5 = minrot(Q4 @ (tp - pp), down) @ Q4; setm('fd' + S, Q5, pp, Hp)
        t1 = J[f'finger1-1.{S}____head']; Ht = Hw + Q3 @ (s * (t1 - a3)); setm('th' + S, Q3, t1, Ht)
        for b, H in (('sh', Hs), ('el', He), ('fa', He), ('wr', Hw), ('fi', Hk), ('fd', Hp), ('th', Ht)): pos[b + S] = [round(float(x), 4) for x in H]
    top = tors(np.array([0, P[body_verts][:, 1].max(), 0]))[1]
    eye = tors((J['eye.L____head'] + J['eye.R____head']) / 2) if 'eye.L____head' in J else None
    info = {'k': round(float(k), 5), 'top': round(float(top), 4), 'pos': pos,
            'eye': [round(float(x), 4) for x in eye] if eye is not None else None,
            'chin': round(float(tors(J['jaw____tail'])[1]), 4)}
    return M, info


def skin(P, W4i, W4w, M):
    """Doğrusal karışımlı deri (denetim için; çalışma zamanındaki ile aynı)."""
    out = np.zeros_like(P)
    w = W4w.astype(np.float64) / 255
    for j in range(4):
        m = M[W4i[:, j]]
        out += w[:, j:j + 1] * (np.einsum('nij,nj->ni', m[:, :, :3], P) + m[:, :, 3])
    return out


arrays = []; head = {'bones': BONES, 'slots': SLOT, 'nv': NV, 'q': 3000, 'variants': {}, 'parts': {}, 'skins': {}}
def put(a, dt):
    a = np.ascontiguousarray(np.asarray(a).astype(dt))
    off = sum(len(x) for x in arrays)
    pad = (-off) % 4
    if pad: arrays.append(b'\0' * pad); off += pad
    arrays.append(a.tobytes())
    return [np.dtype(dt).name, off, int(a.size)]


BODIES = {}
for name, (gd, old, mu, wt, extra) in VARIANTS.items():
    P = body_of(gd, old, mu, wt, extra)
    M, info = rig_of(P)
    BODIES[name] = (P, M)
    sk = skin(P[body_verts], b_wi[body_verts], b_ww[body_verts], M)
    Wb = b_W[body_verts]
    Hd = sk[Wb[:, BI['head']] > 0.95]
    ey = info['eye'][1] if info['eye'] else info['top'] - 0.115
    up = Hd[Hd[:, 1] > ey + 0.03]; br = Hd[(Hd[:, 1] > ey + 0.03) & (Hd[:, 1] < ey + 0.07)]
    info['hd'] = {'top': info['top'], 'chin': info['chin'], 'rx': round(float(np.abs(up[:, 0]).max()), 4), 'zf': round(float(br[:, 2].max()), 4), 'zb': round(float(Hd[Hd[:, 1] > info['chin'] + 0.05][:, 2].min()), 4)}
    Tr = sk[(Wb[:, BI['chest']] + Wb[:, BI['spine']] > 0.8) & (sk[:, 1] > 1.14) & (sk[:, 1] < 1.30)]
    info['ts'] = {'rx': round(float(np.abs(Tr[:, 0]).max()), 4), 'zf': round(float(Tr[:, 2].max()), 4), 'zb': round(float(Tr[:, 2].min()), 4)}
    info['pos_q'] = put(np.round(P * 3000), np.int16)
    info['xf'] = put(M, np.float32)
    head['variants'][name] = info
    print(info['hd'], info['ts'])
    print(f"{name:11s} k={info['k']:.4f} boy={info['top']:.3f} shX={info['pos']['shL'][0]:.3f} shY={info['pos']['shL'][1]:.3f} el={info['pos']['elL'][1]:.3f} wr={info['pos']['wrL'][1]:.3f} hipX={info['pos']['hipL'][0]:.3f} "
          f"minY={sk[:, 1].min():.3f} genişlik={np.ptp(sk[:, 0]):.3f} derinlik={np.ptp(sk[:, 2]):.3f}")

PM, MM = BODIES['m_avg']; PFm, MF = BODIES['f_avg']

# ---------------------------------------------------------------- doku atlası
AW, AH = 4096, 2048
atlas = Image.new('RGBA', (AW, AH), (128, 128, 128, 255))
free512 = [(x * 512, y * 512) for y in range(4) for x in range(8)]
free256 = []; free128 = []
def cell(size):
    if size == 512: return free512.pop(0)
    if size == 256:
        if not free256:
            x, y = free512.pop(0); free256.extend([(x, y), (x + 256, y), (x, y + 256), (x + 256, y + 256)])
        return free256.pop(0)
    if not free128:
        x, y = cell(256); free128.extend([(x, y), (x + 128, y), (x, y + 128), (x + 128, y + 128)])
    return free128.pop(0)


def place(img, size):
    x, y = cell(size)
    atlas.paste(img.resize((size, size), Image.LANCZOS), (x, y))
    return [x, y, size]


def lum_of(a): return a[..., 0] * 0.2126 + a[..., 1] * 0.7152 + a[..., 2] * 0.0722


def gray_tint(rgba, mask=None, allow_fixed=False):
    """Renklendirilebilir doku: parlaklık ayrıntısı (gri, baskın ton ~1) + alfa 1; sabit renkli pikseller alfa 0.6."""
    a = np.asarray(rgba.convert('RGBA')).astype(np.float64) / 255
    rgb = a[..., :3]; lum = lum_of(rgb)
    mx = rgb.max(-1); mn = rgb.min(-1); sat = np.where(mx > 1e-6, (mx - mn) / np.maximum(mx, 1e-6), 0)
    out = np.zeros_like(a); out[..., 3] = 1
    ids = [0] if mask is None else [i for i in np.unique(mask)]
    for i in ids:
        m = np.ones(lum.shape, bool) if mask is None else mask == i
        if m.sum() < 16: continue
        dom = np.median(rgb[m], 0); dl = lum_of(dom); ds = (dom.max() - dom.min()) / max(dom.max(), 1e-6)
        fixed = np.zeros(lum.shape, bool)
        if allow_fixed:
            cd = np.linalg.norm(rgb - dom, axis=-1)
            fixed = m & (((dl < 0.5) & (lum > 0.6) & (sat < 0.3)) | ((sat > 0.45) & (cd > 0.35) & (ds < 0.3)))
        t = m & ~fixed
        ref = np.percentile(lum[t], 80) if t.sum() else 1
        g = np.clip(lum / max(ref, 1e-3), 0, 1)
        for c in range(3): out[..., c] = np.where(t, g, out[..., c])
        out[..., :3] = np.where(fixed[..., None], rgb, out[..., :3])
        out[..., 3] = np.where(fixed, 0.6, out[..., 3])
    return Image.fromarray(np.round(out * 255).astype(np.uint8), 'RGBA')


def cutout(rgba, tint):
    """Saç/kaş/kirpik/göz: alfa kesimi; tint -> gri + alfa 1, değilse özgün renk + alfa 0.6."""
    a = np.asarray(rgba.convert('RGBA')).astype(np.float64) / 255
    vis = a[..., 3] >= 0.5
    out = a.copy()
    if tint:
        lum = lum_of(a[..., :3]); ref = np.percentile(lum[vis], 85) if vis.sum() else 1
        g = np.clip(lum / max(ref, 1e-3), 0.12, 1)
        for c in range(3): out[..., c] = g
    out[..., 3] = np.where(vis, 1.0, 0)
    return Image.fromarray(np.round(out * 255).astype(np.uint8), 'RGBA')


# ciltler: renk korunur, ten rengi çarpanı çalışma zamanında (alfa 1)
SKINS = {'m_young': 'young_caucasian_male/textures/young_lightskinned_male_diffuse.png', 'm_mid': 'middleage_caucasian_male/textures/middleage_lightskinned_male_diffuse.png',
         'm_old': 'old_caucasian_male/textures/old_lightskinned_male_diffuse.png', 'f_young': 'young_caucasian_female/textures/young_lightskinned_female_diffuse.png',
         'f_mid': 'middleage_caucasian_female/textures/middleage_lightskinned_female_diffuse.png', 'f_old': 'old_caucasian_female/textures/old_lightskinned_female_diffuse.png'}
# yüz bölgesinin ortalama rengi (ten çarpanı buna göre): baş kemiğine bağlı gövde köşelerinin uv'leri
face_rv = np.where(b_W[brv_v][:, BI['head']] > 0.9)[0]
for k, p in SKINS.items():
    im = Image.open(D + 'skins/' + p).convert('RGB')
    a = np.asarray(im).astype(np.float64) / 255; H = a.shape[0]
    uv = brv_uv[face_rv]
    px = a[np.clip(((1 - uv[:, 1]) * H).astype(int), 0, H - 1), np.clip((uv[:, 0] * H).astype(int), 0, H - 1)]
    im.putalpha(255)
    head['skins'][k] = {'rect': place(im, 512), 'mean': [round(float(x), 4) for x in np.median(px, 0)]}

# ---------------------------------------------------------------- parçalar
def islands(n, tris):
    par = list(range(n))
    def f(a):
        while par[a] != a: par[a] = par[par[a]]; a = par[a]
        return a
    for t in tris:
        a = f(t[0])
        for j in (1, 2):
            b = f(t[j])
            if a != b: par[b] = a
    return np.array([f(i) for i in range(n)])


def add_part(name, path, kind, size, body='m_avg', dbl=False, tint=True, allow_fixed=False, lod=(0.35, 0.1), rough=0.85, texfile=None):
    p = json.load(open(D + f'proxies/{path}/{name}.json')); md = p['metadata']
    n = len(md['ref_vIdxs'])
    ref = np.array(md['ref_vIdxs']); w = np.array(md['weights'], dtype=np.float64); off = np.array(md['offsets'], dtype=np.float64)
    wi, ww, _ = map_weights(p, n)
    uvs = np.array(p['uvs'][0]).reshape(-1, 2)
    rv_v, rv_uv, tris = split_render(faces_of(p), uvs)
    P, M = BODIES[body]
    fit = (P[ref] * w[:, :, None]).sum(1) + off
    sk = skin(fit, wi, ww, M)
    slot = np.full(len(rv_v), SLOT[{'outfit': 'top', 'shoes': 'shoes', 'hair': 'hair', 'brow': 'hair', 'lash': 'none', 'eye': 'none'}[kind]], dtype=np.uint8)
    tex = Image.open(D + f'proxies/{path}/' + (texfile or p['materials'][0]['mapDiffuse'])).convert('RGBA')
    if kind == 'outfit':
        isl = islands(len(rv_v), tris)                      # uv adaları
        comp = islands(n, rv_v[tris])                       # ağ parçaları
        hipy = 0.92 + 0.10
        mask = np.zeros((512, 512), np.uint8); im = Image.fromarray(mask); dr = ImageDraw.Draw(im)
        up_isl = [i for i in np.unique(isl) if sk[rv_v[isl == i]][:, 1].mean() >= hipy]
        cnt = {}
        for i in up_isl:
            c = int(comp[rv_v[isl == i][0]]); cnt[c] = cnt.get(c, 0) + int((isl == i).sum())
        main_top = max(cnt, key=cnt.get) if cnt else -1
        low_comp = set(int(comp[rv_v[isl == i][0]]) for i in np.unique(isl) if i not in up_isl)
        for i in np.unique(isl):
            m = isl == i
            c = int(comp[rv_v[m][0]])
            if i not in up_isl or (c != main_top and c in low_comp): s_ = SLOT['bottom']
            elif c == main_top or (comp == c).sum() < 60: s_ = SLOT['top']
            else: s_ = SLOT['shirt']
            slot[m] = s_
        for t in tris:
            dr.polygon([(float(rv_uv[i][0]) * 512, (1 - float(rv_uv[i][1])) * 512) for i in t], fill=int(slot[t[0]]))
        tex = gray_tint(tex.resize((512, 512), Image.LANCZOS), np.asarray(im), allow_fixed)
    elif kind == 'shoes':
        tex = gray_tint(tex)
    else:
        tex = cutout(tex, tint)
    rect = place(tex, size)
    T0 = len(tris)
    t1 = decimate(fit, rv_v, rv_uv, tris, T0 * lod[0]); t2 = decimate(fit, rv_v, rv_uv, tris, T0 * lod[1])
    dv = np.array(md['deleteVerts'], dtype=np.uint8) if isinstance(md.get('deleteVerts'), list) else np.zeros(NV, np.uint8)
    idt = np.uint16 if len(rv_v) < 65536 else np.uint32
    head['parts'][name] = {
        'kind': kind, 'n': n, 'rect': rect, 'dbl': dbl, 'rough': rough, 'fx': bool(allow_fixed),
        'ref': put(ref, np.uint16), 'w': put(w, np.float32), 'off': put(off, np.float32), 'wi': put(wi, np.uint8), 'ww': put(ww, np.uint8),
        'rv_v': put(rv_v, np.uint16), 'rv_uv': put(np.round(np.clip(rv_uv, 0, 1) * 65535), np.uint16), 'rv_slot': put(slot, np.uint8),
        'tri': [put(tris, idt), put(t1, idt), put(t2, idt)], 'del': put(dv, np.uint8) if dv.any() else None,
    }
    print(f'{name:22s} {kind:6s} köşe {n:5d} çizim {len(rv_v):5d} üçgen {T0:5d}/{len(t1):4d}/{len(t2):4d} sil {int(dv.sum()):5d} y[{sk[:, 1].min():.2f},{sk[:, 1].max():.2f}] yuvalar {np.bincount(slot).tolist()}')


for n in ('male_casualsuit01', 'male_casualsuit02', 'male_casualsuit03', 'male_casualsuit04', 'male_casualsuit05', 'male_casualsuit06', 'male_worksuit01'):
    add_part(n, 'clothes/' + n, 'outfit', 512)
add_part('male_elegantsuit01', 'clothes/male_elegantsuit01', 'outfit', 512, allow_fixed=True)
for n in ('female_casualsuit01', 'female_casualsuit02', 'female_elegantsuit01', 'female_sportsuit01'):
    add_part(n, 'clothes/' + n, 'outfit', 512, body='f_avg')
for n in ('shoes01', 'shoes02', 'shoes03', 'shoes04', 'shoes05', 'shoes06'):
    add_part(n, 'clothes/' + n, 'shoes', 256, lod=(0.25, 0.06), rough=0.55)
for n in ('short01', 'short02', 'short03', 'short04', 'afro01', 'bob01', 'bob02', 'Braid01', 'long01', 'ponytail01'):
    add_part(n, 'hair/' + n, 'hair', 256, dbl=True, body='f_avg' if n in ('bob01', 'bob02', 'Braid01', 'long01', 'ponytail01') else 'm_avg', rough=0.6)
add_part('Low-Poly', 'eyes/Low-Poly', 'eye', 128, tint=False, lod=(1, 0), rough=0.2, texfile='textures/brown_eye.png')
add_part('eyebrow001', 'eyebrows/eyebrow001', 'brow', 128, lod=(0, 0), rough=0.8)
add_part('eyebrow010', 'eyebrows/eyebrow010', 'brow', 128, lod=(0, 0), rough=0.8)
add_part('eyelashes02', 'eyelashes/eyelashes02', 'lash', 128, tint=False, lod=(0, 0), rough=0.8)

# ---------------------------------------------------------------- gövde çizim verisi + uzaklık düzeyleri
bt1 = decimate(PM, brv_v, brv_uv, btri, 6500); bt2 = decimate(PM, brv_v, brv_uv, btri, 1600)
print('gövde düzeyleri', len(btri), len(bt1), len(bt2))
head['body'] = {'rv_v': put(brv_v, np.uint16), 'rv_uv': put(np.round(np.clip(brv_uv, 0, 1) * 65535), np.uint16),
                'tri': [put(btri, np.uint16), put(bt1, np.uint16), put(bt2, np.uint16)], 'wi': put(b_wi, np.uint8), 'ww': put(b_ww, np.uint8)}

# sakal/bıyık maskeleri (taban köşe başına 0..255): yüz eklemlerine göre (ağız çizgisi, burun altı, çene)
J = joints(PM)
ss = lambda a, b, x: np.clip((x - a) / (b - a), 0, 1) ** 2 * (3 - 2 * np.clip((x - a) / (b - a), 0, 1))
ym = J['oris01____tail'][1]; yn = J['oris06____head'][1]; yc = J['jaw____tail'][1]; ye = J['eye.L____head'][1]
x, y, z = PM[:, 0], PM[:, 1], PM[:, 2]; ax = np.abs(x)
isb = np.zeros(NV, bool); isb[body_verts] = True
face = isb & (b_W[:, BI['head']] > 0.5) & (z > 0.25) & (ax < 0.78)
line = (ym - 0.14) + ss(0.2, 0.55, ax) * (ye - 0.3 - (ym - 0.14))          # sakal üst sınırı: ortada alt dudağın altı, yanlarda favori
beard = face * (1 - ss(line - 0.04, line + 0.1, y)) * ss(yc - 0.5, yc - 0.2, y) * (1 - ss(0.6, 0.78, ax) * (y > ym))
lip_top = ym + 0.11 - 0.3 * np.maximum(0, ax - 0.12)
stache = face * (z > 1.25) * ss(lip_top - 0.02, lip_top + 0.03, y) * (1 - ss(yn - 0.02, yn + 0.05, y)) * (1 - ss(0.3, 0.42, ax))
head['body_masks'] = {'beard': put(np.round(beard * 255), np.uint8), 'stache': put(np.round(stache * 255), np.uint8)}
print('sakal köşesi', int((beard > 0.5).sum()), 'bıyık köşesi', int((stache > 0.5).sum()))
head['atlas'] = {'w': AW, 'h': AH}
0 and print('yüz eklemleri', {k: [round(float(x - (hj0 if i == 1 else 0)), 2) for i, x in enumerate(v)] for k, v in head['dbg_face'].items()} if False else sorted(head['dbg_face'].keys()))

blob = b''.join(arrays)
hj = json.dumps(head, separators=(',', ':')).encode()
hj += b' ' * ((-len(hj)) % 4)
with open(os.path.join(OUT, 'mh.bin'), 'wb') as f:
    f.write(struct.pack('<I', len(hj))); f.write(hj); f.write(blob)
atlas.save(os.path.join(OUT, 'mh.webp'), quality=90, method=6, exact=True)
print('mh.bin', (len(hj) + len(blob)) // 1024, 'KB; atlas', os.path.getsize(os.path.join(OUT, 'mh.webp')) // 1024, 'KB; boş 512 hücre', len(free512))
