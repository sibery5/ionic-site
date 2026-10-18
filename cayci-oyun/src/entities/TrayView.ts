import * as THREE from 'three';
import { TRAY } from '../config';
import { LAYER_HEIGHT, LAYER_SIZE, slotPos, type TraySim } from '../physics/tray';
import { GLASS_HEIGHT, GlassModel, makeGlass, makeTipJar, makeTray, TEA_COLORS } from '../world/models';

const UP = new THREE.Vector3(0, 1, 0);

/** TraySim'in görsel karşılığı: tepsi + bardaklar. */
export class TrayView {
  group = new THREE.Group();
  private tray: THREE.Group;
  private glasses: GlassModel[] = [];
  private glassTypes: string[] = [];
  private plates: THREE.Mesh[] = [];
  /** Tepsinin ortasındaki bahşiş kavanozu (açgözlü mod). */
  jar: THREE.Group | null = null;

  constructor() {
    this.tray = makeTray();
    this.group.add(this.tray);
  }

  /** Simülasyondaki tepsinin konum ve açısını uygula. */
  sync(sim: TraySim) {
    this.tray.position.copy(sim.pos);
    this.tray.quaternion.setFromUnitVectors(UP, sim.normal);
    // bardak listesi değiştiyse modelleri yeniden kur
    const types = sim.glasses.map((g) => g.type);
    if (types.join() !== this.glassTypes.join()) {
      for (const g of this.glasses) this.tray.remove(g.group);
      this.glasses = types.map((t) => makeGlass(t));
      for (const g of this.glasses) this.tray.add(g.group);
      this.glassTypes = types;
    }
    // kule katları arasındaki ara tepsiler
    const layers = Math.ceil(sim.glasses.length / LAYER_SIZE);
    while (this.plates.length < layers - 1) {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.008, 20), new THREE.MeshStandardMaterial({ color: 0xc9ccd1, metalness: 0.85, roughness: 0.3 }));
      p.castShadow = true;
      this.tray.add(p);
      this.plates.push(p);
    }
    this.plates.forEach((p, k) => {
      p.visible = k < layers - 1;
      p.position.set(0, (k + 1) * LAYER_HEIGHT - 0.004, 0);
    });
    sim.glasses.forEach((g, i) => {
      const m = this.glasses[i];
      const [ox, oy, oz] = slotPos(i, sim.glasses.length, sim.hasJar);
      m.group.position.set(ox, 0.006 + oy, oz);
      m.tea.scale.y = Math.max(0.02, g.fill);
      m.tea.visible = g.fill > 0.01;
      // çay yüzeyi eğimi: yüzey vektörünü tepsi uzayına çevirip hafif eğ
      const local = g.surface.clone().applyQuaternion(this.tray.quaternion.clone().invert());
      m.tea.rotation.set(local.z * 0.9, 0, -local.x * 0.9);
      // soğudukça biraz soluklaşır
      const base = new THREE.Color(TEA_COLORS[g.type]);
      const cold = Math.max(0, Math.min(1, (70 - g.temp) / 40));
      m.teaMat.color.copy(base).lerp(new THREE.Color(0x6b4a3a), cold * 0.35);
    });
  }

  /** Bahşiş kavanozunu göster/gizle; içindeki para yüksekliği tutara göre. */
  setJar(visible: boolean, amount: number) {
    if (!this.jar) {
      this.jar = makeTipJar();
      this.tray.add(this.jar);
    }
    this.jar.visible = visible;
    const coins = this.jar.getObjectByName('coins');
    if (coins) {
      const h = Math.min(1, Math.log10(1 + amount) / 2.4);
      coins.scale.y = Math.max(0.02, h);
      coins.visible = amount > 0;
    }
  }

  get trayGroup() {
    return this.tray;
  }

  /** Bardakların dünya konumları (buhar parçacıkları için). */
  glassWorldPositions(sim: TraySim): THREE.Vector3[] {
    return sim.glasses.map((_, i) => {
      const m = this.glasses[i];
      if (!m) return sim.pos.clone();
      return m.group.localToWorld(new THREE.Vector3(0, GLASS_HEIGHT, 0));
    });
  }

  get radius() {
    return TRAY.radius;
  }
}
