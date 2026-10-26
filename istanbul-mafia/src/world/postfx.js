// İsteğe bağlı son işlem zinciri: (yüksek kalitede) GTAO ortam kapanması + sinematik renk düzenleme
// (kontrast, doygunluk, gölge/ışık ton ayrımı, vinyet, film greni, hafif renk sapması).
// Kullanım: const fx = addPostFX(composer, renderer, scene, camera, { quality }); her karede fx.update(env, dt)
import * as THREE from 'three';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';

export const GradeShader = {
  uniforms: {
    tDiffuse: { value: null }, uTime: { value: 0 }, uSat: { value: 1.08 }, uContrast: { value: 1.06 }, uVig: { value: 0.32 },
    uShadowTint: { value: new THREE.Vector3(0.96, 1.0, 1.06) }, uHighTint: { value: new THREE.Vector3(1.05, 1.0, 0.94) },
    uGrain: { value: 0.025 }, uCA: { value: 0.0012 }, uFade: { value: 0 },
  },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float uTime, uSat, uContrast, uVig, uGrain, uCA, uFade; uniform vec3 uShadowTint, uHighTint; varying vec2 vUv;
    float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main(){
      vec2 d = vUv - 0.5;
      vec3 c = vec3(texture2D(tDiffuse, vUv + d * uCA).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv - d * uCA).b);
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c = mix(vec3(l), c, uSat);
      c = (c - 0.5) * uContrast + 0.5;
      c *= mix(uShadowTint, uHighTint, smoothstep(0.1, 0.8, l));
      c *= 1.0 - uVig * smoothstep(0.3, 0.85, length(d) * 1.2);
      c += (h(vUv * 1000.0 + uTime) - 0.5) * uGrain;
      c = mix(c, vec3(0.0), uFade);
      gl_FragColor = vec4(max(c, 0.0), 1.0);
    }`,
};

export function addPostFX(composer, renderer, scene, camera, { quality = 'medium', insertAt = 1 } = {}) {
  const passes = [];
  let ao = null;
  if (quality === 'high') {
    const s = renderer.getSize(new THREE.Vector2());
    ao = new GTAOPass(scene, camera, s.x, s.y);
    ao.output = GTAOPass.OUTPUT.Default;
    ao.blendIntensity = 0.8;
    ao.updateGtaoMaterial({ radius: 0.6, distanceExponent: 1.5, thickness: 1.0, scale: 1.0, samples: 12 });
    composer.insertPass(ao, insertAt);
    passes.push(ao);
  }
  const grade = new ShaderPass(GradeShader);
  // OutputPass'tan önce (son geçiş olarak değil) ekle
  composer.insertPass(grade, Math.max(1, composer.passes.length - 1));
  passes.push(grade);
  return {
    passes, grade, ao,
    update(env, dt) {
      const u = grade.uniforms;
      u.uTime.value += dt || 0.016;
      if (!env) return;
      const n = env.nightFactor, rain = env.rainAmount || 0;
      // gece: soğuk gölgeler, sıcak ışıklar; yağmur: daha soluk
      u.uSat.value = 1.08 - rain * 0.2 - n * 0.05;
      u.uContrast.value = 1.05 + n * 0.05;
      u.uShadowTint.value.set(0.96 - n * 0.06, 1.0, 1.05 + n * 0.1);
      u.uHighTint.value.set(1.05 + n * 0.04, 1.0, 0.94 - n * 0.04);
    },
    setSize(w, h) { if (ao) ao.setSize(w, h); },
  };
}
