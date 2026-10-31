// WebGL scene: ~30k particles that morph between procedural shapes and are
// coloured like an FEA stress contour (blue = low, red = high). The cursor acts
// as a moving "load": particles near it get pushed away and heat up.
import * as THREE from 'three';
import { MeshSurfaceSampler } from 'three/addons/math/MeshSurfaceSampler.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { shapeBuilders, loadPoints } from './shapes.js';

const vertexShader = /* glsl */ `
  attribute vec3 p0; attribute vec3 p1; attribute vec3 p2; attribute vec3 p3; attribute vec3 p4; attribute vec3 p5;
  attribute vec4 sA; attribute vec2 sB; attribute float aRand;
  uniform float uMorph, uTime, uSize, uPixelRatio, uHeat, uExplode;
  uniform vec3 uMouse; uniform float uMouseStrength;
  varying float vStress; varying float vAlpha;

  vec3 pick(float i){ return i < .5 ? p0 : i < 1.5 ? p1 : i < 2.5 ? p2 : i < 3.5 ? p3 : i < 4.5 ? p4 : p5; }
  float pickS(float i){ return i < .5 ? sA.x : i < 1.5 ? sA.y : i < 2.5 ? sA.z : i < 3.5 ? sA.w : i < 4.5 ? sB.x : sB.y; }

  // cheap 3D hash noise for turbulence while morphing
  vec3 hash3(float n){ return fract(sin(vec3(n, n + 1.7, n + 3.1)) * vec3(43758.5453, 22578.145, 19642.349)) - .5; }

  void main(){
    float i0 = clamp(floor(uMorph), 0., 5.);
    float i1 = min(i0 + 1., 5.);
    float f = uMorph - i0;
    // staggered per-particle transition so the shape "dissolves" instead of sliding
    float t = smoothstep(aRand * .45, aRand * .45 + .55, f);
    t = t * t * (3. - 2. * t);
    vec3 a = pick(i0), b = pick(i1);
    vec3 pos = mix(a, b, t);
    float mid = sin(t * 3.14159);
    pos += hash3(aRand * 1000.) * mid * 1.6;
    pos += normalize(pos + 1e-4) * uExplode * (0.5 + aRand);

    // breathing micro-motion
    pos += 0.012 * vec3(sin(uTime * 1.3 + aRand * 40.), cos(uTime * 1.1 + aRand * 30.), sin(uTime * .9 + aRand * 20.));

    vec4 world = modelMatrix * vec4(pos, 1.);
    // cursor = applied load
    vec3 d = world.xyz - uMouse;
    float dist = length(d);
    float infl = exp(-dist * dist * 3.5) * uMouseStrength;
    world.xyz += normalize(d + 1e-4) * infl * .35;

    float s = mix(pickS(i0), pickS(i1), t);
    vStress = clamp(s * uHeat + infl * .9 + mid * .15, 0., 1.);
    vAlpha = .55 + .45 * aRand;

    vec4 mv = viewMatrix * world;
    gl_Position = projectionMatrix * mv;
    gl_PointSize = uSize * uPixelRatio * (0.6 + aRand * .8 + vStress * .6) / -mv.z;
  }
`;

const fragmentShader = /* glsl */ `
  varying float vStress; varying float vAlpha;
  uniform float uMono;
  // FEA-style rainbow legend: blue → cyan → green → yellow → red
  vec3 legend(float x){
    vec3 c0 = vec3(.05,.18,.95), c1 = vec3(0.,.8,1.), c2 = vec3(.15,1.,.35), c3 = vec3(1.,.92,.1), c4 = vec3(1.,.18,.08);
    x = clamp(x, 0., 1.) * 4.;
    if (x < 1.) return mix(c0, c1, x);
    if (x < 2.) return mix(c1, c2, x - 1.);
    if (x < 3.) return mix(c2, c3, x - 2.);
    return mix(c3, c4, x - 3.);
  }
  void main(){
    vec2 uv = gl_PointCoord - .5;
    float r = length(uv);
    if (r > .5) discard;
    float soft = smoothstep(.5, .1, r);
    vec3 col = mix(legend(vStress), vec3(.86,.86,.82), uMono);
    gl_FragColor = vec4(col * (0.32 + vStress * .38), soft * soft * vAlpha * .55);
  }
`;

export function createScene(canvas, { lowPower = false } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'high-performance' });
  const pr = Math.min(window.devicePixelRatio, lowPower ? 1.25 : 1.75);
  renderer.setPixelRatio(pr);
  renderer.setClearColor(0x000000, 1);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0b0c0b);
  const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
  camera.position.set(0, 0, 7.2);

  // ---- particle geometry ----
  const COUNT = lowPower ? 14000 : 32000;
  const geo = new THREE.BufferGeometry();
  const tmp = new THREE.Vector3();
  const stress = shapeBuilders.map(() => new Float32Array(COUNT));
  shapeBuilders.forEach((build, si) => {
    const mesh = new THREE.Mesh(build());
    const sampler = new MeshSurfaceSampler(mesh).build();
    const arr = new Float32Array(COUNT * 3);
    const lps = [].concat(loadPoints[si]);
    for (let i = 0; i < COUNT; i++) {
      sampler.sample(tmp);
      arr.set([tmp.x, tmp.y, tmp.z], i * 3);
      const d = Math.min(...lps.map((lp) => tmp.distanceTo(lp)));
      // concentration near the load point + a cooler gradient elsewhere + ripple noise
      let s = Math.exp(-d * d * 1.6) * 0.85 + 0.25 * (1 - Math.min(d / 2.6, 1));
      s += 0.08 * Math.sin(tmp.x * 9 + tmp.y * 7) * Math.cos(tmp.z * 8);
      stress[si][i] = Math.min(Math.max(s, 0), 1);
    }
    geo.setAttribute('p' + si, new THREE.BufferAttribute(arr, 3));
    if (si === 0) geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    mesh.geometry.dispose();
  });
  const sA = new Float32Array(COUNT * 4);
  const sB = new Float32Array(COUNT * 2);
  const rnd = new Float32Array(COUNT);
  for (let i = 0; i < COUNT; i++) {
    sA.set([stress[0][i], stress[1][i], stress[2][i], stress[3][i]], i * 4);
    sB.set([stress[4][i], stress[5][i]], i * 2);
    rnd[i] = Math.random();
  }
  geo.setAttribute('sA', new THREE.BufferAttribute(sA, 4));
  geo.setAttribute('sB', new THREE.BufferAttribute(sB, 2));
  geo.setAttribute('aRand', new THREE.BufferAttribute(rnd, 1));
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 4);

  const uniforms = {
    uMorph: { value: 0 },
    uTime: { value: 0 },
    uSize: { value: lowPower ? 20 : 17 },
    uPixelRatio: { value: pr },
    uHeat: { value: 1 },
    uExplode: { value: 2.5 },
    uMono: { value: 0 },
    uMouse: { value: new THREE.Vector3(99, 99, 0) },
    uMouseStrength: { value: 0 },
  };
  const material = new THREE.ShaderMaterial({
    vertexShader, fragmentShader, uniforms,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const points = new THREE.Points(geo, material);
  const rig = new THREE.Group(); // scroll-driven position
  const spin = new THREE.Group(); // continuous rotation
  spin.add(points);
  rig.add(spin);
  scene.add(rig);

  // ---- engineering decor: gimbal rings + dust ----
  const ringMat = new THREE.LineBasicMaterial({ color: 0x8a8f86, transparent: true, opacity: 0.22 });
  const rings = new THREE.Group();
  [2.05, 2.35].forEach((r, i) => {
    const pts = [];
    for (let k = 0; k <= 256; k++) {
      const a = (k / 256) * Math.PI * 2;
      // dashed look via gaps
      pts.push(new THREE.Vector3(Math.cos(a) * r, Math.sin(a) * r, 0));
    }
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), ringMat);
    line.rotation.x = i ? 1.2 : 1.6;
    line.rotation.y = i ? 0.5 : -0.3;
    rings.add(line);
  });
  // tick marks on the outer ring (like a dial)
  const ticks = [];
  for (let k = 0; k < 72; k++) {
    const a = (k / 72) * Math.PI * 2, r0 = 2.35, r1 = k % 6 ? 2.42 : 2.52;
    ticks.push(new THREE.Vector3(Math.cos(a) * r0, Math.sin(a) * r0, 0), new THREE.Vector3(Math.cos(a) * r1, Math.sin(a) * r1, 0));
  }
  const tickLines = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(ticks), ringMat);
  tickLines.rotation.copy(rings.children[1].rotation);
  rings.add(tickLines);
  rig.add(rings);

  const dustGeo = new THREE.BufferGeometry();
  const DUST = 900;
  const dp = new Float32Array(DUST * 3);
  for (let i = 0; i < DUST; i++) dp.set([(Math.random() - 0.5) * 22, (Math.random() - 0.5) * 14, (Math.random() - 0.5) * 10 - 2], i * 3);
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dp, 3));
  const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({ color: 0x9aa094, size: 0.018, transparent: true, opacity: 0.5, depthWrite: false }));
  scene.add(dust);

  // ---- post ----
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), lowPower ? 0.35 : 0.5, 0.35, 0.42);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  // ---- state driven from the page (GSAP tweens these numbers) ----
  const state = {
    morph: 0, x: 0, y: 0, scale: 1, rotY: 0, rotX: 0, ringOpacity: 0.22, camZ: 7.2,
  };

  // pointer → world point on z=0 plane
  const ndc = new THREE.Vector2(9, 9);
  const ray = new THREE.Raycaster();
  const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
  const hit = new THREE.Vector3();
  const look = new THREE.Vector2();
  let pointerActive = false;
  window.addEventListener('pointermove', (e) => {
    ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
    pointerActive = true;
  });
  document.addEventListener('pointerleave', () => (pointerActive = false));

  function resize() {
    const w = innerWidth, h = innerHeight;
    renderer.setSize(w, h, false);
    composer.setSize(w, h);
    camera.aspect = w / h;
    // keep the object a sensible size on portrait screens
    camera.position.z = state.camZ * (w < h ? 1.35 : 1);
    camera.updateProjectionMatrix();
  }
  addEventListener('resize', resize);
  resize();

  const clock = new THREE.Clock();
  let running = true;
  function frame() {
    if (!running) return;
    const dt = Math.min(clock.getDelta(), 0.05);
    const t = clock.elapsedTime;
    uniforms.uTime.value = t;
    uniforms.uMorph.value = state.morph;

    if (ndc.x < 5) look.lerp(ndc, 0.04);
    rig.position.set(state.x, state.y, 0);
    rig.scale.setScalar(state.scale);
    spin.rotation.y += dt * 0.12;
    spin.rotation.x = state.rotX + look.y * 0.15;
    rig.rotation.y = state.rotY + look.x * 0.25;
    rings.rotation.z += dt * 0.05;
    ringMat.opacity = state.ringOpacity;
    dust.rotation.y = t * 0.01;
    camera.position.x += (look.x * 0.25 - camera.position.x) * 0.03;
    camera.position.y += (look.y * 0.15 - camera.position.y) * 0.03;
    camera.lookAt(0, 0, 0);

    ray.setFromCamera(ndc, camera);
    if (ray.ray.intersectPlane(plane, hit)) uniforms.uMouse.value.lerp(hit, 0.15);
    const target = pointerActive ? 1 : 0;
    uniforms.uMouseStrength.value += (target - uniforms.uMouseStrength.value) * 0.05;

    composer.render();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  document.addEventListener('visibilitychange', () => {
    running = !document.hidden;
    if (running) { clock.getDelta(); requestAnimationFrame(frame); }
  });

  return { state, uniforms, resize };
}
