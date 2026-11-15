#!/usr/bin/env python3
"""Telifsiz (CC0) Poly Haven modellerini oyun için küçültüp standart GLB dosyasına çevirir.

Kullanım:  python3 -I scripts/assets/pack-props.py [ad ...]      (adsız: tablodaki hepsi)
Çıktı:     assets/props/<ad>.glb (sadeleştirilmiş ağ + gömülü WebP dokular), assets/props/index.json, assets/props/KAYNAK.md
Her satır: Poly Haven kimliği, alınacak düğümler, hedef üçgen sayısı, doku boyutu, oyun uzayına dönüşüm (3x4).
"""
import io, json, os, struct, sys, urllib.request
import numpy as np
from PIL import Image
from scipy.spatial import cKDTree
import pyfqmr

ROOT = os.path.join(os.path.dirname(__file__), '..', '..')
OUT = os.path.join(ROOT, 'assets', 'props')
CACHE = os.environ.get('PH_CACHE', os.path.join(ROOT, '.testout', 'ph'))
UA = {'User-Agent': 'asset-packer'}

# silah uzayı: namlu +z, yukarı +y, tetik orijine yakın (kodla üretilen silahlarla aynı tutuş)
W_PISTOL = [[0, 0, -1, 0], [0, 1, 0, -0.035], [1, 0, 0, -0.036]]
W_RIFLE = [[0, 0, -1, 0], [0, 1, 0, 0], [1, 0, 0, 0.31]]
PROPS = {
    'pistol': dict(slug='service_pistol', nodes=['service_pistol_pistol_a', 'service_pistol_slide_a', 'service_pistol_hammer_a', 'service_pistol_trigger_a'], tris=99999, tex=512, xf=W_PISTOL),
    'sniper': dict(slug='bolt_action_rifle_7_62', nodes=['bolt_action_rifle_7_62_scope', 'bolt_action_rifle_7_62', 'bolt_action_rifle_7_62_bolt_a', 'bolt_action_rifle_7_62_trigger'], tris=99999, tex=512, xf=W_RIFLE),
}


def fetch(url, path):
    if os.path.exists(path) and os.path.getsize(path) > 0: return
    os.makedirs(os.path.dirname(path), exist_ok=True)
    data = urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=180).read()
    open(path, 'wb').write(data)


def download(slug):
    d = os.path.join(CACHE, slug)
    meta = os.path.join(d, 'files.json')
    fetch(f'https://api.polyhaven.com/files/{slug}', meta)
    g = json.load(open(meta))['gltf']['1k']['gltf']
    fetch(g['url'], os.path.join(d, slug + '.gltf'))
    for k, v in g['include'].items(): fetch(v['url'], os.path.join(d, k))
    return d


CT = {5120: np.int8, 5121: np.uint8, 5122: np.int16, 5123: np.uint16, 5125: np.uint32, 5126: np.float32}
NC = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4}


def quat_mat(q):
    x, y, z, w = q
    return np.array([[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)], [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)], [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]])


def load(d, slug, nodes):
    g = json.load(open(os.path.join(d, slug + '.gltf')))
    bufs = [open(os.path.join(d, b['uri']), 'rb').read() for b in g['buffers']]
    def acc(i):
        a = g['accessors'][i]; bv = g['bufferViews'][a['bufferView']]
        n = NC[a['type']]; dt = np.dtype(CT[a['componentType']])
        off = bv.get('byteOffset', 0) + a.get('byteOffset', 0); st = bv.get('byteStride', 0)
        raw = bufs[bv['buffer']]
        if st and st != dt.itemsize * n:
            out = np.zeros((a['count'], n), dt)
            for i2 in range(a['count']): out[i2] = np.frombuffer(raw, dt, n, off + i2 * st)
            return out
        return np.frombuffer(raw, dt, a['count'] * n, off).reshape(a['count'], n)
    by_mat = {}
    for nd in g['nodes']:
        if nd.get('name') not in nodes or 'mesh' not in nd: continue
        R = quat_mat(nd['rotation']) if 'rotation' in nd else np.eye(3)
        if 'scale' in nd: R = R * np.array(nd['scale'])
        t = np.array(nd.get('translation', [0, 0, 0]))
        for pr in g['meshes'][nd['mesh']]['primitives']:
            P = acc(pr['attributes']['POSITION']).astype(np.float64) @ R.T + t
            N = acc(pr['attributes']['NORMAL']).astype(np.float64) @ R.T
            UV = acc(pr['attributes']['TEXCOORD_0']).astype(np.float64) if 'TEXCOORD_0' in pr['attributes'] else np.zeros((len(P), 2))
            I = acc(pr['indices']).reshape(-1, 3).astype(np.int64)
            m = by_mat.setdefault(pr.get('material', 0), {'P': [], 'N': [], 'UV': [], 'I': [], 'n': 0})
            m['P'].append(P); m['N'].append(N); m['UV'].append(UV); m['I'].append(I + m['n']); m['n'] += len(P)
    out = {}
    for k, m in by_mat.items():
        out[k] = (np.concatenate(m['P']), np.concatenate(m['N']), np.concatenate(m['UV']), np.concatenate(m['I']))
    return g, out


def decimate(P, UV, I, target):
    """Kaynaklı köşelerde sadeleştir, özgün köşelere oturt (uv ve normal özgün köşeden gelir)."""
    if target >= len(I): return I
    key = np.round(P * 20000).astype(np.int64)
    _, first, inv = np.unique(key, axis=0, return_index=True, return_inverse=True)
    inv = inv.reshape(-1)
    s = pyfqmr.Simplify(); s.setMesh(P[first], inv[I])
    s.simplify_mesh(target_count=int(target), aggressiveness=7, preserve_border=True, verbose=False)
    v2, f2, _ = s.getMesh()
    _, near = cKDTree(P[first]).query(v2)
    f = near[f2]
    f = f[(f[:, 0] != f[:, 1]) & (f[:, 1] != f[:, 2]) & (f[:, 0] != f[:, 2])]
    var = {}
    for i, w in enumerate(inv): var.setdefault(int(w), []).append(i)
    out = []
    for a, b, c in f:
        best = None
        for i in var[int(a)][:4]:
            for j in var[int(b)][:4]:
                for l in var[int(c)][:4]:
                    e = np.abs(UV[i] - UV[j]).sum() + np.abs(UV[j] - UV[l]).sum() + np.abs(UV[l] - UV[i]).sum()
                    if best is None or e < best[0]: best = (e, i, j, l)
        out.append(best[1:])
    return np.array(out, dtype=np.int64)


def webp(path, size, q=86):
    im = Image.open(path).convert('RGB').resize((size, size), Image.LANCZOS)
    b = io.BytesIO(); im.save(b, 'WEBP', quality=q, method=6); return b.getvalue()


def pack(name, spec):
    d = download(spec['slug'])
    g, mats = load(d, spec['slug'], spec['nodes'])
    X = np.array(spec['xf'], dtype=np.float64); R, t = X[:, :3], X[:, 3]
    total = sum(len(m[3]) for m in mats.values())
    bin_ = bytearray(); views = []; accs = []; images = []; textures = []; materials = []; prims = []
    def view(data, target=None):
        while len(bin_) % 4: bin_.append(0)
        v = {'buffer': 0, 'byteOffset': len(bin_), 'byteLength': len(data)}
        if target: v['target'] = target
        bin_.extend(data); views.append(v); return len(views) - 1
    def accessor(a, ctype, typ, target, minmax=False):
        v = view(a.tobytes(), target)
        o = {'bufferView': v, 'componentType': ctype, 'count': len(a), 'type': typ}
        if minmax: o['min'] = [float(x) for x in a.min(0)]; o['max'] = [float(x) for x in a.max(0)]
        accs.append(o); return len(accs) - 1
    def tex(info):
        if info is None: return None
        uri = g['images'][g['textures'][info['index']]['source']]['uri']
        images.append({'bufferView': view(webp(os.path.join(d, uri), spec['tex'])), 'mimeType': 'image/webp'})
        textures.append({'extensions': {'EXT_texture_webp': {'source': len(images) - 1}}})
        return {'index': len(textures) - 1}
    ntri = 0
    for k, (P, N, UV, I) in mats.items():
        I = decimate(P, UV, I, spec['tris'] * len(I) / total)
        used, inv = np.unique(I, return_inverse=True)
        P2 = (P[used] @ R.T + t).astype(np.float32); N2 = (N[used] @ R.T).astype(np.float32)
        N2 /= np.maximum(np.linalg.norm(N2, axis=1, keepdims=True), 1e-9)
        idx = inv.reshape(-1).astype(np.uint16 if len(used) < 65536 else np.uint32)
        gm = g['materials'][k]; pbr = gm.get('pbrMetallicRoughness', {})
        m = {'name': gm.get('name', name), 'pbrMetallicRoughness': {'metallicFactor': pbr.get('metallicFactor', 1), 'roughnessFactor': pbr.get('roughnessFactor', 1)}}
        if 'baseColorFactor' in pbr: m['pbrMetallicRoughness']['baseColorFactor'] = pbr['baseColorFactor']
        bt = tex(pbr.get('baseColorTexture')); mr = tex(pbr.get('metallicRoughnessTexture')); nt = tex(gm.get('normalTexture'))
        if bt: m['pbrMetallicRoughness']['baseColorTexture'] = bt
        if mr: m['pbrMetallicRoughness']['metallicRoughnessTexture'] = mr; m['occlusionTexture'] = mr
        if nt: m['normalTexture'] = nt
        if gm.get('alphaMode') == 'BLEND': m['pbrMetallicRoughness'].update({'baseColorFactor': [0.05, 0.07, 0.09, 1], 'metallicFactor': 0.2, 'roughnessFactor': 0.08})  # dürbün camı: koyu, parlak
        materials.append(m)
        prims.append({'attributes': {'POSITION': accessor(P2, 5126, 'VEC3', 34962, True), 'NORMAL': accessor(N2, 5126, 'VEC3', 34962), 'TEXCOORD_0': accessor(UV[used].astype(np.float32), 5126, 'VEC2', 34962)},
                      'indices': accessor(idx, 5123 if idx.dtype == np.uint16 else 5125, 'SCALAR', 34963), 'material': len(materials) - 1})
        ntri += len(idx) // 3
    while len(bin_) % 4: bin_.append(0)
    js = {'asset': {'version': '2.0', 'generator': 'pack-props.py', 'copyright': 'CC0 1.0 - polyhaven.com/a/' + spec['slug']}, 'scene': 0, 'scenes': [{'nodes': [0]}], 'nodes': [{'name': name, 'mesh': 0}],
          'meshes': [{'name': name, 'primitives': prims}], 'materials': materials, 'textures': textures, 'images': images, 'accessors': accs, 'bufferViews': views,
          'buffers': [{'byteLength': len(bin_)}], 'extensionsUsed': ['EXT_texture_webp'], 'extensionsRequired': ['EXT_texture_webp']}
    jb = json.dumps(js, separators=(',', ':')).encode(); jb += b' ' * ((-len(jb)) % 4)
    path = os.path.join(OUT, name + '.glb')
    with open(path, 'wb') as f:
        f.write(struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(jb) + 8 + len(bin_)))
        f.write(struct.pack('<II', len(jb), 0x4E4F534A)); f.write(jb)
        f.write(struct.pack('<II', len(bin_), 0x004E4942)); f.write(bin_)
    allp = np.concatenate([m[0] for m in mats.values()]) @ R.T + t
    print(f'{name:8s} {spec["slug"]:24s} üçgen {total}->{ntri} dosya {os.path.getsize(path) // 1024} KB kutu x[{allp[:, 0].min():.3f},{allp[:, 0].max():.3f}] y[{allp[:, 1].min():.3f},{allp[:, 1].max():.3f}] z[{allp[:, 2].min():.3f},{allp[:, 2].max():.3f}]')


os.makedirs(OUT, exist_ok=True)
names = sys.argv[1:] or list(PROPS)
for n in names: pack(n, PROPS[n])
json.dump(sorted(PROPS), open(os.path.join(OUT, 'index.json'), 'w'))
with open(os.path.join(OUT, 'KAYNAK.md'), 'w') as f:
    f.write('# Hazır modeller — kaynak ve lisans\n\nBu klasördeki GLB dosyaları **Poly Haven** (polyhaven.com) modellerinden `scripts/assets/pack-props.py` ile üretilir.\n'
            'Poly Haven içeriğinin tamamı **CC0 1.0**: ticari kullanım serbest, atıf gerekmez.\n\n| Dosya | Kaynak |\n|---|---|\n')
    for n in sorted(PROPS): f.write(f'| `{n}.glb` | https://polyhaven.com/a/{PROPS[n]["slug"]} |\n')
