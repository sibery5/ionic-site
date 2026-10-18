import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import type { Quality } from '../core/save';

// Son işlem: lambalarda ve parıltılarda hafif ışıma (bloom), sıcak renk ayarı, kenar karartma ve ince film greni.
// Düşük kalitede tamamen kapalı (doğrudan çizim), ortada bloom kapalı.

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uTime: { value: 0 },
    uVignette: { value: 0.32 },
    uGrain: { value: 0.035 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform float uVignette;
    uniform float uGrain;
    varying vec2 vUv;
    float rand(vec2 co) { return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      // sıcak, hafif kontrastlı "eski Karaköy" tonu
      c.rgb *= vec3(1.04, 1.0, 0.94);
      c.rgb = mix(c.rgb, c.rgb * c.rgb * (3.0 - 2.0 * c.rgb), 0.12);
      vec2 d = vUv - 0.5;
      float v = 1.0 - dot(d, d) * uVignette * 2.6;
      c.rgb *= clamp(v, 0.0, 1.0);
      c.rgb += (rand(vUv * 640.0 + uTime) - 0.5) * uGrain * 0.06;
      gl_FragColor = c;
    }`,
};

export class Post {
  private composer: EffectComposer;
  private renderPass: RenderPass;
  private bloom: UnrealBloomPass;
  private grade: ShaderPass;
  private enabled = true;
  private time = 0;

  constructor(private renderer: THREE.WebGLRenderer) {
    const size = renderer.getSize(new THREE.Vector2());
    const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(renderer, rt);
    this.renderPass = new RenderPass(new THREE.Scene(), new THREE.PerspectiveCamera());
    this.composer.addPass(this.renderPass);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.38, 0.55, 0.88);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.grade = new ShaderPass(GradeShader);
    this.composer.addPass(this.grade);
  }

  setQuality(q: Quality) {
    this.enabled = q !== 'low';
    this.bloom.enabled = q === 'high';
    this.grade.uniforms.uGrain.value = q === 'high' ? 0.035 : 0;
  }

  setSize(w: number, h: number) {
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
    this.composer.setSize(w, h);
  }

  render(scene: THREE.Scene, camera: THREE.Camera, dt = 1 / 60) {
    if (!this.enabled) {
      this.renderer.render(scene, camera);
      return;
    }
    this.time += dt;
    this.renderPass.scene = scene;
    this.renderPass.camera = camera;
    this.grade.uniforms.uTime.value = this.time % 100;
    this.composer.render(dt);
  }
}
