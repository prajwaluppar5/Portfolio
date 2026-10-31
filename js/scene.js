// WebGL scene: particle "bodies" that morph between procedural shapes and are
// coloured like an FEA stress contour (blue = low, red = high).
// Body A is the main object; body B appears beside it when a chapter shows a pair
// (e.g. Tejas + AMCA, car + monocoque). Both share one geometry.
// Cursor: moving it scatters nearby particles; when it stops they settle back.
import * as THREE from 'three';
import { MeshSurfaceSampler } from 'three/addons/math/MeshSurfaceSampler.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { shapeBuilders, loadPoints, densityTrim } from './shapes.js';

const N = shapeBuilders.length; // 7 shapes → p0..p6, stress in sA (vec4) + sB (vec3)

const vertexShader = /* glsl */ `
  attribute vec3 p0; attribute vec3 p1; attribute vec3 p2; attribute vec3 p3;
  attribute vec3 p4; attribute vec3 p5; attribute vec3 p6;
  attribute vec4 sA; attribute vec3 sB; attribute float aRand; attribute vec3 aField;
  uniform float uFrom, uTo, uT, uTime, uSize, uPixelRatio, uHeat, uExplode, uOpacity, uHalf;
  attribute float aHalf;
  uniform float uDens[${N}];
  uniform vec3 uMouse; uniform vec3 uMouseVel; uniform float uMouseStrength;
  varying float vStress; varying float vAlpha;

  vec3 pick(float i){
    return i < .5 ? p0 : i < 1.5 ? p1 : i < 2.5 ? p2 : i < 3.5 ? p3 : i < 4.5 ? p4 : i < 5.5 ? p5 : p6;
  }
  float pickS(float i){
    return i < .5 ? sA.x : i < 1.5 ? sA.y : i < 2.5 ? sA.z : i < 3.5 ? sA.w : i < 4.5 ? sB.x : i < 5.5 ? sB.y : sB.z;
  }
  vec3 hash3(float n){ return fract(sin(vec3(n, n + 1.7, n + 3.1)) * vec3(43758.5453, 22578.145, 19642.349)) - .5; }

  void main(){
    // morph from shape uFrom to shape uTo by uT (any pair of shapes, same motion everywhere)
    float i0 = uFrom, i1 = uTo, f = uT;
    // Transition (same for every pair of shapes):
    //  1. the old model loosens and swells,
    //  2. its nodes burst out into a dust field that fills the screen (world space,
    //     some passing the camera), drift there,
    //  3. and stream back in to assemble the next model, bottom-up.
    vec3 a = pick(i0), b = pick(i1);
    vec3 jitter = hash3(aRand * 1000.);
    float leave = smoothstep(aRand * .12, aRand * .12 + .3, f);                   // 0 → 1 by t ≈ .42
    float order = clamp((b.y + 1.4) / 2.8, 0., 1.);
    float arrive = smoothstep(.56 + order * .16 + aRand * .06, .82 + order * .16 + aRand * .06, f); // starts ≥ .56
    float w = leave * (1. - arrive);  // 1 = in the dust field
    vec3 shape = f < .5 ? a : b;      // swap shapes while every node is in the field
    // loosen/swell just before leaving and just after arriving
    float loose = sin(min(1., leave * 2.) * 3.14159 * .5) * (1. - arrive) + (1. - arrive) * step(.5, f);
    shape *= 1. + 0.18 * loose * w;
    shape += jitter * 0.25 * loose * w;
    vec3 pos = shape;
    pos += normalize(pos + 1e-4) * uExplode * (0.5 + aRand);
    pos += 0.012 * vec3(sin(uTime * 1.3 + aRand * 40.), cos(uTime * 1.1 + aRand * 30.), sin(uTime * .9 + aRand * 20.));

    vec4 world = modelMatrix * vec4(pos, 1.);
    // dust field position, slowly drifting
    vec3 field = aField + vec3(sin(uTime * .15 + aRand * 30.), cos(uTime * .12 + aRand * 20.), sin(uTime * .1 + aRand * 10.)) * .35;
    // ease along the way so nodes accelerate out and decelerate into place
    float we = w * w * (3. - 2. * w);
    world.xyz = mix(world.xyz, field, we);
    float mid = we;

    // cursor: a wide soft zone that scatters particles outward and along the
    // cursor's motion; strength follows cursor speed, so they re-form when it stops
    vec3 d = world.xyz - uMouse;
    float dist = length(d);
    float infl = exp(-dist * dist * 0.9) * uMouseStrength;
    vec3 dir = normalize(d + jitter * .8 + 1e-4);
    world.xyz += dir * infl * (0.55 + aRand * 0.9);
    world.xyz += uMouseVel * infl * (0.3 + aRand * 0.5);
    world.z += jitter.z * infl * 1.2;

    float s = f < .5 ? pickS(i0) : pickS(i1);
    vStress = clamp(s * uHeat + infl * .7, 0., 1.); // nodes keep their colour in flight
    // small shapes would pack the same particle count into less area and blow out;
    // show only a share of the particles so every shape has a similar density
    // small/flat shapes would blow out: dim every particle evenly instead of hiding
    // some, so no node ever pops in or out
    float keep = mix(f < .5 ? uDens[int(i0)] : uDens[int(i1)], .9, we);
    // each body owns one half of the particles; together they form one full model
    float mine = uHalf < .5 ? 1. : (uHalf < 1.5 ? 1. - aHalf : aHalf);
    // in the dust field both halves overlap the whole screen: keep the field sparse
    mine *= 1. - we * .7;
    vAlpha = (.55 + .45 * aRand) * uOpacity * keep * mine;

    vec4 mv = viewMatrix * world;
    gl_Position = projectionMatrix * mv;
    // nodes passing close to the camera get big but are capped and faded
    gl_PointSize = min(uSize * uPixelRatio * (0.6 + aRand * .8 + vStress * .6) / -mv.z, 9. * uPixelRatio);
    vAlpha *= smoothstep(.4, 1.6, -mv.z);
  }
`;

const fragmentShader = /* glsl */ `
  varying float vStress; varying float vAlpha;
  vec3 legend(float x){
    vec3 c0 = vec3(.05,.18,.95), c1 = vec3(0.,.8,1.), c2 = vec3(.15,1.,.35), c3 = vec3(1.,.92,.1), c4 = vec3(1.,.18,.08);
    x = clamp(x, 0., 1.) * 4.;
    if (x < 1.) return mix(c0, c1, x);
    if (x < 2.) return mix(c1, c2, x - 1.);
    if (x < 3.) return mix(c2, c3, x - 2.);
    return mix(c3, c4, x - 3.);
  }
  void main(){
    float r = length(gl_PointCoord - .5);
    if (r > .5 || vAlpha < .01) discard;
    float soft = smoothstep(.5, .1, r);
    gl_FragColor = vec4(legend(vStress) * (0.32 + vStress * .38), soft * soft * vAlpha * .55);
  }
`;

function surfaceArea(g) {
  const p = g.attributes.position, idx = g.index;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const n = idx ? idx.count : p.count;
  let sum = 0;
  for (let i = 0; i < n; i += 3) {
    const [i0, i1, i2] = idx ? [idx.getX(i), idx.getX(i + 1), idx.getX(i + 2)] : [i, i + 1, i + 2];
    a.fromBufferAttribute(p, i0); b.fromBufferAttribute(p, i1); c.fromBufferAttribute(p, i2);
    sum += b.sub(a).cross(c.sub(a)).length() / 2;
  }
  return sum;
}

export function createScene(canvas, { lowPower = false } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'high-performance' });
  // capped resolution keeps a steady 60 fps with two particle bodies + bloom
  const pr = Math.min(window.devicePixelRatio, lowPower ? 1.2 : 1.5);
  renderer.setPixelRatio(pr);
  renderer.setClearColor(0x000000, 1);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0b0c0b);
  const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
  camera.position.set(0, 0, 7.2);

  // ---- shared particle geometry: every shape sampled to the same count ----
  const COUNT = lowPower ? 22000 : 46000; // split between two bodies
  const geo = new THREE.BufferGeometry();
  const tmp = new THREE.Vector3();
  const stress = shapeBuilders.map(() => new Float32Array(COUNT));
  const area = [];
  shapeBuilders.forEach((build, si) => {
    const shapeGeo = build();
    area[si] = shapeGeo.userData.area ?? surfaceArea(shapeGeo);
    const mesh = new THREE.Mesh(shapeGeo);
    const sampler = new MeshSurfaceSampler(mesh).build();
    const arr = new Float32Array(COUNT * 3);
    const lps = [].concat(loadPoints[si]);
    for (let i = 0; i < COUNT; i++) {
      sampler.sample(tmp);
      arr.set([tmp.x, tmp.y, tmp.z], i * 3);
      const d = Math.min(...lps.map((lp) => tmp.distanceTo(lp)));
      let s = Math.exp(-d * d * 1.6) * 0.85 + 0.25 * (1 - Math.min(d / 2.6, 1));
      s += 0.08 * Math.sin(tmp.x * 9 + tmp.y * 7) * Math.cos(tmp.z * 8);
      stress[si][i] = Math.min(Math.max(s, 0), 1);
    }
    geo.setAttribute('p' + si, new THREE.BufferAttribute(arr, 3));
    if (si === 0) geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    mesh.geometry.dispose();
  });
  const sA = new Float32Array(COUNT * 4);
  const sB = new Float32Array(COUNT * 3);
  const rnd = new Float32Array(COUNT);
  const half = new Float32Array(COUNT);
  const field = new Float32Array(COUNT * 3);
  for (let i = 0; i < COUNT; i++) {
    sA.set([stress[0][i], stress[1][i], stress[2][i], stress[3][i]], i * 4);
    sB.set([stress[4][i], stress[5][i], stress[6][i]], i * 3);
    rnd[i] = Math.random();
    half[i] = i % 2;
    // dust-field slot inside the camera frustum (camera at z = 7.2, fov 35°)
    const z = -6 + Math.random() * 11.5;
    const hh = Math.tan((17.5 * Math.PI) / 180) * (7.2 - z) * 1.05;
    field.set([(Math.random() * 2 - 1) * hh * 1.9, (Math.random() * 2 - 1) * hh, z], i * 3);
  }
  geo.setAttribute('sA', new THREE.BufferAttribute(sA, 4));
  geo.setAttribute('sB', new THREE.BufferAttribute(sB, 3));
  geo.setAttribute('aRand', new THREE.BufferAttribute(rnd, 1));
  geo.setAttribute('aHalf', new THREE.BufferAttribute(half, 1));
  geo.setAttribute('aField', new THREE.BufferAttribute(field, 3));
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 5);
  // share of particles shown per shape, relative to a reference surface area of 17 units²
  // (flat shapes such as wings get an extra trim: top and bottom skins overlap on screen)
  const dens = area.map((a, i) => Math.min(1, Math.max(0.16, (a / 17) * 1.1)) * (densityTrim[i] ?? 1));

  // shared cursor uniforms
  const mouse = {
    uMouse: { value: new THREE.Vector3(99, 99, 0) },
    uMouseVel: { value: new THREE.Vector3() },
    uMouseStrength: { value: 0 },
  };
  const time = { value: 0 };

  function makeBody(initial) {
    const uniforms = {
      uFrom: { value: 0 }, uTo: { value: 0 }, uT: { value: 0 }, uHalf: { value: initial.half },
      uTime: time, uSize: { value: lowPower ? 20 : 17 },
      uPixelRatio: { value: pr }, uHeat: { value: 1 }, uExplode: { value: initial.explode ?? 0 },
      uOpacity: { value: initial.opacity }, uDens: { value: dens }, ...mouse,
    };
    const material = new THREE.ShaderMaterial({
      vertexShader, fragmentShader, uniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    const points = new THREE.Points(geo, material);
    const rig = new THREE.Group();
    const spin = new THREE.Group();
    spin.add(points);
    rig.add(spin);
    scene.add(rig);
    const state = { from: 0, to: 0, t: 0, x: 0, y: 0, scale: 1, rotY: 0, rotX: 0, opacity: initial.opacity };
    return { uniforms, rig, spin, points, state };
  }
  // A and B each own half of the particles; overlapping, they read as one model
  const A = makeBody({ opacity: 1, explode: 2.5, half: 1 });
  const B = makeBody({ opacity: 1, explode: 2.5, half: 2 });

  // ---- engineering decor around body A: gimbal rings + dial ticks, plus dust ----
  const ringMat = new THREE.LineBasicMaterial({ color: 0x8a8f86, transparent: true, opacity: 0.22 });
  const rings = new THREE.Group();
  [2.05, 2.35].forEach((r, i) => {
    const pts = [];
    for (let k = 0; k <= 256; k++) { const a = (k / 256) * Math.PI * 2; pts.push(new THREE.Vector3(Math.cos(a) * r, Math.sin(a) * r, 0)); }
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), ringMat);
    line.rotation.x = i ? 1.2 : 1.6;
    line.rotation.y = i ? 0.5 : -0.3;
    rings.add(line);
  });
  const ticks = [];
  for (let k = 0; k < 72; k++) {
    const a = (k / 72) * Math.PI * 2, r0 = 2.35, r1 = k % 6 ? 2.42 : 2.52;
    ticks.push(new THREE.Vector3(Math.cos(a) * r0, Math.sin(a) * r0, 0), new THREE.Vector3(Math.cos(a) * r1, Math.sin(a) * r1, 0));
  }
  const tickLines = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(ticks), ringMat);
  tickLines.rotation.copy(rings.children[1].rotation);
  rings.add(tickLines);
  A.rig.add(rings);

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
  composer.addPass(new UnrealBloomPass(new THREE.Vector2(1, 1), lowPower ? 0.35 : 0.5, 0.35, 0.42));
  composer.addPass(new OutputPass());

  const view = { ringOpacity: 0.22, camZ: 7.2 };

  // ---- pointer → world point on z=0, with speed-driven strength ----
  const ndc = new THREE.Vector2(9, 9);
  const ray = new THREE.Raycaster();
  const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
  const hit = new THREE.Vector3();
  const prevHit = new THREE.Vector3();
  const look = new THREE.Vector2();
  let speed = 0;
  let lastMove = 0;
  window.addEventListener('pointermove', (e) => {
    ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
    lastMove = performance.now();
  });

  function resize() {
    const w = innerWidth, h = innerHeight;
    renderer.setSize(w, h, false);
    composer.setSize(w, h);
    camera.aspect = w / h;
    camera.position.z = view.camZ * (w < h ? 1.35 : 1);
    camera.updateProjectionMatrix();
  }
  addEventListener('resize', resize);
  resize();

  // screen position of a body (for HTML labels)
  const proj = new THREE.Vector3();
  function screenPos(body) {
    proj.set(0, 0, 0).applyMatrix4(body.rig.matrixWorld).project(camera);
    return { x: (proj.x * 0.5 + 0.5) * innerWidth, y: (-proj.y * 0.5 + 0.5) * innerHeight };
  }

  const clock = new THREE.Clock();
  let running = true;
  function applyBody(b, dt) {
    const s = b.state;
    b.uniforms.uFrom.value = s.from;
    b.uniforms.uTo.value = s.to;
    b.uniforms.uT.value = s.t;
    b.uniforms.uOpacity.value = s.opacity;
    b.points.visible = s.opacity > 0.01;
    b.rig.position.set(s.x, s.y, 0);
    b.rig.scale.setScalar(s.scale);
    b.spin.rotation.y = spinAngle; // one shared pace, so joined halves stay aligned
    b.spin.rotation.x = s.rotX + look.y * 0.15;
    b.rig.rotation.y = s.rotY + look.x * 0.25;
  }
  const api = { A, B, view, screenPos, resize, onFrame: null };
  let spinAngle = 0;
  function frame() {
    if (!running) return;
    const dt = Math.min(clock.getDelta(), 0.05);
    spinAngle += dt * 0.12;
    time.value = clock.elapsedTime;
    if (ndc.x < 5) look.lerp(ndc, 0.04);
    if (api.onFrame) api.onFrame(dt); // scroll choreography runs in the same frame as the render
    applyBody(A, dt);
    applyBody(B, dt);
    rings.rotation.z += dt * 0.05;
    ringMat.opacity = view.ringOpacity;
    dust.rotation.y = time.value * 0.01;
    camera.position.x += (look.x * 0.25 - camera.position.x) * 0.03;
    camera.position.y += (look.y * 0.15 - camera.position.y) * 0.03;
    camera.lookAt(0, 0, 0);

    ray.setFromCamera(ndc, camera);
    if (ray.ray.intersectPlane(plane, hit)) {
      const m = mouse.uMouse.value;
      const moved = hit.distanceTo(prevHit);
      prevHit.copy(hit);
      // speed rises while the cursor moves and bleeds off when it stops
      const moving = performance.now() - lastMove < 80;
      speed = Math.min(1.6, moving ? speed + moved * 2.2 : speed);
      mouse.uMouseVel.value.lerp(new THREE.Vector3().subVectors(hit, m).clampLength(0, 1), 0.2);
      m.lerp(hit, 0.2);
    }
    speed *= 0.955;
    mouse.uMouseStrength.value += (speed - mouse.uMouseStrength.value) * 0.12;

    composer.render();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  document.addEventListener('visibilitychange', () => {
    running = !document.hidden;
    if (running) { clock.getDelta(); requestAnimationFrame(frame); }
  });

  return api;
}
