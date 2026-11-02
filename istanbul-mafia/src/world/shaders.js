// Dünya malzemeleri: PBR zemin (maske + döşenen detay dokuları), cephe (iç mekân yanılsamalı pencereler),
// çatı, sokak eşyası (atlas + köşe rengi), yaprak, çim, su, yol çizgisi. Hepsi MeshStandardMaterial
// üzerine onBeforeCompile yamalarıdır; sis, gölge ve çevre yansıması standart boru hattından gelir.
import * as THREE from 'three';
import {
  asphaltPBR, pavementPBR, cobblePBR, grassPBR, plasterPBR, brickPBR, roofTilePBR, noiseTexture, propAtlas,
} from '../core/textures.js';
import { HARBOR } from './map.js';
const HARBOR_BOX = HARBOR.box;

// Ortak (paylaşılan) uniform'lar. uNight ana oyundaki uniforms.uNight ile aynı nesneye bağlanır.
export const SHARED = {
  uTime: { value: 0 },
  uWet: { value: 0 }, // yağmurda ıslaklık 0..1 (sky.js günceller)
  uRain: { value: 0 }, // anlık yağış şiddeti 0..1
  uNight: { value: 0 },
  uLightning: { value: 0 },
  uCam: { value: new THREE.Vector3() },
};

const HASH = `
float hsh(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
`;

// Dünya konumu/normali için ortak vertex eki
const WP_VERT_DECL = 'varying vec3 vWP;\nvarying vec3 vWN;\n';
const WP_VERT = `
  vec4 wpX = vec4(transformed, 1.0);
  vec3 nX = objectNormal;
  #ifdef USE_INSTANCING
    wpX = instanceMatrix * wpX; nX = mat3(instanceMatrix) * nX;
  #endif
  wpX = modelMatrix * wpX;
  vWP = wpX.xyz; vWN = normalize(mat3(modelMatrix) * nX);
`;

function chunkReplace(name, from, to) { return THREE.ShaderChunk[name].split(from).join(to); }

// ---------- Genel PBR malzeme: dünya koordinatlı UV, pürüzlülük albedo alfasında, ıslaklık ----------
export function pbrMaterial(set, { color = 0xffffff, scale = 0.5, rough = 1, metal = 0, normalScale = 1, wetK = 1, side, vertexColors = false } = {}) {
  const mat = new THREE.MeshStandardMaterial({ color, map: set.map, normalMap: set.normalMap, roughness: rough, metalness: metal, vertexColors });
  if (side !== undefined) mat.side = side;
  mat.normalScale.set(normalScale, normalScale);
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uWet = SHARED.uWet;
    sh.uniforms.uTexScale = { value: scale };
    sh.uniforms.uWetK = { value: wetK };
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\n' + WP_VERT_DECL)
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\n' + WP_VERT);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vWP; varying vec3 vWN; uniform float uWet; uniform float uTexScale; uniform float uWetK;
        vec2 wUV(){ vec3 an = abs(vWN); return (an.y > max(an.x, an.z) ? vWP.xz : (an.x > an.z ? vec2(vWP.z, vWP.y) : vec2(vWP.x, vWP.y))) * uTexScale; }`)
      .replace('#include <map_fragment>', 'vec2 WUV = wUV(); vec4 mapT = texture2D(map, WUV); diffuseColor.rgb *= mapT.rgb;')
      .replace('#include <roughnessmap_fragment>', `float roughnessFactor = roughness * mapT.a;
        float wetF = uWet * uWetK * smoothstep(0.4, 0.9, vWN.y);
        diffuseColor.rgb *= 1.0 - 0.4 * wetF; roughnessFactor = mix(roughnessFactor, 0.12, wetF);`)
      .replace('#include <normal_fragment_begin>', chunkReplace('normal_fragment_begin', 'vNormalMapUv', 'WUV'))
      .replace('#include <normal_fragment_maps>', chunkReplace('normal_fragment_maps', 'vNormalMapUv', 'WUV'));
  };
  mat.envMapIntensity = 0.4;
  mat.customProgramCacheKey = () => 'pbrW';
  return mat;
}

// ---------- Simge yapı malzemesi: pbrMaterial + gece projektör aydınlatması (aşağıdan yukarı sönen sıcak ışık) ----------
export function floodMaterial(set, { flood = 0.3, floodCol = 0xffc890, floodTop = 60, ...opts } = {}) {
  const mat = pbrMaterial(set, opts);
  const prev = mat.onBeforeCompile;
  const fc = new THREE.Color(floodCol).multiplyScalar(flood);
  mat.onBeforeCompile = (sh) => {
    prev(sh);
    sh.uniforms.uNight = SHARED.uNight; sh.uniforms.uFlood = { value: fc }; sh.uniforms.uFloodTop = { value: floodTop };
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uNight; uniform vec3 uFlood; uniform float uFloodTop;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance += diffuseColor.rgb * uFlood * uNight * (0.45 + 0.55 * (1.0 - smoothstep(0.0, uFloodTop, vWP.y)));');
  };
  mat.customProgramCacheKey = () => 'pbrFlood';
  return mat;
}
// ---------- Gece yanan pencere/vitray: gündüz koyu cam (hafif yansıma), gece sıcak ışık ----------
export function nightGlowMaterial(color, emissive, k = 1.2, { rough = 0.25, metal = 0.2 } = {}) {
  const mat = new THREE.MeshStandardMaterial({ color, emissive, emissiveIntensity: 1, roughness: rough, metalness: metal });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uNight = SHARED.uNight; sh.uniforms.uGlowK = { value: k };
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uNight; uniform float uGlowK;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance *= 0.03 + uNight * uGlowK;');
  };
  mat.customProgramCacheKey = () => 'nightGlow';
  return mat;
}

// ---------- Zemin malzemesi (yol/kaldırım/arnavut/çim/toprak) ----------
// mask: R asfalt, G kaldırım taşı, B çim, A arnavut kaldırımı; kalan = toprak/çakıl.
export function terrainMaterial(maskTex, quality, { slab = false } = {}) {
  const A = asphaltPBR(quality), P = pavementPBR(quality), C = cobblePBR(quality), G = grassPBR(quality);
  const nz = noiseTexture();
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, metalness: 0, normalMap: A.normalMap });
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, {
      tMask: { value: maskTex }, tNoise: { value: nz },
      tAA: { value: A.map }, tAN: { value: A.normalMap }, tPA: { value: P.map }, tPN: { value: P.normalMap },
      tCA: { value: C.map }, tCN: { value: C.normalMap }, tGA: { value: G.map }, tGN: { value: G.normalMap },
      uWet: SHARED.uWet, uRain: SHARED.uRain, uTime: SHARED.uTime, uNight: SHARED.uNight,
    });
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\n' + WP_VERT_DECL)
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\n' + WP_VERT);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance += tSheen * uNight * vec3(1.0, 0.72, 0.42) * 0.05;')
      .replace('#include <common>', `#include <common>
        ${slab ? '#define SLAB' : ''}
        varying vec3 vWP; varying vec3 vWN;
        uniform sampler2D tMask, tNoise, tAA, tAN, tPA, tPN, tCA, tCN, tGA, tGN;
        uniform float uWet, uRain, uTime;
        ${HASH}
        uniform float uNight;
        vec3 tN; float tR; float tSheen;`)
      .replace('#include <map_fragment>', `
        vec2 wp = vWP.xz;
        vec4 M = texture2D(tMask, (wp + 1000.0) / 2000.0);
        vec4 nzL = texture2D(tNoise, wp / 151.0), nzM = texture2D(tNoise, wp / 23.0);
        vec2 uvA = wp / 5.0, uvP = wp / 2.4, uvC = wp / 1.7, uvG = wp / 3.1;
        vec4 aA = texture2D(tAA, uvA), nA = texture2D(tAN, uvA);
        vec4 aP = texture2D(tPA, uvP), nP = texture2D(tPN, uvP);
        vec4 aC = texture2D(tCA, uvC), nC = texture2D(tCN, uvC);
        vec4 aG = texture2D(tGA, uvG), nG = texture2D(tGN, uvG);
        float wR = M.r, wP = M.g, wG = M.b, wC = M.a;
        #ifdef SLAB
          wP += wR; wR = 0.0;
        #endif
        float wD = clamp(1.0 - wR - wP - wG - wC, 0.0, 1.0);
        // yükseklik tabanlı geçiş (keskin, doğal sınırlar)
        float jit = (nzM.b - 0.5) * 0.5;
        vec4 hw = vec4(wR + nA.a * 0.35, wP + nP.a * 0.35, wG + nG.a * 0.35 + jit, wC + nC.a * 0.35);
        float hD = wD + nG.a * 0.2 - jit;
        float mx = max(max(max(hw.x, hw.y), max(hw.z, hw.w)), hD) - 0.18;
        vec4 b = max(hw - mx, 0.0); float bD = max(hD - mx, 0.0);
        float bs = b.x + b.y + b.z + b.w + bD + 1e-4; b /= bs; bD /= bs;
        // asfalt: büyük ölçek ton farkı + yama (tamir) dikdörtgenleri + yağ lekeleri
        vec3 cA = aA.rgb * (0.85 + nzL.r * 0.3);
        vec2 pc = floor(wp / 7.0); float pr = hsh(pc);
        vec2 pf = fract(wp / 7.0);
        float pat = step(pr, 0.16) * step(0.12 + pr, pf.x) * step(pf.x, 0.9 - pr) * step(0.2, pf.y) * step(pf.y, 0.75 + pr);
        cA = mix(cA, cA * (pr < 0.08 ? 0.72 : 1.25), pat);
        cA *= 1.0 - smoothstep(0.66, 0.8, nzM.g) * 0.35;
        vec3 cP = aP.rgb * (0.9 + nzL.g * 0.2);
        vec3 cG = aG.rgb * mix(vec3(1.0), vec3(1.12, 1.0, 0.75), nzL.b);
        vec3 cDirt = mix(vec3(0.15, 0.12, 0.085), vec3(0.21, 0.18, 0.13), nzM.r) * (0.75 + aG.g * 0.6);
        vec3 alb = cA * b.x + cP * b.y + cG * b.z + aC.rgb * b.w + cDirt * bD;
        tR = aA.a * b.x + aP.a * b.y + aG.a * b.z + aC.a * b.w + 0.95 * bD;
        tN = nA.xyz * b.x + nP.xyz * b.y + nG.xyz * b.z + nC.xyz * b.w + nG.xyz * bD;
        float hgt = nA.a * b.x + nP.a * b.y + nG.a * b.z + nC.a * b.w;
        // ıslaklık: koyulaşma + çukurlarda su birikintisi + yağmur halkaları
        float wet = uWet * (1.0 - b.z * 0.6);
        float pud = wet * smoothstep(0.58, 0.72, nzL.g + (0.5 - hgt) * 0.35) * (1.0 - b.z);
        alb *= 1.0 - 0.42 * wet;
        alb = mix(alb, alb * 0.6, pud);
        tR = mix(tR, 0.22, wet * 0.8); tR = mix(tR, 0.03, pud);
        tN = mix(tN, vec3(0.5, 0.5, 1.0), pud * 0.9);
        if (uRain > 0.01) {
          vec2 rc = floor(wp * 1.7); vec2 rf = fract(wp * 1.7) - 0.5;
          float ph = fract(uTime * 1.3 + hsh(rc)); vec2 ctr = (vec2(hsh(rc + 3.1), hsh(rc + 7.7)) - 0.5) * 0.5;
          float d = length(rf - ctr); float ring = sin((d - ph * 0.45) * 55.0) * (1.0 - ph) * smoothstep(0.08, 0.0, abs(d - ph * 0.45));
          tN.xy += normalize(rf - ctr + 1e-4) * ring * 0.35 * uRain * (0.3 + pud);
        }
        diffuseColor.rgb *= alb;
        tSheen = wet * (0.4 + pud) * (1.0 - tR);`)
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = tR;')
      .replace('#include <normal_fragment_begin>', chunkReplace('normal_fragment_begin', 'vNormalMapUv', 'wp'))
      .replace('#include <normal_fragment_maps>', `
        vec3 mapN = tN * 2.0 - 1.0; mapN.xy *= normalScale; normal = normalize(tbn * mapN);`);
  };
  mat.envMapIntensity = 0.4;
  mat.customProgramCacheKey = () => 'terrain' + (slab ? 's' : 'g');
  return mat;
}

// ---------- Cephe malzemesi ----------
// Örnek öznitelikleri: aStyle(stil, tohum, ön yön kodu, bayraklar), aInfo(balkon maskesi, zemin kat yük., kat yük., yaş)
// Stiller: 0 sıva, 1 tuğla, 2 resmi/taş, 3 ahşap köşk, 4 cam kule, 5 villa
// Bayraklar: 1 dükkân zemin, 2 cumba (tekdüze katlar), 4 kör yan duvar, 8 emniyet şeritleri
export function facadeMaterial(quality) {
  const PL = plasterPBR(quality), BR = brickPBR(quality), nz = noiseTexture();
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.9, metalness: 0 });
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, {
      uNight: SHARED.uNight, uWet: SHARED.uWet, uTime: SHARED.uTime,
      tPA: { value: PL.map }, tPN: { value: PL.normalMap }, tBA: { value: BR.map }, tBN: { value: BR.normalMap }, tNoise: { value: nz },
    });
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        attribute vec4 aStyle; attribute vec4 aInfo;
        varying vec4 vStyle; varying vec4 vInfo; varying vec3 vLP; varying vec3 vLN; varying vec3 vDim; varying vec3 vWT; varying vec3 vVT; varying vec3 vVB;
        ${WP_VERT_DECL}`)
      .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
        ${WP_VERT}
        vStyle = aStyle; vInfo = aInfo; vLP = position; vLN = normal;
        mat4 imF = mat4(1.0);
        #ifdef USE_INSTANCING
          imF = instanceMatrix;
        #endif
        vDim = vec3(length(imF[0].xyz), length(imF[1].xyz), length(imF[2].xyz));
        vec3 rgt = vec3(normal.z, 0.0, -normal.x);
        if (abs(normal.y) > 0.5) rgt = vec3(1.0, 0.0, 0.0);
        vWT = normalize(mat3(modelMatrix) * mat3(imF) * rgt);
        vVT = normalize((viewMatrix * vec4(vWT, 0.0)).xyz);
        vVB = normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz);`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec4 vStyle; varying vec4 vInfo; varying vec3 vLP; varying vec3 vLN; varying vec3 vDim; varying vec3 vWT; varying vec3 vVT; varying vec3 vVB;
        varying vec3 vWP; varying vec3 vWN;
        uniform float uNight, uWet, uTime;
        uniform sampler2D tPA, tPN, tBA, tBN, tNoise;
        ${HASH}
        // iç mekân yanılsaması: pencere arkasında sanal oda (ışın-kutu kesişimi)
        vec3 room(vec2 p, vec3 V, float rw, float rh, float dep, float rnd, float lit, float shop) {
          vec3 t3 = vec3((V.x > 0.0 ? (rw - p.x) : -p.x) / V.x, (V.y > 0.0 ? (rh - p.y) : -p.y) / V.y, dep / max(V.z, 1e-3));
          float t = min(min(t3.x, t3.y), t3.z);
          vec3 h = vec3(p, 0.0) + V * t;
          vec3 wallC = mix(vec3(0.78, 0.72, 0.62), vec3(0.62, 0.7, 0.74), fract(rnd * 7.31));
          wallC = mix(wallC, vec3(0.8, 0.62, 0.55), step(0.75, fract(rnd * 3.7)));
          vec3 c;
          float fu = h.x / rw, fv = h.y / rh;
          if (t == t3.z) {
            c = wallC;
            if (shop > 0.5) {
              float sh = step(0.86, fract(fv * 5.0));
              c = mix(vec3(0.9, 0.88, 0.84), vec3(0.5, 0.42, 0.34), sh);
              c *= 0.55 + 0.7 * hsh(floor(vec2(fu * 16.0, fv * 5.0)) + rnd * 91.0);
            } else {
              if (fv < 0.34 && fu > 0.12 && fu < 0.82) c = mix(vec3(0.28, 0.2, 0.14), vec3(0.42, 0.32, 0.42), fract(rnd * 3.1));
              if (fv > 0.48 && fv < 0.72 && abs(fu - 0.45) < 0.12) c = vec3(0.32, 0.36, 0.3) * (0.8 + fract(rnd * 11.0) * 0.5);
            }
          } else if (t == t3.y) {
            c = V.y < 0.0 ? mix(vec3(0.42, 0.29, 0.18), vec3(0.6, 0.55, 0.5), fract(rnd * 5.7)) : vec3(0.92, 0.91, 0.88);
            if (V.y > 0.0) c += vec3(2.2, 1.7, 1.1) * lit * smoothstep(0.55, 0.0, length(vec2(h.x - rw * 0.5, h.z - dep * 0.45)));
          } else c = wallC * 0.8;
          c *= mix(1.0, 0.5, clamp(h.z / dep, 0.0, 1.0));
          return c;
        }
        float fGlass = 0.0; float fRough = 0.9; float fMetal = 0.0; vec3 fEmis = vec3(0.0); vec3 fN = vec3(0.0, 0.0, 1.0);`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        {
        vec3 base = diffuseColor.rgb;
        float st = floor(vStyle.x + 0.5); float seed = vStyle.y; int fl = int(vStyle.w + 0.5);
        bool shopF = (fl & 1) != 0, cumba = (fl & 2) != 0, blind = (fl & 4) != 0, police = (fl & 8) != 0;
        float age = vInfo.w;
        vec3 lp = vLP * vDim; float H = vDim.y;
        if (vLN.y > 0.5) {
          // düz çatı yüzeyi: çakıl/zift
          vec4 pa = texture2D(tPA, vWP.xz / 3.0);
          float n = texture2D(tNoise, vWP.xz / 17.0).g;
          diffuseColor.rgb = vec3(0.36, 0.35, 0.33) * (0.7 + pa.r * 0.4) * (0.8 + n * 0.4) * (1.0 - uWet * 0.35);
          fRough = mix(0.9, 0.3, uWet);
        } else if (vLN.y < -0.5) {
          diffuseColor.rgb = base * 0.4;
        } else {
          vec3 rgt = vec3(vLN.z, 0.0, -vLN.x);
          float L = abs(rgt.x) * vDim.x + abs(rgt.z) * vDim.z;
          float u = dot(lp, rgt) + L * 0.5, v = lp.y;
          int fc = int(vStyle.z + 0.5);
          vec3 fdir = fc == 0 ? vec3(0., 0., 1.) : fc == 1 ? vec3(0., 0., -1.) : fc == 2 ? vec3(1., 0., 0.) : vec3(-1., 0., 0.);
          float fd = dot(vLN, fdir);
          bool front = fd > 0.5, back = fd < -0.5, side = !front && !back;
          float faceId = vLN.x * 3.0 + vLN.z * 7.0 + 11.0;
          float gH = vInfo.y, fh = vInfo.z;
          float nF = cumba ? floor((H + 0.2) / fh) : floor((H - gH + 0.3) / fh);
          float fi = cumba ? floor(v / fh) + 1.0 : (v < gH ? 0.0 : 1.0 + floor((v - gH) / fh));
          float fy = cumba ? mod(v, fh) : (v < gH ? v : mod(v - gH, fh));
          vec3 Vw = normalize(vWP - cameraPosition);
          vec3 Vt = vec3(dot(Vw, normalize(vWT)), Vw.y, -dot(Vw, normalize(vWN)));
          float dayK = 1.0 - uNight;
          vec2 nuv = vec2(u, v);
          if (st > 3.5 && st < 4.5) {
            // ---- cam giydirme cephe (Levent kuleleri) ----
            float pw = 1.6; float ci = floor(u / pw); float fx = fract(u / pw);
            float fyn = fy / fh;
            float mull = step(fx, 0.035) + step(0.965, fx) + step(fyn, 0.03);
            float spand = step(fy, 0.95) * step(0.5, fi);
            float rc = hsh(vec2(ci, fi) + seed * 37.0 + faceId);
            vec3 tint = mix(vec3(0.16, 0.24, 0.3), vec3(0.24, 0.3, 0.32), rc * 0.6) * (0.85 + base * 0.3);
            if (mull > 0.5) { diffuseColor.rgb = vec3(0.55, 0.58, 0.6); fRough = 0.35; fMetal = 0.9; }
            else if (spand > 0.5) { diffuseColor.rgb = tint * 0.6; fRough = 0.15; fMetal = 0.7; }
            else {
              diffuseColor.rgb = tint; fRough = 0.04; fMetal = 0.75; fGlass = 1.0;
              float lit = step(0.38, hsh(vec2(fi, seed * 13.0 + faceId))) * step(0.15, rc);
              vec3 rm = room(vec2(fx * pw, fy), Vt, pw, fh, 7.0, rc, lit, 0.0);
              float panel = step(0.7, fract(u / 3.2)) * step(0.85, fyn);
              fEmis = rm * (0.06 * dayK) + uNight * lit * (vec3(0.85, 0.92, 1.0) * (0.35 + panel) + rm * 0.4);
            }
          } else {
            // ---- klasik cepheler ----
            float cwT = st > 2.5 && st < 3.5 ? 2.5 : (st > 4.5 ? 3.6 : 3.1);
            float n = max(1.0, floor(L / cwT + 0.35));
            if (side && L < 1.5) n = 1.0;
            float cw = L / n;
            float ci = floor(u / cw); float fx = u - (ci + 0.5) * cw;
            float ww = st > 2.5 && st < 3.5 ? min(0.95, cw - 0.55) : st > 1.5 && st < 2.5 ? min(1.4, cw - 0.8) : st > 4.5 ? min(1.9, cw - 0.6) : min(1.3, cw - 0.7);
            float wh = st > 4.5 ? 2.1 : st > 1.5 && st < 2.5 ? 1.9 : 1.7;
            float sill = st > 4.5 ? 0.5 : 0.85;
            if (cumba) { ww = cw - 0.3; }
            float rnd = hsh(vec2(ci, fi) + seed * 53.0 + faceId);
            float rnd2 = hsh(vec2(fi, ci) * 1.7 + seed * 19.0);
            int bm = int(vInfo.x + 0.5);
            bool balc = front && !cumba && fi >= 1.0 && ci < 15.0 && ((bm >> int(ci)) & 1) != 0;
            if (balc) { sill = 0.06; wh = 2.3; }
            bool winOK = fi >= 1.0 && fi <= nF && (front || (back && rnd > 0.12) || (side && !blind && rnd > 0.45));
            bool hasWin = winOK && abs(fx) < ww * 0.5 && fy > sill && fy < sill + wh;
            // duvar dokusu
            vec3 wall;
            vec4 pa = texture2D(tPA, nuv / 2.5);
            vec4 pn = texture2D(tPN, nuv / 2.5);
            vec4 mac = texture2D(tNoise, (vWP.xz + vWP.y * 0.7) / 43.0);
            vec4 nzM = texture2D(tNoise, vec2(u * 0.8 + faceId, v * 0.12));
            fN = pn.xyz * 2.0 - 1.0; fN.xy *= 0.6;
            if (st > 0.5 && st < 1.5) {
              vec4 ba = texture2D(tBA, nuv / 2.0); vec4 bn = texture2D(tBN, nuv / 2.0);
              wall = mix(ba.rgb, ba.rgb * base * 1.2, 0.25); fN = bn.xyz * 2.0 - 1.0;
            } else if (st > 2.5 && st < 3.5) {
              // ahşap bindirme tahta (köşk/yalı)
              float bd = fract(v / 0.19);
              wall = base * (0.8 + 0.2 * smoothstep(0.0, 0.85, bd)) * (0.9 + pa.r * 0.12);
              wall *= 1.0 - 0.45 * (1.0 - step(0.07, bd));
              fN = vec3(0.0, (bd < 0.12 ? -0.6 : 0.15), 1.0);
              float corner = step(u, 0.22) + step(L - 0.22, u);
              wall = mix(wall, vec3(0.93, 0.91, 0.86), clamp(corner, 0.0, 1.0));
            } else {
              wall = base * (pa.rgb / 0.86);
            }
            wall *= 0.86 + mac.r * 0.28;
            // yaşlanma: sıva dökülmesi (tuğla görünür)
            // (seyrek ve soluk: uzaktan kan lekesi gibi görünmesin)
            if (st < 0.5 && age > 0.75 && mac.b > 0.86 - (age - 0.75) * 0.2 && v > 0.8) {
              vec4 ba = texture2D(tBA, nuv / 2.0);
              float bl = dot(ba.rgb, vec3(0.3, 0.59, 0.11));
              vec3 brick = mix(vec3(bl), ba.rgb, 0.45) * 0.95;
              wall = mix(wall, brick, 0.7); fN = texture2D(tBN, nuv / 2.0).xyz * 2.0 - 1.0;
            }
            // kat silmeleri ve gölge çizgisi
            if (!cumba && st < 2.5 && fi >= 1.0) {
              float dl = v - gH - (fi - 1.0) * fh;
              if (dl < 0.16) { wall = mix(wall, vec3(0.86, 0.84, 0.78) * (0.85 + pa.r * 0.2), 0.85); fN = vec3(0.0, 0.5, 1.0); }
              else if (dl < 0.24) wall *= 0.72;
            }
            // köşe taşları (resmi ve sıva binalar)
            if (st > 1.5 && st < 2.5 || (st < 0.5 && seed > 0.6)) {
              float q = min(u, L - u);
              if (q < 0.45) { float blk = step(0.5, fract(v / 0.6)); wall = mix(wall, vec3(0.88, 0.86, 0.8) * (0.9 + 0.1 * blk), 0.8); if (fract(v / 0.6) < 0.06) wall *= 0.7; }
            }
            // emniyet: mavi-beyaz şerit
            if (police && v > gH - 0.6 && v < gH) wall = vec3(0.08, 0.2, 0.5);
            // su/kir izleri: pencere altından aşağı, zeminde kılcal nem, saçak altı kararma
            float streak = 0.0;
            if (winOK && abs(fx) < ww * 0.42) { float dy = sill - fy; if (dy > 0.0 && dy < 2.2) streak = (1.0 - dy / 2.2) * smoothstep(0.35, 0.75, nzM.b); }
            wall *= 1.0 - streak * (0.12 + age * 0.25);
            wall *= 1.0 - (1.0 - smoothstep(0.0, 1.1 + nzM.g * 0.6, v)) * (0.18 + age * 0.15);
            wall *= 1.0 - smoothstep(H - 1.4, H, v) * 0.12;
            // taban (subasman)
            if (v < 0.55 && !cumba) { wall = vec3(0.42, 0.41, 0.39) * (0.8 + pa.r * 0.3); fN = pn.xyz * 2.0 - 1.0; }
            vec3 col = wall;
            // pencere çevresi: söve, denizlik, gölgeli girinti
            float fyTop = sill + wh;
            bool reveal = winOK && abs(fx) < ww * 0.5 + 0.14 && fy > sill - 0.14 && fy < fyTop + 0.16 && !hasWin;
            if (reveal) {
              col = (st > 0.5 && st < 2.5) ? vec3(0.86, 0.84, 0.78) * (0.85 + pa.r * 0.2) : col * 0.82;
              if (fy < sill && fy > sill - 0.14) col = vec3(0.82, 0.8, 0.76);
            }
            // panjur (ahşap kepenk) — bazı binalarda pencere yanlarında
            bool shut = winOK && !balc && fract(seed * 7.0) > 0.55 && st < 3.5 && abs(fx) > ww * 0.5 + 0.02 && abs(fx) < ww + 0.05 && fy > sill && fy < fyTop && rnd2 > 0.25;
            if (shut) {
              vec3 sc = fract(seed * 13.0) > 0.5 ? vec3(0.18, 0.32, 0.2) : vec3(0.36, 0.22, 0.12);
              col = sc * (0.75 + 0.3 * step(0.4, fract(fy * 14.0)));
            }
            diffuseColor.rgb = col;
            fRough = 0.88;
            if (hasWin) {
              float fw = 0.075;
              bool inG = abs(fx) < ww * 0.5 - fw && fy > sill + fw && fy < fyTop - fw;
              vec3 frameC = st > 2.5 && st < 3.5 || st > 4.5 ? vec3(0.92) : (fract(seed * 29.0) > 0.6 ? vec3(0.35, 0.22, 0.14) : fract(seed * 29.0) > 0.25 ? vec3(0.9, 0.9, 0.88) : vec3(0.2, 0.22, 0.22));
              float mul = (ww > 1.0 ? step(abs(fx), 0.025) : 0.0) + step(abs(fy - (sill + wh * 0.7)), 0.025);
              bool closed = shopF && false;
              if (!inG || mul > 0.5) { diffuseColor.rgb = frameC; fRough = 0.5; fN = vec3(0.0, 0.0, 1.0); }
              else if (rnd2 < 0.06 && !balc && fract(seed * 7.0) > 0.55) {
                vec3 sc = fract(seed * 13.0) > 0.5 ? vec3(0.18, 0.32, 0.2) : vec3(0.36, 0.22, 0.12);
                diffuseColor.rgb = sc * (0.75 + 0.3 * step(0.4, fract(fy * 14.0)));
              } else {
                fGlass = 1.0; fRough = 0.05; fN = vec3(0.0, 0.0, 1.0);
                float lit = step(0.42, hsh(vec2(ci * 3.1, fi * 1.7) + seed * 71.0 + faceId));
                vec2 rp = vec2(fx + cw * 0.5, fy);
                vec3 rm = room(rp, Vt, cw, fh, 4.5, rnd, lit, 0.0);
                // perde / stor
                float cu = (fx + ww * 0.5) / ww; float cv = (fy - sill) / wh;
                float cwid = 0.08 + fract(rnd * 17.0) * 0.25;
                vec3 curt = mix(vec3(0.9, 0.86, 0.78), vec3(0.7, 0.3, 0.25), step(0.7, fract(rnd * 23.0)));
                float cm = step(0.35, fract(rnd * 5.3)) * (step(cu, cwid) + step(1.0 - cwid, cu));
                float blindM = step(0.85, fract(rnd * 9.1)) * step(1.0 - fract(rnd * 3.3) * 0.7, cv);
                cm = clamp(cm + blindM, 0.0, 1.0);
                rm = mix(rm, curt * (0.8 + 0.2 * sin(cu * 60.0)), cm);
                vec3 warm = mix(vec3(1.0, 0.78, 0.48), vec3(0.85, 0.9, 1.0), step(0.8, fract(rnd * 41.0)));
                float tv = step(0.93, fract(rnd * 61.0)) * (0.6 + 0.4 * sin(uTime * 7.0 + rnd * 50.0));
                diffuseColor.rgb = vec3(0.02, 0.025, 0.03);
                fEmis = rm * (0.42 * dayK) + uNight * lit * (rm * warm * 1.15 + tv * vec3(0.2, 0.35, 0.8));
                fEmis += uNight * (1.0 - lit) * rm * 0.015;
              }
            }
            // zemin kat: dükkân vitrini (önde) ya da demir parmaklıklı küçük pencereler
            if (fi < 0.5 && !cumba) {
              if (front && shopF) {
                float sw = cw - 0.5;
                bool inShop = abs(fx) < sw * 0.5 && fy > 0.4 && fy < 3.0;
                bool band = fy > 3.0 && fy < gH - 0.05;
                if (band) { diffuseColor.rgb = vec3(0.14, 0.14, 0.15); fRough = 0.4; }
                if (inShop) {
                  bool frm = abs(fx) > sw * 0.5 - 0.08 || fy < 0.48 || fy > 2.92 || (fy > 2.3 && fy < 2.36);
                  if (frm) { diffuseColor.rgb = vec3(0.25, 0.26, 0.27); fRough = 0.35; fMetal = 0.6; }
                  else {
                    float open = step(0.25, hsh(vec2(ci, seed * 7.0)));
                    float kep = (1.0 - open) * uNight + step(0.9, hsh(vec2(ci, seed * 3.0)));
                    if (kep > 0.5) {
                      diffuseColor.rgb = vec3(0.5, 0.52, 0.54) * (0.7 + 0.3 * step(0.5, fract(fy * 9.0))); fRough = 0.5; fMetal = 0.5;
                    } else {
                      fGlass = 1.0; fRough = 0.04; diffuseColor.rgb = vec3(0.02);
                      vec3 rm = room(vec2(fx + cw * 0.5, fy), Vt, cw, gH, 6.0, rnd + 0.37, 1.0, 1.0);
                      fEmis = rm * (0.55 * dayK + uNight * 1.25) * vec3(1.0, 0.92, 0.8);
                    }
                  }
                }
              } else if (!side || !blind) {
                bool sw = abs(fx) < 0.6 && fy > 1.3 && fy < 2.6 && rnd > 0.3;
                if (sw) {
                  float bars = step(0.8, fract((fx + 0.6) * 6.0)) + step(0.86, fract(fy * 3.0));
                  fGlass = 1.0; fRough = 0.06; diffuseColor.rgb = vec3(0.03);
                  float lit = step(0.6, rnd);
                  vec3 rm = room(vec2(fx + cw * 0.5, fy), Vt, cw, gH, 4.0, rnd, lit, 0.0);
                  fEmis = rm * (0.3 * dayK + uNight * lit);
                  if (bars > 0.5) { diffuseColor.rgb = vec3(0.1); fGlass = 0.0; fRough = 0.5; fMetal = 0.6; fEmis = vec3(0.0); }
                }
              }
            }
            // gece: sokak lambalarından alt cepheye yansıyan sıcak ışık
            fEmis += (1.0 - fGlass) * diffuseColor.rgb * uNight * 0.11 * vec3(1.0, 0.75, 0.45) * (1.0 - smoothstep(1.0, 9.0, v));
            diffuseColor.rgb *= 1.0 - uWet * 0.18 * (1.0 - fGlass);
          }
        }
        }`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n roughnessFactor = fRough;')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\n metalnessFactor = fMetal;')
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        if (abs(vLN.y) < 0.5) { vec3 T = normalize(vVT); vec3 B = normalize(vVB); normal = normalize(T * fN.x + B * fN.y + normal * fN.z); }`)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance += fEmis;');
  };
  mat.envMapIntensity = 0.55;
  mat.customProgramCacheKey = () => 'facadeV2';
  return mat;
}

// ---------- Çatı malzemesi (birleşik geometri): aKind 0 kiremit, 1 taş/beton silme (köşe rengi), 2 metal kubbe ----------
export function roofMaterial(quality) {
  const RT = roofTilePBR(quality), PL = plasterPBR(quality);
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, metalness: 0, normalMap: RT.normalMap });
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, { tRA: { value: RT.map }, tRN: { value: RT.normalMap }, tPA: { value: PL.map }, tPN: { value: PL.normalMap }, uWet: SHARED.uWet });
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aKind;\nvarying float vKind;\n' + WP_VERT_DECL)
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\n vKind = aKind;\n' + WP_VERT);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying float vKind; varying vec3 vWP; varying vec3 vWN; uniform sampler2D tRA, tRN, tPA, tPN; uniform float uWet; vec2 RUV; vec4 rA; vec4 rN;`)
      .replace('#include <map_fragment>', `
        vec3 an = abs(vWN);
        if (vKind < 0.5) {
          RUV = (an.x > an.z ? vWP.zx : vWP.xz) / 2.0;
          rA = texture2D(tRA, RUV); rN = texture2D(tRN, RUV);
        } else {
          RUV = (an.y > max(an.x, an.z) ? vWP.xz : (an.x > an.z ? vWP.zy : vWP.xy)) / 2.5;
          rA = texture2D(tPA, RUV); rN = texture2D(tPN, RUV);
          if (vKind > 1.5) { rA = vec4(vec3(0.95), 0.4); rN = vec4(0.5, 0.5, 1.0, 1.0); }
        }
        diffuseColor.rgb *= rA.rgb * (vKind < 0.5 ? 1.6 : 1.1);
        float wetR = uWet * step(0.3, vWN.y);
        diffuseColor.rgb *= 1.0 - wetR * 0.35;`)
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = mix(rA.a, 0.15, wetR); if (vKind > 1.5) roughnessFactor = 0.35;')
      .replace('#include <metalnessmap_fragment>', 'float metalnessFactor = vKind > 1.5 ? 0.6 : 0.0;')
      .replace('#include <normal_fragment_begin>', chunkReplace('normal_fragment_begin', 'vNormalMapUv', 'RUV'))
      .replace('#include <normal_fragment_maps>', 'vec3 mapN = rN.xyz * 2.0 - 1.0; normal = normalize(tbn * mapN);');
  };
  mat.envMapIntensity = 0.4;
  mat.customProgramCacheKey = () => 'roofV2';
  return mat;
}

// ---------- Sokak eşyası malzemesi: atlas + köşe rengi + aPBR(pürüzlülük, metal, ışıma, rüzgâr) ----------
export function propsMaterial({ double = false, alphaTest = 0.5 } = {}) {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, map: propAtlas(), alphaTest, side: double ? THREE.DoubleSide : THREE.FrontSide, roughness: 1, metalness: 1 });
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, { uNight: SHARED.uNight, uTime: SHARED.uTime, uWet: SHARED.uWet });
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec4 aPBR;\nvarying vec4 vPBR;\nuniform float uTime;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vPBR = aPBR;
        if (aPBR.w > 0.0) {
          vec3 ip = vec3(0.0);
          #ifdef USE_INSTANCING
            ip = instanceMatrix[3].xyz;
          #endif
          float ph = uTime * 4.0 + ip.x * 0.7 + ip.z * 0.3;
          float k = aPBR.w * max(position.x, 0.0);
          transformed.z += sin(ph + position.x * 2.2) * 0.12 * k;
          transformed.y += cos(ph * 0.8 + position.x * 1.7) * 0.03 * k;
        }`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec4 vPBR;\nuniform float uNight; uniform float uWet;')
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = mix(vPBR.x, vPBR.x * 0.35, uWet);')
      .replace('#include <metalnessmap_fragment>', 'float metalnessFactor = vPBR.y;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance += diffuseColor.rgb * vPBR.z * (0.12 + uNight * 1.6);');
  };
  mat.envMapIntensity = 0.45;
  mat.customProgramCacheKey = () => 'propsV2' + (double ? 'd' : '');
  return mat;
}

// ---------- Yaprak (ağaç taçları): alfa testli, rüzgârda salınım, örnek rengi ----------
export function foliageMaterial(tex, { double = true } = {}) {
  const mat = new THREE.MeshStandardMaterial({ map: tex, alphaTest: 0.42, side: double ? THREE.DoubleSide : THREE.FrontSide, roughness: 0.85, metalness: 0 });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = SHARED.uTime; sh.uniforms.uRain = SHARED.uRain;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime; uniform float uRain;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        {
          vec3 ip = vec3(0.0);
          #ifdef USE_INSTANCING
            ip = instanceMatrix[3].xyz;
          #endif
          float k = max(position.y - 1.5, 0.0) * 0.02 * (1.0 + uRain * 1.5);
          float ph = uTime * 1.6 + ip.x * 0.21 + ip.z * 0.17;
          transformed.x += (sin(ph) * 0.6 + sin(ph * 2.7 + position.y) * 0.25) * k;
          transformed.z += cos(ph * 0.8) * 0.4 * k;
        }`);
  };
  mat.envMapIntensity = 0.35;
  mat.customProgramCacheKey = () => 'foliage' + (double ? 'd' : '');
  return mat;
}

// ---------- Kameranın etrafında çim öbekleri (maskeye göre), tek çizim çağrısı ----------
export function grassField(maskTex, radius = 34, spacing = 0.55) {
  const N = Math.ceil((radius * 2) / spacing);
  const tex = propAtlas();
  // öbek: 3 çapraz dikey düzlem (ot dokusu)
  const base = new THREE.BufferGeometry();
  const pos = [], uv = [], nrm = [];
  const [u0, v0, u1, v1] = [576 / 2048, 1 - (1408 + 128) / 2048, (576 + 64) / 2048, 1 - 1408 / 2048];
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI, c = Math.cos(a) * 0.32, s = Math.sin(a) * 0.32, h = 0.55;
    const q = [[-c, 0, -s, u0, v0], [c, 0, s, u1, v0], [c, h, s, u1, v1], [-c, h, -s, u0, v1]];
    for (const k of [0, 1, 2, 0, 2, 3]) { pos.push(q[k][0], q[k][1], q[k][2]); uv.push(q[k][3], q[k][4]); nrm.push(0, 1, 0); }
  }
  base.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  base.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  base.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  const geo = new THREE.InstancedBufferGeometry();
  geo.index = null;
  geo.attributes = base.attributes;
  const grid = new Float32Array(N * N * 2);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { grid[(j * N + i) * 2] = i; grid[(j * N + i) * 2 + 1] = j; }
  geo.setAttribute('aGrid', new THREE.InstancedBufferAttribute(grid, 2));
  geo.instanceCount = N * N;
  const uOrigin = { value: new THREE.Vector2() };
  const mat = new THREE.MeshStandardMaterial({ map: tex, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.9, color: 0xd8e8c0 });
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, { tMask: { value: maskTex }, uOrigin, uSpacing: { value: spacing }, uRadius: { value: radius }, uTime: SHARED.uTime, uCam: SHARED.uCam });
    sh.vertexShader = sh.vertexShader.replace('#include <common>', `#include <common>
        attribute vec2 aGrid; uniform sampler2D tMask; uniform vec2 uOrigin; uniform float uSpacing, uRadius, uTime; uniform vec3 uCam; varying float vShade;
        ${HASH}`)
      .replace('#include <begin_vertex>', `
        vec2 cell = uOrigin + aGrid * uSpacing;
        float rr = hsh(cell * 1.31);
        vec2 wpos = cell + (vec2(hsh(cell + 1.3), hsh(cell + 7.1)) - 0.5) * uSpacing;
        float gm = texture2D(tMask, (wpos + 1000.0) / 2000.0).b;
        float dist = length(wpos - uCam.xz);
        float s = smoothstep(0.45, 0.7, gm) * (1.0 - smoothstep(uRadius * 0.55, uRadius, dist)) * (0.6 + rr * 0.8);
        float ang = rr * 6.2831; float ca = cos(ang), sa = sin(ang);
        vec3 transformed = vec3(position.x * ca - position.z * sa, position.y, position.x * sa + position.z * ca) * s;
        transformed.y *= 0.8 + hsh(cell + 3.3) * 0.7;
        transformed.x += sin(uTime * 2.1 + wpos.x * 0.35 + wpos.y * 0.27) * 0.09 * position.y * s;
        transformed.xz += wpos;
        vShade = 0.75 + rr * 0.4;`)
      .replace('#include <beginnormal_vertex>', 'vec3 objectNormal = vec3(0.0, 1.0, 0.0);');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vShade;')
      .replace('#include <color_fragment>', '#include <color_fragment>\n diffuseColor.rgb *= vShade;');
  };
  mat.envMapIntensity = 0.35;
  mat.customProgramCacheKey = () => 'grassField';
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.receiveShadow = true;
  mesh.userData.update = (cam) => {
    uOrigin.value.set(Math.floor((cam.x - radius) / spacing) * spacing, Math.floor((cam.z - radius) / spacing) * spacing);
  };
  return mesh;
}

// ---------- Su: iki katmanlı kayan normal, derinlik rengi, yağmurda dalgalı ----------
export function waterMaterial(normalTex) {
  const mat = new THREE.MeshStandardMaterial({ color: 0x184556, roughness: 0.06, metalness: 0.0, normalMap: normalTex, transparent: true, opacity: 0.96 });
  mat.normalScale.set(0.5, 0.5);
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, { uTime: SHARED.uTime, uRain: SHARED.uRain, uNight: SHARED.uNight });
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uTime, uRain, uNight;')
      .replace('#include <normal_fragment_maps>', `
        vec2 wuv = vNormalMapUv;
        vec3 n1 = texture2D(normalMap, wuv + vec2(uTime * 0.0035, uTime * 0.002)).xyz * 2.0 - 1.0;
        vec3 n2 = texture2D(normalMap, wuv * 0.31 + vec2(-uTime * 0.0012, uTime * 0.0026)).xyz * 2.0 - 1.0;
        vec3 n3 = texture2D(normalMap, wuv * 3.1 + vec2(uTime * 0.011, -uTime * 0.007)).xyz * 2.0 - 1.0;
        vec3 mapN = normalize(vec3(n1.xy + n2.xy * 1.2 + n3.xy * (0.25 + uRain * 0.8), n1.z * n2.z));
        mapN.xy *= normalScale * (1.0 + uRain * 0.6);
        normal = normalize(tbn * mapN);`)
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = roughness + uRain * 0.12;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        float fres = pow(1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0), 4.0);
        totalEmissiveRadiance += vec3(0.01, 0.035, 0.045) * (1.0 - uNight * 0.85) + vec3(0.9, 0.6, 0.3) * fres * uNight * 0.05;`);
  };
  mat.customProgramCacheKey = () => 'waterV2';
  return mat;
}

// ---------- Yol çizgisi (aşınmış boya, dünya koordinatlı aşınma) ----------
export function markingMaterial() {
  const nz = noiseTexture();
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.55, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, { tNoise: { value: nz }, uWet: SHARED.uWet });
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\n' + WP_VERT_DECL).replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\n' + WP_VERT);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWP; varying vec3 vWN; uniform sampler2D tNoise; uniform float uWet;')
      .replace('#include <alphamap_fragment>', `
        vec4 n1 = texture2D(tNoise, vWP.xz / 9.0), n2 = texture2D(tNoise, vWP.xz / 0.9);
        float wear = n1.r * 0.6 + n2.b * 0.5;
        diffuseColor.a *= smoothstep(0.32, 0.5, wear) * 0.92;
        diffuseColor.rgb *= 0.82 + n2.g * 0.2;`)
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = mix(roughness, 0.1, uWet);');
  };
  mat.envMapIntensity = 0.4;
  mat.customProgramCacheKey = () => 'marking';
  return mat;
}

// =====================================================================
// Gökyüzü (ortak GLSL) + Okyanus
// =====================================================================
// Gökyüzü uniform'ları: sky.js her karede günceller; gökyüzü kubbesi, çevre yansıması (PMREM) ve deniz
// yansıması aynı fonksiyonları kullanır. Renkler sahne-doğrusal (ton eşlemeden ÖNCEKİ) değerlerdir.
export const SKY = {
  uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uMoonDir: { value: new THREE.Vector3(0, 1, 0) },
  uZenith: { value: new THREE.Color(0.05, 0.15, 0.6) }, uHorizon: { value: new THREE.Color(0.5, 0.6, 0.8) },
  uGroundSky: { value: new THREE.Color(0.2, 0.2, 0.2) }, uSunGlow: { value: new THREE.Color(0.3, 0.25, 0.2) },
  uSunDisc: { value: new THREE.Color(20, 18, 15) }, uCloudLit: { value: new THREE.Color(1, 1, 1) },
  uCloudShade: { value: new THREE.Color(0.4, 0.42, 0.48) }, uMoonCol: { value: new THREE.Color(0.8, 0.8, 0.75) },
  uCover: { value: 0.2 }, uCloudDark: { value: 0 }, uStars: { value: 0 }, uMoonK: { value: 0 }, uFlash: { value: 0 },
  uEnvPass: { value: 0 }, uSkyTime: { value: 0 }, uWind: { value: new THREE.Vector2() },
  uMoonPhase: { value: 0.4 }, // 0 yeni ay, 0.5 dolunay
  tCloud: { value: null },
};

export const SKY_GLSL = `
uniform vec3 uSunDir, uMoonDir, uZenith, uHorizon, uGroundSky, uSunGlow, uSunDisc, uCloudLit, uCloudShade, uMoonCol;
uniform float uCover, uCloudDark, uStars, uMoonK, uFlash, uEnvPass, uSkyTime, uMoonPhase;
uniform vec2 uWind;
uniform sampler2D tCloud;
// gökyüzü degradesi: koyu mavi tepe -> soluk ufuk, güneş tarafında Mie parıltısı
vec3 skyBase(vec3 d) {
  float y = d.y;
  float h = 1.0 - clamp(y, 0.0, 1.0);
  float hw = h * h * h;
  vec3 c = mix(uZenith, uHorizon, hw);
  c = mix(c, uGroundSky, smoothstep(0.0, -0.25, y));
  float sd = max(dot(d, uSunDir), 0.0);
  c += uSunGlow * (pow(sd, 5.0) * (0.2 + 0.8 * hw) * 0.8 + pow(sd, 42.0) * 0.55);
  return c;
}
// bulut katmanı (düzleme izdüşüm, iki ölçek gürültü, kenar aşındırma, güneşe doğru öz-gölge, gümüş kenar)
vec4 skyClouds(vec3 d) {
  float dy = d.y;
  if (dy <= 0.0) return vec4(0.0);
  vec2 p = d.xz / (dy + 0.1);
  vec2 q = p * 0.085 + uWind;
  vec4 nA = texture2D(tCloud, q);
  vec4 nB = texture2D(tCloud, q * 3.1 + uWind * 0.7 + 0.37);
  float n = nA.r * 0.78 + nB.g * 0.22;
  float thr = mix(0.8, 0.24, uCover);
  float soft = 0.15 + uCover * 0.2;
  float dens = smoothstep(thr, thr + soft, n);
  dens = clamp(dens - (1.0 - dens) * nB.b * 0.45, 0.0, 1.0);
  float strat = smoothstep(0.62, 1.0, uCover);
  dens = max(dens, strat * (0.7 + 0.3 * nA.r));
  vec2 so = normalize(uSunDir.xz + 1e-4) * 0.04 * (1.0 - abs(uSunDir.y) * 0.5);
  float nL = texture2D(tCloud, q + so).r * 0.78 + nB.g * 0.22;
  float dL = smoothstep(thr, thr + soft * 1.6, nL);
  float thick = smoothstep(thr, min(thr + 0.5, 1.0), n);
  float light = exp(-2.0 * dL) * (1.0 - thick * 0.5);
  vec3 col = mix(uCloudShade, uCloudLit, clamp(light + 0.12, 0.0, 1.0));
  float sd = max(dot(d, uSunDir), 0.0);
  col += uSunGlow * pow(sd, 9.0) * (1.0 - dens) * 2.5 * (1.0 - uCover * 0.7);
  col *= 1.0 - uCloudDark * 0.5 * (0.4 + thick * 0.6);
  col += uFlash * vec3(0.85, 0.9, 1.0) * (0.3 + thick);
  // sirrus
  vec2 pr = vec2(p.x * 0.87 - p.y * 0.5, p.x * 0.5 + p.y * 0.87);
  float ci = smoothstep(0.62, 0.92, texture2D(tCloud, vec2(pr.x * 0.03, pr.y * 0.13) + uWind * 0.35).a);
  ci *= smoothstep(0.45, 0.7, texture2D(tCloud, p * 0.021 + uWind * 0.2 + 0.5).r) * (1.0 - uCover) * 0.35;
  float a = max(dens, ci);
  col = mix(uCloudLit * 0.92 + uSunGlow * pow(sd, 4.0) * 0.4, col, dens / max(a, 1e-3));
  col = mix(uHorizon, col, 0.35 + 0.65 * smoothstep(0.0, 0.3, dy));
  return vec4(col, a * smoothstep(0.0, 0.08, dy));
}
vec3 skyFull(vec3 d) { vec3 c = skyBase(d); vec4 cl = skyClouds(d); return mix(c, cl.rgb, cl.a); }
`;

// Gökyüzü kubbesi malzemesi (tek çizim: degrade + güneş + ay + yıldızlar + bulutlar + şimşek)
export function skyDomeMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: SKY, depthWrite: false, depthTest: true, side: THREE.BackSide, fog: false,
    vertexShader: `varying vec3 vDir; void main(){ vDir = position; vec4 wp = modelMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * viewMatrix * wp; gl_Position.z = gl_Position.w; }`,
    fragmentShader: `${SKY_GLSL}
      varying vec3 vDir;
      float h13(vec3 p){ p = fract(p * 0.1031); p += dot(p, p.yzx + 33.33); return fract((p.x + p.y) * p.z); }
      void main(){
        vec3 d = normalize(vDir);
        vec3 c = skyBase(d);
        if (uEnvPass < 0.5) {
          if (uStars > 0.001 && d.y > 0.0) {
            // Samanyolu: sabit galaktik düzlem çevresinde gürültülü parlak kuşak + koyu toz şeritleri
            vec3 GN = normalize(vec3(0.35, 0.42, 0.84));
            float gb = dot(d, GN);
            float band = exp(-gb * gb * 26.0);
            vec2 gp = vec2(atan(d.x, d.z) * 1.3, gb * 4.0);
            float mwN = texture2D(tCloud, gp * 0.35 + 0.13).r * 0.65 + texture2D(tCloud, gp * 1.1 + 0.71).g * 0.35;
            float dust = smoothstep(0.45, 0.75, texture2D(tCloud, gp * 0.8 + vec2(0.3, 0.9)).b) * exp(-gb * gb * 90.0);
            float mw = band * (0.35 + 0.9 * mwN) * (1.0 - 0.75 * dust);
            float hz = smoothstep(0.0, 0.35, d.y);
            c += vec3(0.62, 0.66, 0.85) * mw * 0.045 * uStars * hz;
            // yıldızlar (kuşakta daha yoğun), titreşim, renk sıcaklığı
            vec3 sp = d * 230.0; vec3 cell = floor(sp); float hs = h13(cell);
            float th = 0.991 - band * 0.012;
            if (hs > th) {
              vec3 ctr = cell + 0.5 + (vec3(h13(cell + 1.7), h13(cell + 3.1), h13(cell + 5.3)) - 0.5) * 0.5;
              float b = (hs - th) / (1.0 - th); float tw = 0.55 + 0.45 * sin(uSkyTime * (2.0 + hs * 9.0) + hs * 50.0) * (1.0 - 0.6 * d.y);
              vec3 sc = mix(vec3(1.0, 0.78, 0.6), vec3(0.7, 0.8, 1.0), h13(cell + 9.1));
              c += sc * smoothstep(0.34, 0.0, length(sp - ctr)) * (0.12 + b * b * 1.4) * tw * uStars * hz;
            }
          }
          if (uMoonK > 0.001) {
            float md = dot(d, uMoonDir), R = 0.03, cr = cos(R);
            float disc = smoothstep(cr - 0.00005, cr + 0.00005, md);
            vec3 up = abs(uMoonDir.y) < 0.99 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
            vec3 ax = normalize(cross(up, uMoonDir)); vec3 ay = cross(uMoonDir, ax);
            vec2 mu = vec2(dot(d, ax), dot(d, ay)) / R;
            float cra = texture2D(tCloud, mu * 0.3 + 0.5).g;
            // evreler: ay küresi normali ile güneş yönü (evre açısı) → aydınlık kısım; karanlık kısımda dünya ışığı
            vec3 mn = vec3(mu, sqrt(max(0.0, 1.0 - dot(mu, mu))));
            float pa = uMoonPhase * 6.2831853;
            float lit = smoothstep(-0.04, 0.08, dot(mn, vec3(sin(pa), 0.0, -cos(pa))));
            float frac = 0.5 - 0.5 * cos(pa);
            vec3 mc = uMoonCol * (0.6 + 0.5 * cra) * (1.0 - 0.3 * dot(mu, mu)) * (lit + 0.025);
            c = mix(c, mc + c * (1.0 - lit) * 0.6, disc * uMoonK);
            c += uMoonCol * 0.05 * (pow(max(md, 0.0), 400.0) * 2.0 + pow(max(md, 0.0), 30.0) * 0.35) * uMoonK * frac;
          }
          c += uSunDisc * smoothstep(0.99986, 0.99993, dot(d, uSunDir));
        } else c += uSunDisc * 0.015 * pow(max(dot(d, uSunDir), 0.0), 300.0);
        vec4 cl = skyClouds(d);
        c = mix(c, cl.rgb, cl.a);
        c += uFlash * vec3(0.5, 0.55, 0.7) * 0.35 * smoothstep(-0.1, 0.5, d.y);
        gl_FragColor = vec4(max(c, 0.0), 1.0);
      }`,
  });
}

// ---------- Okyanus ----------
// Deniz: kamerayı izleyen kutupsal ızgara (yakında 0.4 m, uzakta 100 m+), Gerstner tepe kaydırması, analitik
// dalga normali + iki katman ayrıntı normali, Fresnel gök/bulut yansıması (aynı gökyüzü fonksiyonu),
// karşı kıyı silüeti / gece şehir ışığı yansıması (ucuz kıyı ışın yürüyüşü), güneş/ay parıltısı,
// kıyıdan uzaklığa göre derinlik rengi, kıyı/iskele/gemi köpüğü ve Kelvin dümen suyu, yağmur halkaları.
// Tek çizim çağrısı. Gemi verisi: OCEAN.uShipP/uShipD (ships.js doldurur), engeller: OCEAN.uObs.
export const MAX_SHIPS = 14, MAX_OBS = 40;
export const OCEAN = {
  uWave: { value: 0.15 }, uCenter: { value: new THREE.Vector2() },
  uDeep: { value: new THREE.Color(0.005, 0.026, 0.036) }, uShallow: { value: new THREE.Color(0.018, 0.07, 0.066) },
  uWaterLight: { value: new THREE.Color(1, 1, 1) }, uSunCol: { value: new THREE.Color(1, 1, 1) }, uMoonLight: { value: 0 },
  uCityDay: { value: new THREE.Color(0.2, 0.22, 0.25) },
  uShipP: { value: Array.from({ length: MAX_SHIPS }, () => new THREE.Vector4(1e5, 1e5, 0, 1)) },
  uShipD: { value: Array.from({ length: MAX_SHIPS }, () => new THREE.Vector4(1, 1, 0, 0)) },
  uObs: { value: Array.from({ length: MAX_OBS }, () => new THREE.Vector4(1e5, 1e5, 0, 0)) },
  tOceanN: { value: null },
};

let obsN = 0;
// Köpük halkası oluşturacak sudaki engel (iskele, köprü ayağı): merkez + yarı boyutlar
export function oceanObstacle(x, z, hx, hz) {
  if (obsN >= MAX_OBS) return false;
  OCEAN.uObs.value[obsN++].set(x, z, hx, hz);
  return true;
}

const OCEAN_WAVES = `
const vec4 W0 = vec4(0.8, 0.6, 24.0, 1.0);
const vec4 W1 = vec4(0.28, 0.96, 14.0, 0.6);
const vec4 W2 = vec4(0.95, -0.31, 9.0, 0.38);
const vec4 W3 = vec4(-0.5, 0.866, 5.5, 0.22);
// (yükseklik, dh/dx, dh/dz)
vec3 wv(vec2 p, vec4 w, float t, float ph) {
  float k = 6.2831853 / w.z; float om = sqrt(9.81 * k);
  float a = k * dot(w.xy, p) - om * t + ph;
  float s = sin(a), c = cos(a);
  return vec3(s * w.w, c * w.w * k * w.x, c * w.w * k * w.y);
}
vec3 waves(vec2 p, float t) { return wv(p, W0, t, 0.0) + wv(p, W1, t, 1.7) + wv(p, W2, t, 4.1) + wv(p, W3, t, 2.3); }
`;

export function oceanMaterial(quality) {
  const uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog]);
  Object.assign(uniforms, SKY, OCEAN, { uTime: SHARED.uTime, uRain: SHARED.uRain, uNight: SHARED.uNight, uLightning: SHARED.uLightning });
  const hi = quality === 'high' ? 1 : 0;
  const mat = new THREE.ShaderMaterial({
    uniforms, fog: true, side: THREE.FrontSide,
    defines: { MAX_SHIPS, MAX_OBS, HIQ: hi, HARBOR_A: 'vec2(' + HARBOR_BOX[0].toFixed(1) + ',' + HARBOR_BOX[1].toFixed(1) + ')', HARBOR_B: 'vec2(' + HARBOR_BOX[2].toFixed(1) + ',' + HARBOR_BOX[3].toFixed(1) + ')' },
    vertexShader: `
      uniform float uTime, uWave; uniform vec2 uCenter;
      varying vec3 vW; varying float vDist; varying float vCrest;
      ${OCEAN_WAVES}
      #include <fog_pars_vertex>
      float bxD(vec2 p, vec2 a, vec2 b){ vec2 c = (a + b) * 0.5, e = (b - a) * 0.5; vec2 d = abs(p - c) - e; return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0); }
      // rıhtım / köprü / iskele yakınında dalga genliği kısılır (yapı ile su arasında hep görünür serbest yükseklik)
      float structD(vec2 p){
        float d = bxD(p, vec2(-1000.0, -1000.0), vec2(200.0, 70.0));
        d = min(d, bxD(p, vec2(-1000.0, 70.0), vec2(-850.0, 190.0)));
        d = min(d, bxD(p, vec2(-1000.0, 190.0), vec2(200.0, 820.0)));
        d = min(d, bxD(p, vec2(420.0, -1000.0), vec2(1000.0, 820.0)));
        d = min(d, length(p - vec2(312.0, 290.0)) - 16.0);
        d = min(d, bxD(p, vec2(-162.0, 60.0), vec2(-138.0, 200.0)));
        d = min(d, bxD(p, vec2(-512.0, 60.0), vec2(-488.0, 200.0)));
        d = min(d, bxD(p, vec2(200.0, -700.0), vec2(262.0, -560.0)));
        d = min(d, bxD(p, HARBOR_A, HARBOR_B));
        return d;
      }
      void main(){
        // modelMatrix: mesh.position.y = WATER_Y. (Eskiden yok sayılıyordu → su y≈0'da zeminle z-çakışması yapıp
        // yollarda/meydanlarda dalgalarla kayan lekeler olarak görünüyordu.)
        vec3 p = (modelMatrix * vec4(position, 1.0)).xyz + vec3(uCenter.x, 0.0, uCenter.y);
        float dist = length(p.xz - cameraPosition.xz);
        float fade = 1.0 - smoothstep(120.0, 520.0, dist);
        fade *= mix(0.12, 1.0, smoothstep(0.0, 38.0, structD(p.xz)));
        vec3 w = waves(p.xz, uTime) * uWave * fade;
        // Gerstner: tepelere doğru yatay sıkışma
        p.xz -= vec2(w.y, w.z) * 1.0;
        p.y += w.x;
        vCrest = w.x / max(uWave, 0.01);
        vW = p; vDist = dist;
        vec4 mvPosition = viewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: `
      ${SKY_GLSL}
      uniform float uTime, uWave, uRain, uNight, uLightning, uMoonLight;
      uniform vec3 uDeep, uShallow, uWaterLight, uSunCol, uCityDay;
      uniform vec4 uShipP[MAX_SHIPS]; uniform vec4 uShipD[MAX_SHIPS]; uniform vec4 uObs[MAX_OBS];
      uniform sampler2D tOceanN;
      varying vec3 vW; varying float vDist; varying float vCrest;
      ${OCEAN_WAVES}
      ${HASH}
      #include <fog_pars_fragment>
      float boxD(vec2 p, vec2 a, vec2 b){ vec2 c = (a + b) * 0.5, e = (b - a) * 0.5; vec2 d = abs(p - c) - e; return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0); }
      // kara mesafe alanı (harita: Avrupa 3 parça, Anadolu, Kız Kulesi adası)
      float landD(vec2 p){
        float d = boxD(p, vec2(-1000.0, -1000.0), vec2(200.0, 70.0));
        d = min(d, boxD(p, vec2(-1000.0, 70.0), vec2(-850.0, 190.0)));
        d = min(d, boxD(p, vec2(-1000.0, 190.0), vec2(200.0, 820.0)));
        d = min(d, boxD(p, vec2(420.0, -1000.0), vec2(1000.0, 820.0)));
        return d;
      }
      float landDI(vec2 p){ return min(landD(p), length(p - vec2(312.0, 290.0)) - 16.0); }
      void main(){
        vec2 P = vW.xz;
        float t = uTime;
        vec3 V = normalize(cameraPosition - vW);
        float fadeN = 1.0 - smoothstep(150.0, 900.0, vDist);
        // --- normal: analitik dalgalar + ayrıntı dokusu ---
        vec3 w = waves(P, t) * uWave;
        vec2 sl = vec2(w.y, w.z) * fadeN;
        float detK = (0.35 + uWave * 1.6 + uRain * 0.4);
        vec2 n1 = texture2D(tOceanN, P / 19.0 + vec2(t * 0.011, t * 0.007)).xy * 2.0 - 1.0;
        vec2 n2 = texture2D(tOceanN, P / 7.3 + vec2(-t * 0.017, t * 0.021)).xy * 2.0 - 1.0;
        vec2 n3 = texture2D(tOceanN, P / 2.6 + vec2(t * 0.04, -t * 0.031)).xy * 2.0 - 1.0;
        sl += (n1 * 0.35 + n2 * 0.25 * fadeN + n3 * 0.15 * (1.0 - smoothstep(20.0, 90.0, vDist))) * detK * 0.35;
        // yağmur halkaları
        if (uRain > 0.01 && vDist < 70.0) {
          vec2 rc = floor(P * 0.9); vec2 rf = fract(P * 0.9) - 0.5;
          float ph = fract(t * 1.1 + hsh(rc)); vec2 ctr = (vec2(hsh(rc + 3.1), hsh(rc + 7.7)) - 0.5) * 0.5;
          float d = length(rf - ctr); float ring = sin((d - ph * 0.45) * 50.0) * (1.0 - ph) * smoothstep(0.1, 0.0, abs(d - ph * 0.45));
          sl += normalize(rf - ctr + 1e-4) * ring * 0.25 * uRain * (1.0 - vDist / 70.0);
        }
        vec3 N = normalize(vec3(-sl.x, 1.0, -sl.y));
        float NdV = max(dot(N, V), 0.0);
        // --- derinlik (kıyıdan uzaklık) ---
        float ld = landDI(P);
        float shallow = 1.0 - smoothstep(2.0, 45.0, ld);
        // --- engeller (iskele, köprü ayakları) ---
        float ob = 1e4;
        for (int i = 0; i < MAX_OBS; i++) { vec4 o = uObs[i]; if (o.z <= 0.0) continue; ob = min(ob, boxD(P, o.xy - o.zw, o.xy + o.zw)); }
        // --- gemi gövde köpüğü + Kelvin dümen suyu ---
        float sf = 0.0, wakeN = 0.0;
        for (int i = 0; i < MAX_SHIPS; i++) {
          vec4 s = uShipP[i]; vec4 sd = uShipD[i];
          vec2 dd = P - s.xy;
          if (abs(dd.x) + abs(dd.y) > sd.x * 7.0 + 80.0) continue;
          vec2 f = vec2(s.z, s.w);
          float lz = dot(dd, f), lx = dd.x * f.y - dd.y * f.x;
          float k = clamp(sd.z / 6.0, 0.0, 1.0);
          float e = length(vec2(lx / (sd.y + 1.0 + k), (lz - sd.x * 0.05) / (sd.x + 1.5 + k * 2.0)));
          sf += smoothstep(1.2, 0.97, e) * (0.25 + 0.75 * smoothstep(-sd.x, sd.x, lz)) * (0.3 + k * 0.9);
          float b = -lz - sd.x * 0.85;
          if (b > 0.0 && k > 0.02) {
            float wdt = sd.y * 0.8 + b * 0.354;
            float decay = exp(-b / (25.0 + sd.x * 2.2));
            float arm = exp(-abs(abs(lx) - wdt) * (0.9 - 0.6 * smoothstep(0.0, 200.0, b))) * decay;
            float cen = smoothstep(sd.y * 1.1 + b * 0.06, 0.0, abs(lx)) * exp(-b / (15.0 + sd.x * 1.4));
            sf += (arm * 0.55 + cen * 0.9) * k;
            wakeN += cen * k;
          }
        }
        // --- köpük deseni ---
        float fpat = texture2D(tOceanN, P / 5.0 + vec2(t * 0.02, 0.0)).a * 0.6 + texture2D(tOceanN, P / 1.7 - vec2(0.0, t * 0.035)).a * 0.4;
        float shoreF = (1.0 - smoothstep(0.0, 2.6 + uWave * 6.0, ld + (fpat - 0.5) * 3.0)) * (0.55 + uWave);
        float obsF = (1.0 - smoothstep(0.0, 1.6 + uWave * 3.0, ob + (fpat - 0.5) * 1.5)) * 0.8;
        float crestF = smoothstep(0.75, 1.1, vCrest + fpat * 0.4) * smoothstep(0.25, 0.6, uWave) * 0.6;
        float fm = clamp(shoreF + obsF + sf + crestF, 0.0, 1.6);
        float foam = smoothstep(1.0 - min(fm, 1.0), 1.0 - min(fm, 1.0) + 0.25, fpat) * min(fm, 1.0);
        foam = max(foam, smoothstep(0.9, 1.4, fm) * 0.7);
        // --- yansıma: gökyüzü + bulutlar, karşı kıyı silüeti/ışıkları ---
        vec3 R = reflect(-V, N); R.y = abs(R.y) + 0.002;
        vec3 refl = skyFull(R);
        {
          vec2 rd = R.xz; float lh = length(rd);
          if (lh > 1e-3) {
            rd /= lh; float slope = R.y / lh; float tt = 2.0; float hitT = -1.0;
            for (int i = 0; i < 9; i++) { float s = landD(P + rd * tt); if (s < 1.0) { hitT = tt; break; } tt += max(s, 3.0); if (tt > 1400.0) break; }
            if (hitT > 0.0) {
              vec2 Q = P + rd * hitT; float y = slope * hitT;
              float bh = 9.0 + 30.0 * texture2D(tCloud, Q / 260.0).r;
              float cov = (1.0 - smoothstep(bh * 0.85, bh, y)) * (1.0 - smoothstep(700.0, 1400.0, hitT));
              vec3 city = mix(uCityDay, uHorizon, smoothstep(80.0, 1200.0, hitT) * 0.85);
              // gece pencereleri / sokak ışıkları
              vec2 cid = floor(vec2((Q.x + Q.y) / 3.3, y / 3.1));
              float lit = step(0.62, hsh(cid)) * step(2.5, y);
              vec3 warm = mix(vec3(1.0, 0.62, 0.28), vec3(0.9, 0.85, 0.7), hsh(cid + 9.0));
              city += uNight * (warm * lit * 1.4 + vec3(1.0, 0.55, 0.22) * (1.0 - smoothstep(0.0, 4.0, y)) * 2.0) * (1.0 - smoothstep(300.0, 1300.0, hitT) * 0.6);
              refl = mix(refl, city, cov);
            }
          }
        }
        float F = 0.02 + 0.98 * pow(1.0 - NdV, 5.0);
        F = mix(F, 0.06, 1.0 - fadeN) * (1.0 - uRain * 0.15);
        // --- su gövdesi: derinlik rengi + ışık saçılması (dalga tepelerinde turkuaz) ---
        vec3 body = mix(uDeep, uShallow, shallow) * uWaterLight;
        float sss = pow(max(dot(V, normalize(-uSunDir + vec3(0.0, 0.3, 0.0))), 0.0), 3.0) * max(vCrest + 0.3, 0.0) * fadeN;
        body += vec3(0.02, 0.09, 0.08) * uSunCol * sss * 0.5;
        vec3 col = mix(body, refl, F);
        // --- güneş parıltısı (uzaklıkla genişleyen yansıma yolu) ---
        vec3 H = normalize(uSunDir + V);
        float shin = mix(60.0, 900.0, fadeN);
        float spec = pow(max(dot(N, H), 0.0), shin) * (shin + 8.0) / 25.0;
        col += uSunCol * spec * 0.06 * (1.0 - uCover * 0.85) * step(0.0, uSunDir.y);
        // ay parıltısı
        vec3 Hm = normalize(uMoonDir + V);
        col += vec3(0.6, 0.7, 0.9) * pow(max(dot(N, Hm), 0.0), 300.0) * 3.0 * uMoonLight;
        // köpük (beyaz, ortam ışığıyla aydınlanır)
        col = mix(col, uWaterLight * 0.28 + uSunCol * 0.06, clamp(foam, 0.0, 1.0));
        col += uLightning * vec3(0.4, 0.45, 0.6) * F * 3.0;
        gl_FragColor = vec4(col, 1.0);
        #include <fog_fragment>
      }`,
  });
  return mat;
}

// Kutupsal okyanus ızgarası: halkalar üstel aralıklı (r = 13.5(e^{0.037 i} - 1)), ~150x320 = 48k köşe
export function oceanGeometry(rings = 150, segs = 320) {
  const pos = new Float32Array((rings + 1) * segs * 3);
  let k = 0;
  for (let i = 0; i <= rings; i++) {
    const r = 13.5 * (Math.exp(0.037 * i) - 1) * (3600 / (13.5 * (Math.exp(0.037 * 150) - 1)));
    for (let j = 0; j < segs; j++) { const a = (j / segs) * Math.PI * 2 + (i % 2) * (Math.PI / segs); pos[k++] = Math.cos(a) * r; pos[k++] = 0; pos[k++] = Math.sin(a) * r; }
  }
  const idx = [];
  for (let i = 0; i < rings; i++) for (let j = 0; j < segs; j++) {
    const a = i * segs + j, b = i * segs + ((j + 1) % segs), c = (i + 1) * segs + j, d = (i + 1) * segs + ((j + 1) % segs);
    idx.push(a, b, c, b, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
  return g;
}
