// Trafik sürücü yapay zekâsı (araç modellerinden ayrı): şerit takibi, IDM tabanlı yumuşak hızlanma/frenleme
// (hıza bağlı takip mesafesi), trafik ışığı + kavşak geçiş hakkı (kutuyu kilitleme, sola dönüşte karşıdan geleni
// bekleme), sinyaller, park etmiş/arızalı aracı sollama, park etme / park yerinden çıkma, oyuncuya tepki (korna,
// fren, kaçınma manevrası), yaya geçidi, kaza sonrası duraklama ve binalara girmeyen polis takibi (yol grafiğinde A*,
// doğrudan takipte ışın bıyıkları).
import { clamp, angleDiff } from '../core/util.js';
import { audio } from '../core/audio.js';

const _L = {}, _N = {};
const IDM_S0 = 2.2, IDM_B = 3.2;

function laneTarget(from, to, lane, o) {
  const dx = to.x - from.x, dz = to.z - from.z, l = Math.hypot(dx, dz) || 1;
  const fx = dx / l, fz = dz / l;
  o.ax = from.x - fz * lane; o.az = from.z + fx * lane; o.bx = to.x - fz * lane; o.bz = to.z + fx * lane; o.fx = fx; o.fz = fz; o.l = l;
  return o;
}

// IDM ivmesi: v hız, v0 istenen, s boşluk (tampon-tampon), dv yaklaşma hızı (v - lider hızı)
function idm(v, v0, s, dv, A, T) {
  const free = 1 - Math.pow(Math.max(0, v) / Math.max(0.5, v0), 4);
  if (s >= 1e8) return A * free;
  const ss = IDM_S0 + Math.max(0, v * T + (v * dv) / (2 * Math.sqrt(A * IDM_B)));
  return A * (free - (ss / Math.max(0.3, s)) ** 2);
}

// Kenarın düğüm a'dan b'ye genişliği
function edgeWidth(a, b) { for (const e of a.edges) if (e.a === b || e.b === b) return e.width; return 11; }
function laneFor(ai, a, b) { const w = edgeWidth(a, b); if (w >= 16) return ai.outer ? 5.8 : 2.1; return 2.5; }

// Polis takibi: yol grafiğinde oyuncuya A* rotası; chooseNext için bir sonraki düğüm
function routeNext(mgr, v, node, prev, target) {
  const ai = v.ai, map = mgr.game.map;
  ai.routeT = (ai.routeT || 0);
  if (!ai.route || ai.routeT <= 0 || ai.routeGoal !== map.nearestNode(target.x, target.z)) {
    ai.routeT = 2.5;
    ai.routeGoal = map.nearestNode(target.x, target.z);
    ai.route = map.path(node.x, node.z, target.x, target.z);
  }
  const R = ai.route;
  if (R && R.length) {
    const i = R.indexOf(node);
    if (i >= 0 && i < R.length - 1 && R[i + 1] !== prev) return R[i + 1];
  }
  return mgr.chooseNext(node, prev, target);
}

export function driveVehicleAI(mgr, v, dt) {
  const ai = v.ai;
  const g = mgr.game;
  const ctl = v.controls;
  if (ai.empty || ai.frozen) { ctl.throttle = 0; ctl.handbrake = true; v.ind = null; return; }
  // [kanun] ekip aracı olay yerinde duruyor: kontrollü fren, direksiyon düz, sonra el freni
  if (ai.mode === 'halt') {
    const fs = v.fs;
    ctl.steer += clamp(-ctl.steer, -3 * dt, 3 * dt);
    ctl.throttle = fs > 0.6 ? -clamp(fs / 6, 0.35, 1) : fs < -0.6 ? 0.5 : 0;
    ctl.handbrake = Math.abs(fs) < 1.5;
    v.ind = 'H';
    return;
  }
  // [kanun] gasp girişimi: silah doğrultulan sürücü durur (jackStop süresi boyunca)
  if (ai.jackStop > 0) {
    ai.jackStop -= dt;
    ctl.steer += clamp(-ctl.steer, -3 * dt, 3 * dt);
    ctl.throttle = v.fs > 0.6 ? -1 : 0; ctl.handbrake = Math.abs(v.fs) < 2; v.ind = 'H';
    return;
  }
  const player = g.player;
  let tx, tz, desired = ai.cruise;
  let lightStop = false;
  let stopDist = 1e9; // durulması gereken çizgiye uzaklık (IDM'de duran lider gibi)
  v.ind = null;
  if (ai.routeT > 0) ai.routeT -= dt;
  const fx = Math.sin(v.heading), fz = Math.cos(v.heading);
  const sp = v.fs;
  if (ai.mode === 'direct' || ai.mode === 'race') {
    const tgt = ai.mode === 'race' ? ai.points[ai.idx] : ai.target;
    if (!tgt) { ctl.throttle = 0; ctl.handbrake = true; return; }
    tx = tgt.x; tz = tgt.z;
    desired = ai.mode === 'race' ? v.def.maxSpeed * (ai.skill || 0.85) : ai.cruise;
    if (ai.mode === 'race' && Math.hypot(tx - v.pos.x, tz - v.pos.z) < 14) { ai.idx++; if (ai.idx >= ai.points.length) { ai.finished = true; ai.idx = ai.points.length - 1; } }
    if (ai.mode === 'race' && ai.points[ai.idx + 1]) {
      const n = ai.points[ai.idx + 1];
      const a1 = Math.atan2(tx - v.pos.x, tz - v.pos.z), a2 = Math.atan2(n.x - tx, n.z - tz);
      const turn = Math.abs(angleDiff(a1, a2));
      const dd = Math.hypot(tx - v.pos.x, tz - v.pos.z);
      if (turn > 0.8 && dd < 40) desired = Math.min(desired, 14 + dd * 0.3);
    }
  } else {
    const chase = ai.mode === 'chase';
    // [kanun] kovalayan araç oyuncuyu görmüyorsa son görülen konum / arama noktasına gider (ai.goal)
    const ptgt = (chase && ai.goal) || (player.vehicle || player).pos;
    const pickNext = (node, prev) => (chase ? routeNext(mgr, v, node, prev, ptgt) : mgr.chooseNext(node, prev, null));
    if (!ai.to) ai.to = g.map.other(ai.from.edges[0], ai.from);
    if (!ai.next) ai.next = pickNext(ai.to, ai.from);
    if (ai.outer === undefined) ai.outer = Math.random() < 0.5;
    if (ai.laneCur === undefined) ai.laneCur = laneFor(ai, ai.from, ai.to);
    let L = laneTarget(ai.from, ai.to, ai.laneCur, _L);
    let s = (v.pos.x - L.ax) * L.fx + (v.pos.z - L.az) * L.fz;
    const turnInfo = () => {
      const n = ai.next;
      const nx = n.x - ai.to.x, nz = n.z - ai.to.z, nl = Math.hypot(nx, nz) || 1;
      return angleDiff(Math.atan2(L.fx, L.fz), Math.atan2(nx / nl, nz / nl));
    };
    let turn = turnInfo();
    const wantOuter = turn < -0.5 ? true : turn > 0.5 ? false : ai.outer;
    const remain0 = L.l - s;
    if (remain0 < 45 && !ai.overtake) ai.outer = wantOuter;
    // şerit hedefi: park/sollama/yol verme ofsetleri
    let laneWant = laneFor(ai, ai.from, ai.to) + (ai.yieldT > 0 ? 1.0 : 0) + (ai.dodge || 0);
    if (ai.park) laneWant = edgeWidth(ai.from, ai.to) / 2 - 1.0;
    const laneRate = ai.park || ai.unpark ? 0.9 : ai.overtake ? 1.6 : 1.4;
    ai.laneCur += clamp(laneWant - ai.laneCur, -laneRate * dt, laneRate * dt);
    if (Math.abs(laneWant - ai.laneCur) > 0.4) v.ind = laneWant < ai.laneCur ? 'L' : 'R';
    if (ai.unpark && Math.abs(laneWant - ai.laneCur) < 0.3) ai.unpark = false;
    const nextLane = laneFor(ai, ai.to, ai.next);
    let N = laneTarget(ai.to, ai.next, nextLane, _N);
    const corner = () => {
      const cr = L.fx * N.fz - L.fz * N.fx;
      if (Math.abs(cr) < 0.2) return { px: L.bx, pz: L.bz, sP: L.l };
      const t = ((N.ax - L.ax) * N.fz - (N.az - L.az) * N.fx) / cr;
      const tc = clamp(t, L.l - 16, L.l + 16);
      return { px: L.ax + L.fx * tc, pz: L.az + L.fz * tc, sP: tc };
    };
    let C = corner();
    if (s >= C.sP - 0.6) {
      ai.from = ai.to; ai.to = ai.next;
      ai.next = pickNext(ai.to, ai.from);
      ai.laneCur = nextLane;
      ai.overtake = false; ai.dodge = 0;
      L = laneTarget(ai.from, ai.to, ai.laneCur, _L);
      s = (v.pos.x - L.ax) * L.fx + (v.pos.z - L.az) * L.fz;
      N = laneTarget(ai.to, ai.next, laneFor(ai, ai.to, ai.next), _N);
      C = corner();
      turn = turnInfo();
    }
    // ileri bakış noktası (yumuşak viraj)
    const look = 5 + Math.abs(sp) * 0.55;
    const sl = Math.max(0, s) + look;
    if (sl <= C.sP) { tx = L.ax + L.fx * sl; tz = L.az + L.fz * sl; }
    else { const rem = sl - C.sP; tx = C.px + N.fx * rem; tz = C.pz + N.fz * rem; }
    const toCorner = C.sP - s;
    ai.toCorner = toCorner;
    if (Math.abs(turn) > 0.5) {
      // viraj hızı: yanal ivme ~3 m/s² ile sınırlı yumuşak yavaşlama
      const vTurn = 5.5 + Math.max(0, toCorner) * 0.25;
      if (toCorner < 30) desired = Math.min(desired, vTurn);
      if (toCorner < 42) v.ind = turn > 0 ? 'L' : 'R';
    }
    const nodeTo = ai.to;
    const calm = !(ai.panic > 0) && !v.sirenOn;
    // trafik ışığı
    const tl = g.traffic;
    if (tl && ai.mode === 'traffic' && calm && nodeTo.edges.length >= 3) {
      const st = tl.lightState(nodeTo, ai.from);
      const stopS = L.l - tl.stopOffset(nodeTo, ai.from);
      const dStop = stopS - s - v.def.len * 0.5;
      if (st !== 'green' && dStop > -0.8) {
        // sarıda: duramayacak kadar yakınsa geç
        const canStop = st === 'red' || dStop > (sp * sp) / (2 * 4.5) + 0.5;
        if (canStop) { lightStop = true; stopDist = Math.min(stopDist, Math.max(0.05, dStop)); }
      }
      // kavşak kutusu: içeride karşıdan/yandan geçen araç varken girme; sola dönüşte karşıdan geleni bekle
      if (dStop > -0.5 && dStop < 14 && !lightStop) {
        let cross = 6; for (const e of nodeTo.edges) cross = Math.max(cross, e.width / 2);
        for (const o of mgr.list) {
          if (o === v || o.kind !== 'car' || o.destroyed) continue;
          const ox = o.pos.x - nodeTo.x, oz = o.pos.z - nodeTo.z;
          if (Math.abs(ox) > 40 || Math.abs(oz) > 40) continue;
          const ofx = Math.sin(o.heading), ofz = Math.cos(o.heading);
          const rel = Math.abs(angleDiff(v.heading, o.heading));
          const inBox = Math.abs(ox) < cross && Math.abs(oz) < cross;
          if (inBox && o.speed > 1 && rel > 0.6 && rel < Math.PI - 0.6) { stopDist = Math.min(stopDist, Math.max(0.05, dStop)); ai.boxWait = true; break; }
          if (turn > 0.5 && rel > Math.PI - 0.5 && o.speed > 2) {
            // karşı yönden gelen: düğüme doğru yaklaşıyor mu
            const along = -(ox * ofx + oz * ofz);
            if (along > 0 && along < 30) { stopDist = Math.min(stopDist, Math.max(0.05, dStop + cross * 0.6)); break; }
          }
        }
      }
    }
    ai.waitLight = lightStop;
    // park etme: hedef noktada dur, sürücü iner
    if (ai.park) {
      const remain = ai.park.s - s;
      stopDist = Math.min(stopDist, Math.max(0.05, remain));
      if (remain < 1.0 && Math.abs(sp) < 0.4 && Math.abs(ai.laneCur - laneWant) < 0.35) { finishPark(mgr, v); return; }
      if (remain < -12 || ai.to !== ai.park.to) ai.park = null;
    }
    if (chase) {
      desired = v.def.maxSpeed * 0.85;
      // [kanun] hedef: görülen oyuncu ya da olay yerindeki şüpheli (ai.goal). Görülmüyorsa yol takibiyle arama hızı.
      const seen = ai.goal ? ai.seen !== false : true;
      const plTarget = !ai.goal || ai.goal === (player.vehicle || player).pos;
      const tgp = ai.goal || (player.vehicle || player).pos;
      const pv = plTarget ? player.vehicle : null;
      const d = Math.hypot(tgp.x - v.pos.x, tgp.z - v.pos.z);
      if (!seen) desired = Math.min(desired, d < 40 ? 9 : 16);
      if (ai.noDirectT > 0) ai.noDirectT -= dt;
      if (ai.pitCd > 0) ai.pitCd -= dt;
      // doğrudan takip yalnız iki yanal ışın da açıksa (araç genişliği binaya sürtmesin)
      let direct = false;
      // yaya hedefe doğrudan dalmaz (kaldırıma/binaya sürmesin): yolda kalır, yakında durur, ekip iner
      if (seen && pv && d < 60 && !(ai.noDirectT > 0)) {
        ai.dirChkT = (ai.dirChkT || 0) - dt;
        if (ai.dirChkT <= 0) {
          ai.dirChkT = 0.25; // [kanun] ışın testleri seyrek
          const rx = -fz, rz = fx, w = v.def.wid * 0.5;
          ai.dirOK = g.physics.lineOfSight(v.pos.x + rx * w, 0.8, v.pos.z + rz * w, tgp.x, 0.8, tgp.z) && g.physics.lineOfSight(v.pos.x - rx * w, 0.8, v.pos.z - rz * w, tgp.x, 0.8, tgp.z);
        }
        direct = !!ai.dirOK;
      }
      if (direct) {
        const lead = clamp(d / 25, 0, 1.2);
        const tvx = pv ? pv.vx : 0, tvz = pv ? pv.vz : 0;
        tx = tgp.x + tvx * lead; tz = tgp.z + tvz * lead;
        desired = pv ? v.def.maxSpeed : Math.min(desired, d < 14 ? 0 : d);
        if (!pv && d < 14) desired = 0;
        ai.direct = true;
        ai.pitting = false;
        // [kanun] araç takibi taktikleri: PIT (arka çamurluğa yandan vur), önünü kesme, yavaşlayınca sıkıştırma
        if (pv) {
          const pf = pv.fwd, prx = -pf.z, prz = pf.x, psp = pv.speed;
          const relx = v.pos.x - pv.pos.x, relz = v.pos.z - pv.pos.z;
          const along = relx * pf.x + relz * pf.z, lat = relx * prx + relz * prz;
          const side = lat >= 0 ? 1 : -1, hl = pv.def.len * 0.5;
          if (psp < 3.5 && d < 20) {
            // sıkıştırma: biri önüne, biri arkasına
            const slot = ai.role === 'block' ? 1 : -1;
            tx = pv.pos.x + pf.x * slot * (hl + v.def.len * 0.5 + 1.2) + prx * side * 0.6;
            tz = pv.pos.z + pf.z * slot * (hl + v.def.len * 0.5 + 1.2) + prz * side * 0.6;
            const ds = Math.hypot(tx - v.pos.x, tz - v.pos.z);
            desired = ds < 2.5 ? 0 : Math.min(9, ds * 0.9);
            ai.boxing = true;
          } else if (ai.role === 'pit' && psp > 6 && d < 26 && !(ai.pitCd > 0)) {
            ai.boxing = false;
            if (along < -hl - 1.5) {
              // arkadan yanaş: arka tekerleğin yan hizasına
              tx = pv.pos.x - pf.x * hl * 0.6 + prx * side * (v.def.wid + 0.5) + pv.vx * 0.35;
              tz = pv.pos.z - pf.z * hl * 0.6 + prz * side * (v.def.wid + 0.5) + pv.vz * 0.35;
              desired = psp + 7;
            } else if (along < hl * 0.3) {
              // yan yana: içeri kır (PIT)
              tx = pv.pos.x - pf.x * hl * 0.5 - prx * side * 1.4 + pv.vx * 0.25;
              tz = pv.pos.z - pf.z * hl * 0.5 - prz * side * 1.4 + pv.vz * 0.25;
              desired = psp + 3; ai.pitting = true;
              if (Math.abs(lat) < (v.def.wid + pv.def.wid) * 0.5 + 0.35) { ai.pitCd = 4; if (g.wanted && g.wanted.lawLog) g.wanted.lawLog.pit++; }
            } else ai.pitCd = 2.5; // fazla öne geçti
          } else if (ai.role === 'block' && psp > 5 && d < 45 && d > 8) {
            ai.boxing = false;
            // önünü kes: oyuncunun 1.5 sn sonra olacağı yere
            tx = pv.pos.x + pv.vx * 1.5; tz = pv.pos.z + pv.vz * 1.5;
            desired = v.def.maxSpeed;
          } else ai.boxing = false;
        }
      } else ai.direct = false;
    }
  }
  // ---------------- engeller: lider araç, yayalar, oyuncu ----------------
  let gap = 1e9, leadV = 0, blocker = null;
  const chaseDirect = ai.mode === 'chase' && ai.direct;
  if (ai.mode !== 'race' && !chaseDirect) {
    const range = 8 + Math.abs(sp) * 2.2;
    if (ai.ignoreT > 0) ai.ignoreT -= dt;
    for (const o of mgr.list) {
      if (o === v || o.kind === 'air' || o.pos.y > 2) continue;
      const dx = o.pos.x - v.pos.x, dz = o.pos.z - v.pos.z;
      if (Math.abs(dx) > 45 || Math.abs(dz) > 45) continue;
      if (ai.ignoreT > 0 && o === ai.ignore) continue;
      const fd = dx * fx + dz * fz;
      if (fd < 0.5 || fd > range + v.def.len) continue;
      const lat = Math.abs(dx * -fz + dz * fx);
      const lim = (v.def.wid + o.def.wid) * 0.5 + (o.ai && !o.ai.empty ? 0.25 : 0.05);
      if (lat > lim) continue;
      const gp = fd - (v.def.len + o.def.len) * 0.5;
      if (gp < gap) { gap = gp; blocker = o; leadV = Math.max(0, o.vx * fx + o.vz * fz); }
    }
    ai.pedBlock = false;
    const pedCheck = (x, z, isPl) => {
      const dx = x - v.pos.x, dz = z - v.pos.z;
      const fd = dx * fx + dz * fz;
      if (fd < 0.5 || fd > range + v.def.len * 0.5) return;
      if (Math.abs(dx * -fz + dz * fx) > v.def.wid * 0.5 + 0.7) return;
      const gp = fd - v.def.len * 0.5 - 0.6;
      if (gp < gap) { gap = gp; blocker = null; leadV = 0; ai.pedBlock = true; ai.pedPlayer = isPl; }
    };
    if (!player.vehicle && !player.inInterior) pedCheck(player.pos.x, player.pos.z, true);
    for (const n of g.npcs.list) if (!n.dead && !n.vehicle && !n.passengerOf && !n.cargoOf && Math.abs(n.pos.x - v.pos.x) < 30 && Math.abs(n.pos.z - v.pos.z) < 30) pedCheck(n.pos.x, n.pos.z, false);
    if (ai.pedBlock) ai.honkFor = (ai.honkFor || 0) + dt * (ai.pedPlayer ? 1 : 0.5); else ai.honkFor = Math.max(0, (ai.honkFor || 0) - dt);
    ai.blocker = blocker;
    // [kanun] sirenli takip aracı yavaş giden / kenara çekilen aracın arkasında sürünmez: karşı şerit boşsa sollar
    if (ai.mode === 'chase' && blocker && !ai.overtake && gap < 16 && ai.toCorner > 30 && leadV < Math.max(4, desired * 0.6)) {
      let clear = true;
      for (const o of mgr.list) {
        if (o === v || o === blocker || o.kind !== 'car') continue;
        const dx = o.pos.x - v.pos.x, dz = o.pos.z - v.pos.z;
        const fd = dx * fx + dz * fz, lat = dx * -fz + dz * fx;
        if (fd > -6 && fd < 40 && lat < 0.5 && lat > -7 && Math.abs(angleDiff(v.heading, o.heading)) > 2.4) { clear = false; break; }
      }
      if (clear) { ai.overtake = blocker; ai.dodge = -((ai.laneCur || 2.5) + 2.2); ai.dodgeT = 5; ai.ignore = blocker; ai.ignoreT = 5; }
    }
    // kilitlenme ve sollama
    if (gap < 1e8 && Math.abs(sp) < 0.6 && gap < 4) {
      ai.blockT = (ai.blockT || 0) + dt;
      const bl = blocker;
      const stalled = bl && (!bl.ai || bl.ai.empty || bl.parked || bl.destroyed || (bl.driver && bl.speed < 0.3) || (bl.ai && bl.ai.crashT > 0));
      // [kanun] sirenli takip aracı ışıkta/yolda duran aracı da karşı şeritten geçer
      if (bl && ai.blockT > 1.5 && (stalled || (ai.mode === 'chase' && bl.speed < 1.5)) && (ai.mode === 'traffic' || ai.mode === 'chase') && !ai.overtake) {
        // karşı şerit boş mu: önümüzdeki 45 m'de bize doğru gelen araç yoksa sol şeride geç
        let clear = true;
        for (const o of mgr.list) {
          if (o === v || o === bl || o.kind !== 'car') continue;
          const dx = o.pos.x - v.pos.x, dz = o.pos.z - v.pos.z;
          const fd = dx * fx + dz * fz, lat = dx * -fz + dz * fx;
          if (fd > -6 && fd < 45 && lat < 0.5 && lat > -7 && Math.abs(angleDiff(v.heading, o.heading)) > 2.4) { clear = false; break; }
        }
        if (clear) { ai.overtake = bl; ai.dodge = -(ai.laneCur + 2.2); ai.dodgeT = 6; ai.ignore = bl; ai.ignoreT = 6; }
      }
      if (bl && ai.blockT > 4 && !(bl.ai && bl.ai.waitLight)) {
        const mutual = bl.ai && (bl.ai.blocker === v || bl.ai.blockT > 4);
        if (mutual && v.id < bl.id) { ai.ignore = bl; ai.ignoreT = 2.5; }
      }
      if (ai.blockT > 12 && !(bl && bl.ai && bl.ai.waitLight)) { ai.ignore = bl; ai.ignoreT = 2; ai.blockT = 0; }
    } else ai.blockT = 0;
    // sollama bitti mi: engel arkada kaldıysa şeride dön
    if (ai.overtake) {
      const o = ai.overtake;
      const behind = ((o.pos.x - v.pos.x) * fx + (o.pos.z - v.pos.z) * fz) < -(v.def.len + o.def.len) * 0.5 - 2;
      if (behind || ai.dodgeT <= 0) { ai.overtake = false; ai.dodge = 0; }
    }
    if (ai.dodgeT > 0) { ai.dodgeT -= dt; if (ai.dodgeT <= 0 && !ai.overtake) ai.dodge = 0; }
    // korna: yolu kesen oyuncu/yaya veya oyuncunun aracı
    const plBlock = blocker && blocker.driver === player && blocker.speed < 1;
    if (plBlock) ai.honkFor = (ai.honkFor || 0) + dt;
    if (ai.honkFor > 1.2 && v.honkT <= 0) { audio.horn(v.pos.x, v.pos.z); v.honkT = 2.5 + Math.random() * 2; ai.honkFor = 0; }
    // oyuncuya kaçınma: karşıdan hızla gelen oyuncu aracı veya önüne fırlayan oyuncu
    if (ai.mode === 'traffic') {
      const pv = player.vehicle;
      if (pv && !player.inInterior) {
        const dx = pv.pos.x - v.pos.x, dz = pv.pos.z - v.pos.z;
        const fd = dx * fx + dz * fz, lat = dx * -fz + dz * fx;
        const close = (v.vx - pv.vx) * (dx / (Math.hypot(dx, dz) || 1)) + (v.vz - pv.vz) * (dz / (Math.hypot(dx, dz) || 1));
        if (fd > 2 && fd < 28 && Math.abs(lat) < 2.6 && close > 8) {
          ai.dodge = lat > 0 ? -1.8 : 1.8; ai.dodgeT = 1.4; ai.evadeT = 1.2;
          if (v.honkT <= 0) { audio.horn(v.pos.x, v.pos.z); v.honkT = 3; }
        }
      }
      if (ai.evadeT > 0) { ai.evadeT -= dt; desired = Math.min(desired, Math.max(0, sp - 6)); }
    }
    // siren duyunca kenara çekil
    if (ai.mode === 'traffic' && !v.sirenOn) {
      if (ai.yieldT > 0) ai.yieldT -= dt;
      const S = mgr.sirens || [];
      for (const sv of S) {
        const dx = sv.pos.x - v.pos.x, dz = sv.pos.z - v.pos.z;
        const fd = dx * fx + dz * fz;
        if (fd < -2 && fd > -40 && Math.abs(dx * -fz + dz * fx) < 5) { ai.yieldT = 2; break; }
      }
      if (ai.yieldT > 0) desired = Math.min(desired, 3);
    }
    if (ai.panic > 0) { ai.panic -= dt; desired = v.def.maxSpeed * 0.8; stopDist = 1e9; }
    if (ai.crashT > 0 && !(ai.panic > 0)) { ai.crashT -= dt; desired = 0; v.ind = 'H'; }
  }
  if (v.honkT > 0) v.honkT -= dt;
  // ---------------- direksiyon: saf takip + (takipte) duvar bıyıkları ----------------
  let want = Math.atan2(tx - v.pos.x, tz - v.pos.z);
  if (chaseDirect && Math.abs(sp) > 2) {
    const L = Math.max(6, Math.abs(sp) * 1.1);
    const ray = (a) => { const h = g.physics.raycastShared(v.pos.x + Math.sin(a) * v.def.len * 0.5, 0.7, v.pos.z + Math.cos(a) * v.def.len * 0.5, Math.sin(a), 0, Math.cos(a), L); return h ? h.t : L; };
    const c = ray(want);
    if (c < L * 0.8) {
      const l = ray(want + 0.45), r = ray(want - 0.45);
      want += l > r ? 0.5 : -0.5;
      if (Math.max(l, r) < 4) { ai.direct = false; ai.noDirectT = 3; }
      desired = Math.min(desired, 6 + c * 1.2);
    }
  }
  const diff = angleDiff(v.heading, want);
  const reverse = ai.reverseT > 0;
  const ld = Math.max(3, Math.hypot(tx - v.pos.x, tz - v.pos.z));
  const wb = v.mesh.userData.template ? v.mesh.userData.template.wheelbase || v.def.len * 0.6 : v.def.len * 0.6;
  const steerMax = (v.P.steer || 0.6) / (1 + (sp * sp) / 700);
  const delta = Math.atan2(2 * wb * Math.sin(diff), ld);
  const steerT = clamp(v.P.steer === 0 ? diff * 2 : delta / steerMax, -1, 1) * (reverse ? -1 : 1);
  ctl.steer += clamp(steerT - ctl.steer, -4 * dt, 4 * dt);
  // ---------------- boylamsal: IDM ----------------
  const A = Math.min(3.2, v.def.accel * 0.4) * (ai.panic > 0 || ai.mode === 'chase' ? 2 : 1);
  const T = ai.mode === 'chase' ? 0.6 : 1.3 + (v.def.len > 7 ? 0.4 : 0);
  let acc = idm(Math.max(0, sp), Math.max(0.1, desired), gap, Math.max(0, sp) - leadV, A, T);
  if (stopDist < 1e8) acc = Math.min(acc, idm(Math.max(0, sp), Math.max(0.1, desired), stopDist, Math.max(0, sp), A, T * 0.6));
  if (desired <= 0.05) acc = Math.min(acc, -Math.max(0, sp) * 2 - 0.5);
  let thr;
  // [B1] pedal eşlemesi araç fiziğinin gerçek ivme/fren kapasitesine göre (vehicles.js: ~accel*0.5, brakeDecel ~10.5)
  if (acc >= 0) thr = clamp(acc / Math.max(2, v.def.accel * 0.55), 0, 1);
  else thr = clamp(acc / (v.brakeDecel || 10.5), -1, 0);
  // yumuşak pedal (ani sarsıntı yok), acil frende hızlı
  const rate = acc < -6 ? 8 : 2.5;
  ctl.throttle = reverse ? -1 : ctl.throttle + clamp(thr - ctl.throttle, -rate * dt, rate * dt);
  const stopped = Math.abs(sp) < 1.2 && (desired <= 0.05 || acc < -0.3 && (gap < 3 || stopDist < 2));
  ctl.handbrake = stopped && !reverse;
  if (ctl.handbrake && ctl.throttle > 0) ctl.throttle = 0;
  // sıkışma tespiti (önü boşken ilerleyemiyor) → geri vites
  if (desired > 3 && gap > 6 && stopDist > 6 && Math.abs(sp) < 0.8) { v.stuckT += dt; if (v.stuckT > 2.5) { ai.reverseT = 1.4; v.stuckT = 0; if (ai.mode === 'chase') { ai.direct = false; ai.noDirectT = 4; } } } else v.stuckT = 0;
  if (ai.reverseT > 0) { ai.reverseT -= dt; ctl.handbrake = false; }
  if (ai.rammedT > 0) { ai.rammedT -= dt; ctl.throttle = -0.8; ctl.handbrake = false; }
}

// Park etmeyi bitir: araç park hâline geçer, sürücü (sivil) iner ve kaldırıma yürür
function finishPark(mgr, v) {
  const g = mgr.game;
  v.ai = { empty: true };
  v.parked = true; v.parkedAI = true;
  v.controls.throttle = 0; v.controls.handbrake = true; v.ind = null;
  const f = v.fwd, rx = -f.z, rz = f.x;
  const off = v.def.wid / 2 + 0.8;
  // kaldırım tarafı: sağ (şerit ofseti pozitif = sağ)
  const x = v.pos.x + rx * off, z = v.pos.z + rz * off;
  if (g.npcs && g.npcs.list.length < 80) {
    const n = g.npcs.add('civilian', x, z);
    n.side = 1; n.path = []; n.cur = null; n.state = 'walk';
  }
}

// Trafik aracını yol kenarına park ettir (rastgele çağrılır)
export function maybePark(mgr, v) {
  const ai = v.ai;
  if (!ai || ai.mode !== 'traffic' || ai.park || ai.panic > 0 || v.mission || v.sirenOn || v.type === 'bus' || v.type === 'police' || v.type === 'ambulans') return false;
  if (edgeWidth(ai.from, ai.to) >= 16) return false;
  const L = laneTarget(ai.from, ai.to, ai.laneCur || 2.5, _L);
  const s = (v.pos.x - L.ax) * L.fx + (v.pos.z - L.az) * L.fz;
  if (L.l - s < 45) return false;
  // hedef park noktası boş mu
  const ps = s + 22;
  const off = edgeWidth(ai.from, ai.to) / 2 - 1.0;
  const px = ai.from.x + L.fx * ps - L.fz * off, pz = ai.from.z + L.fz * ps + L.fx * off;
  for (const o of mgr.list) if (o !== v && Math.abs(o.pos.x - px) < 7 && Math.abs(o.pos.z - pz) < 7) return false;
  // park yeri boş mu (bina/eşya ile çakışma yok)
  if (mgr.game.physics.city.overlapsRect(px, pz, 1.05, 2.6, Math.atan2(L.fx, L.fz), 0.15)) return false;
  ai.park = { s: ps, to: ai.to };
  return true;
}

// Park etmiş aracı trafiğe sok (sürücüsüyle birlikte)
export function maybeUnpark(mgr, v) {
  const g = mgr.game, map = g.map;
  if (!v.parked || v.owned || v.mission || v.roadblock || v.driver || v.destroyed || (v.ai && !v.ai.empty && v.ai.mode)) return false;
  if (v.hp < v.def.hp * 0.6 || v.kind !== 'car') return false;
  // aracın yönündeki kenarı bul
  const fx = Math.sin(v.heading), fz = Math.cos(v.heading);
  let best = null, bd = 1e9;
  for (const e of map.edges) {
    const ax = e.a.x, az = e.a.z, bx = e.b.x, bz = e.b.z;
    const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1;
    const t = clamp(((v.pos.x - ax) * dx + (v.pos.z - az) * dz) / l2, 0, 1);
    const d = Math.hypot(ax + dx * t - v.pos.x, az + dz * t - v.pos.z);
    if (d < bd) { bd = d; best = { e, t }; }
  }
  if (!best || bd > best.e.width / 2 + 1 || best.e.width >= 16) return false;
  const e = best.e;
  const ex = e.b.x - e.a.x, ez = e.b.z - e.a.z, el = Math.hypot(ex, ez) || 1;
  const fwd = (ex * fx + ez * fz) / el > 0;
  const from = fwd ? e.a : e.b, to = fwd ? e.b : e.a;
  // arkadan gelen var mı
  for (const o of mgr.list) {
    if (o === v || o.kind !== 'car' || !o.ai || o.ai.empty) continue;
    const dx = o.pos.x - v.pos.x, dz = o.pos.z - v.pos.z;
    const fd = dx * fx + dz * fz;
    if (fd < 4 && fd > -30 && Math.abs(dx * -fz + dz * fx) < 6) return false;
  }
  const lx = v.pos.x - from.x, lz = v.pos.z - from.z;
  const ux = (to.x - from.x) / el, uz = (to.z - from.z) / el;
  const lane = lx * -uz + lz * ux; // mevcut yanal ofset
  if (lane < 0.5) return false; // ters tarafa park etmiş: çıkmasın
  v.parked = false; v.parkedAI = false;
  v.ai = { mode: 'traffic', from, to, next: mgr.chooseNext(to, from), cruise: 10 + Math.random() * 4, outer: false, laneCur: lane, unpark: true };
  return true;
}
