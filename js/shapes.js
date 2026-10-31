// Procedural "assets": every 3D shape on the site is generated here in code,
// so there are no third-party model files and nothing to license.
// Each builder returns a THREE.BufferGeometry roughly fitting a 2-unit box.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const nonIndexed = (g) => (g.index ? g.toNonIndexed() : g);
function merge(list) {
  return mergeGeometries(
    list.map((g) => {
      const n = nonIndexed(g);
      // keep only position so attributes match across pieces
      const out = new THREE.BufferGeometry();
      out.setAttribute('position', n.getAttribute('position'));
      return out;
    })
  );
}

// 1. Hero — a gyroid lattice sphere: the triply periodic minimal surface used for
// lightweight, topology-optimised and 3D-printed structures. Points are found by
// projecting random points in a ball onto the surface sin x cos y + sin y cos z +
// sin z cos x = 0, then wrapped in tiny equal-area triangles so the sampler picks
// them uniformly. userData.area tells the scene its true surface area.
export function gyroid() {
  const R = 1.25, k = 6.2; // ball radius, lattice frequency (cells per unit ≈ k / 2π)
  const pts = [];
  const N = 90000;
  let guard = 0;
  while (pts.length < N && guard++ < N * 6) {
    let x = (Math.random() * 2 - 1) * R, y = (Math.random() * 2 - 1) * R, z = (Math.random() * 2 - 1) * R;
    if (x * x + y * y + z * z > R * R) continue;
    for (let it = 0; it < 6; it++) {
      const X = x * k, Y = y * k, Z = z * k;
      const f = Math.sin(X) * Math.cos(Y) + Math.sin(Y) * Math.cos(Z) + Math.sin(Z) * Math.cos(X);
      const gx = k * (Math.cos(X) * Math.cos(Y) - Math.sin(Z) * Math.sin(X));
      const gy = k * (-Math.sin(X) * Math.sin(Y) + Math.cos(Y) * Math.cos(Z));
      const gz = k * (-Math.sin(Y) * Math.sin(Z) + Math.cos(Z) * Math.cos(X));
      const g2 = gx * gx + gy * gy + gz * gz + 1e-6;
      x -= (f * gx) / g2; y -= (f * gy) / g2; z -= (f * gz) / g2;
    }
    if (x * x + y * y + z * z <= R * R) pts.push(x, y, z);
  }
  const pos = new Float32Array((pts.length / 3) * 9);
  const e = 0.002;
  for (let i = 0, j = 0; i < pts.length; i += 3, j += 9) {
    pos.set([pts[i], pts[i + 1], pts[i + 2], pts[i] + e, pts[i + 1], pts[i + 2], pts[i], pts[i + 1] + e, pts[i + 2]], j);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.rotateY(0.4);
  g.rotateX(0.35);
  // gyroid surface area per unit volume ≈ 3.1·k/(2π); ball volume 4/3·π·R³
  g.userData.area = 3.1 * (k / (2 * Math.PI)) * (4 / 3) * Math.PI * R ** 3;
  return g;
}

// ---- Aircraft helpers. Axes: x = span, y = up, z = length (nose at +z). ----
// Lofted fuselage through cross-section stations. `p` > 1 sharpens the side
// edges into chines (stealth-style); p = 1 gives an ellipse.
function loft(stations, seg = 48) {
  const pos = [];
  const ring = (s) => {
    const pts = [];
    for (let k = 0; k < seg; k++) {
      const t = (k / seg) * Math.PI * 2;
      const c = Math.cos(t), sn = Math.sin(t);
      const p = sn > 0 ? s.p || 1 : s.pb ?? s.p ?? 1, q = s.q || 1;
      const top = sn > 0 ? s.ht ?? s.h : s.h;
      pts.push([(s.x || 0) + s.w * Math.sign(c) * Math.pow(Math.abs(c), q), (s.y || 0) + top * Math.sign(sn) * Math.pow(Math.abs(sn), p), s.z]);
    }
    return pts;
  };
  const rings = stations.map(ring);
  for (let i = 0; i < rings.length - 1; i++) {
    const a = rings[i], b = rings[i + 1];
    for (let k = 0; k < seg; k++) {
      const k1 = (k + 1) % seg;
      // leave the top band open between two `open` stations (cockpit)
      if (stations[i].open && stations[i + 1].open && Math.sin(((k + 0.5) / seg) * Math.PI * 2) > 0.55) continue;
      pos.push(...a[k], ...b[k], ...b[k1], ...a[k], ...b[k1], ...a[k1]);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  return g;
}
// Flat lifting surface from a half-planform [[x(span), z(length)], ...], mirrored.
function planform(pts, { t = 0.025, y = 0, mirror = true, dihedral = 0 } = {}) {
  const shape = new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, z)));
  const half = new THREE.ExtrudeGeometry(shape, { depth: t, bevelEnabled: false });
  half.rotateX(Math.PI / 2); // shape y → +z, extrusion → −y
  half.translate(0, y + t / 2, 0);
  if (dihedral) half.rotateZ(dihedral);
  if (!mirror) return [half];
  const other = half.clone();
  other.scale(-1, 1, 1);
  return [half, other];
}
// Vertical fin from a side profile [[z, y], ...] placed at span x, canted outward.
function fin(profile, { x = 0, cant = 0, t = 0.022 } = {}) {
  const shape = new THREE.Shape(profile.map(([z, y]) => new THREE.Vector2(z, y)));
  const g = new THREE.ExtrudeGeometry(shape, { depth: t, bevelEnabled: false });
  g.translate(0, 0, -t / 2);
  g.rotateY(-Math.PI / 2); // shape x → +z
  if (cant) g.rotateZ(-cant * Math.sign(x || 1));
  g.translate(x, 0, 0);
  return g;
}
function cyl(r0, r1, z0, z1, x = 0, y = 0) {
  const g = new THREE.CylinderGeometry(r1, r0, Math.abs(z1 - z0), 32, 3, true);
  g.rotateX(Math.PI / 2);
  g.translate(x, y, (z0 + z1) / 2);
  return g;
}
function bubble(z, y, rx, ry, rz) {
  const g = new THREE.SphereGeometry(1, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2);
  g.scale(rx, ry, rz);
  g.translate(0, y, z);
  return g;
}
// aircraft are thin, so they're scaled up to spread the particles and avoid a blown-out glow
const AIR = 1.45;
const showcase = (g) => { g.scale(AIR, AIR, AIR); g.rotateY(-0.65); g.rotateX(0.4); return g; };
const shown = (x, y, z) =>
  new THREE.Vector3(x, y, z).multiplyScalar(AIR).applyAxisAngle(new THREE.Vector3(0, 1, 0), -0.65).applyAxisAngle(new THREE.Vector3(1, 0, 0), 0.4);

// 2a. AMCA-inspired 5th-gen stealth fighter (published layout: ~18 m long, 11.1 m span).
// Chined blended fuselage, diamond/trapezoidal wing, side caret intakes, twin canted
// fins, all-moving tailplanes, twin engines.
export function amca() {
  const parts = [];
  parts.push(loft([
    { z: 1.32, w: 0.004, h: 0.003, p: 1.8 },
    { z: 1.15, w: 0.07, h: 0.035, ht: 0.05, p: 1.8 },
    { z: 0.9, w: 0.14, h: 0.06, ht: 0.09, p: 1.7 },
    { z: 0.6, w: 0.22, h: 0.08, ht: 0.12, p: 1.6 },
    { z: 0.3, w: 0.33, h: 0.09, ht: 0.12, p: 1.8 },
    { z: -0.2, w: 0.36, h: 0.09, ht: 0.11, p: 2 },
    { z: -0.7, w: 0.31, h: 0.08, ht: 0.09, p: 2 },
    { z: -1.0, w: 0.25, h: 0.07, ht: 0.07, p: 1.8 },
  ]));
  // caret intakes: angled boxes on each side under the leading-edge extension
  for (const s of [1, -1]) {
    const box = new THREE.BoxGeometry(0.1, 0.12, 0.42, 3, 3, 8);
    box.translate(s * 0.27, -0.03, 0.32);
    box.rotateY(s * 0.08);
    parts.push(box);
  }
  parts.push(bubble(0.68, 0.1, 0.085, 0.085, 0.3));
  // diamond-shaped trapezoidal wing: ~42° LE sweep, forward-swept trailing edge
  parts.push(...planform([[0.2, 0.42], [0.8, -0.35], [0.8, -0.56], [0.28, -0.8], [0.2, -0.78]], { t: 0.03, y: 0.0 }));
  // all-moving horizontal tailplanes
  parts.push(...planform([[0.22, -0.78], [0.6, -1.08], [0.6, -1.2], [0.22, -1.16]], { t: 0.02, y: -0.01, dihedral: -0.03 }));
  // twin outward-canted vertical tails
  for (const s of [1, -1]) parts.push(fin([[-0.5, 0], [-0.86, 0.44], [-1.02, 0.44], [-0.98, 0]], { x: s * 0.22, cant: 0.45 }));
  // twin engine nozzles
  for (const s of [1, -1]) parts.push(cyl(0.085, 0.075, -0.98, -1.22, s * 0.11, 0));
  return showcase(merge(parts));
}

// 2b. Tejas-inspired light fighter (published layout: 13.2 m long, 8.2 m span).
// Tailless compound delta, single fin, side intakes under the wing root, single engine.
export function tejas() {
  const parts = [];
  parts.push(loft([
    { z: 1.3, w: 0.004, h: 0.004 },
    { z: 1.12, w: 0.06, h: 0.06 },
    { z: 0.88, w: 0.11, h: 0.11 },
    { z: 0.6, w: 0.14, h: 0.13, ht: 0.15 },
    { z: 0.3, w: 0.16, h: 0.14, ht: 0.17 },
    { z: -0.3, w: 0.17, h: 0.14, ht: 0.17 },
    { z: -0.85, w: 0.15, h: 0.13, ht: 0.15 },
    { z: -1.15, w: 0.11, h: 0.11 },
  ], 40));
  // side intakes beneath the wing root
  for (const s of [1, -1]) {
    const box = new THREE.BoxGeometry(0.09, 0.15, 0.6, 3, 3, 10);
    box.translate(s * 0.18, -0.06, 0.12);
    parts.push(box);
  }
  parts.push(bubble(0.58, 0.12, 0.08, 0.1, 0.28));
  // compound delta: steep inner leading edge, shallower outer, straight trailing edge
  parts.push(...planform([[0.14, 0.5], [0.42, -0.1], [0.81, -0.62], [0.81, -0.74], [0.14, -0.98]], { t: 0.025, y: -0.02 }));
  // single tall swept fin on the spine
  parts.push(fin([[-0.35, 0.14], [-0.92, 0.72], [-1.1, 0.72], [-1.15, 0.12]], { x: 0 }));
  parts.push(cyl(0.1, 0.085, -1.12, -1.32));
  return showcase(merge(parts));
}

// ---- KA-RaceIng Formula Student car (reference: KIT19c render supplied by Prajwal) ----
// Axes: x = width, y = up, z = length (nose +z). ~0.95 units per metre.
function rod(a, b, r = 0.012) {
  const va = new THREE.Vector3(...a), vb = new THREE.Vector3(...b);
  const len = va.distanceTo(vb);
  const g = new THREE.CylinderGeometry(r, r, len, 8, 4, true);
  g.translate(0, len / 2, 0);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), vb.clone().sub(va).normalize()));
  g.translate(...a);
  return g;
}
function hoop(z, y0, halfW, height, r = 0.016) {
  const g = new THREE.TorusGeometry(halfW, r, 8, 32, Math.PI);
  g.translate(0, y0 + height - halfW, z);
  return [g, rod([halfW, y0, z], [halfW, y0 + height - halfW, z], r), rod([-halfW, y0, z], [-halfW, y0 + height - halfW, z], r)];
}
// wing element: a thin plank from the leading edge (zLE) back by `chord`, spanning x0..x1,
// pitched by `aoa` (positive lifts the trailing edge), with a slight camber droop
function element(x0, x1, zLE, chord, y, aoa, { t = 0.014, mirror = true } = {}) {
  const g = new THREE.BoxGeometry(x1 - x0, t, chord, 10, 1, 6);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const u = (p.getZ(i) + chord / 2) / chord; // 0 at TE, 1 at LE
    p.setY(i, p.getY(i) + Math.sin(u * Math.PI) * chord * 0.08); // camber
  }
  g.translate((x0 + x1) / 2, 0, -chord / 2);
  g.rotateX(aoa);
  g.translate(0, y, zLE);
  if (!mirror) return [g];
  const o = g.clone(); o.scale(-1, 1, 1);
  return [g, o];
}
// carbon body: rounded top, flat bottom; `p` shapes the top, `pb` the floor, `q` the sides
const NOSE = [
  { z: 1.42, w: 0.05, ht: 0.035, h: 0.025, y: 0.14 },
  { z: 1.34, w: 0.12, ht: 0.09, h: 0.045, y: 0.15 },
  { z: 1.2, w: 0.17, ht: 0.15, h: 0.06, y: 0.16 },
  { z: 1.02, w: 0.2, ht: 0.21, h: 0.08, y: 0.17 },
  { z: 0.84, w: 0.215, ht: 0.25, h: 0.09, y: 0.18 },
];
const TUB = [
  { z: 0.62, w: 0.225, ht: 0.27, h: 0.1, y: 0.2 },
  { z: 0.42, w: 0.23, ht: 0.28, h: 0.1, y: 0.2 },
  { z: 0.3, w: 0.23, ht: 0.26, h: 0.1, y: 0.2, open: true },
  { z: 0.0, w: 0.24, ht: 0.2, h: 0.1, y: 0.2, open: true },
  { z: -0.32, w: 0.245, ht: 0.2, h: 0.1, y: 0.2, open: true },
  { z: -0.44, w: 0.24, ht: 0.2, h: 0.1, y: 0.2 },
];
const bodyStyle = (s) => ({ p: 0.85, pb: 0.3, q: 0.7, ...s });
export function monocoque() {
  // the car's own tub (same sections, scale and pose as fsCar) with its roll hoops,
  // bracing and headrest; the wings, sidepods, wheels and engine bay are removed
  const parts = [loft([...NOSE, ...TUB].map(bodyStyle), 56)];
  parts.push(...tubHardware());
  return carPose(merge(parts), 0.98);
}
function tubHardware() {
  const out = [...hoop(0.36, 0.4, 0.18, 0.2), ...hoop(-0.42, 0.32, 0.2, 0.72)];
  out.push(rod([0.14, 0.98, -0.42], [0.18, 0.36, -0.9]), rod([-0.14, 0.98, -0.42], [-0.18, 0.36, -0.9]));
  const head = new THREE.BoxGeometry(0.2, 0.2, 0.06, 4, 4, 1);
  head.translate(0, 0.55, -0.36);
  out.push(head);
  return out;
}
function tyre(x, z, r = 0.215, w = 0.2) {
  // rounded tyre section revolved, plus a three-spoke carbon rim
  const prof = [];
  const rIn = 0.13, rr = 0.045;
  prof.push(new THREE.Vector2(rIn, -w / 2));
  for (let k = 0; k <= 6; k++) { const a = -Math.PI / 2 + (k / 6) * (Math.PI / 2); prof.push(new THREE.Vector2(r - rr + Math.cos(a) * rr, -w / 2 + rr + Math.sin(a) * rr)); }
  for (let k = 0; k <= 6; k++) { const a = (k / 6) * (Math.PI / 2); prof.push(new THREE.Vector2(r - rr + Math.cos(a) * rr, w / 2 - rr + Math.sin(a) * rr)); }
  prof.push(new THREE.Vector2(rIn, w / 2));
  const t = new THREE.LatheGeometry(prof, 48);
  t.rotateZ(Math.PI / 2);
  const out = [t];
  const s = Math.sign(x);
  const face = new THREE.RingGeometry(0.04, rIn, 32, 1); face.rotateY(Math.PI / 2); face.translate(s * 0.07, 0, 0); out.push(face);
  for (let k = 0; k < 3; k++) {
    const sp = new THREE.BoxGeometry(0.02, 0.1, 0.035); sp.translate(0, 0.075, 0); sp.rotateX((k / 3) * Math.PI * 2); sp.translate(s * 0.08, 0, 0); out.push(sp);
  }
  const hub = new THREE.CylinderGeometry(0.04, 0.04, 0.05, 16); hub.rotateZ(Math.PI / 2); hub.translate(s * 0.09, 0, 0); out.push(hub);
  out.forEach((g) => g.translate(x, r, z));
  return out;
}
export function fsCar() {
  const parts = [];
  // long low nose rising in one curve to the cockpit, then the tub
  const body = loft([...NOSE, ...TUB].map(bodyStyle), 56);
  parts.push(body);
  const weighted = [body.clone()];
  // exposed rear: engine block, exhaust, rear space-frame
  const eng = new THREE.BoxGeometry(0.3, 0.24, 0.36, 4, 4, 4); eng.translate(0, 0.24, -0.66); parts.push(eng);
  parts.push(rod([0.06, 0.3, -0.6], [0.12, 0.44, -1.0], 0.025));
  for (const s of [1, -1]) {
    parts.push(rod([s * 0.2, 0.12, -0.44], [s * 0.17, 0.12, -0.95]), rod([s * 0.2, 0.36, -0.44], [s * 0.15, 0.36, -0.95]), rod([s * 0.2, 0.12, -0.6], [s * 0.18, 0.36, -0.82]));
  }
  // sidepods: flat-topped, rounded edges, open radiator inlet at the front
  for (const s of [1, -1]) {
    parts.push(loft([
      { z: 0.36, w: 0.07, ht: 0.08, h: 0.08, y: 0.17 },
      { z: 0.2, w: 0.11, ht: 0.11, h: 0.1, y: 0.19 },
      { z: -0.3, w: 0.11, ht: 0.1, h: 0.1, y: 0.19 },
      { z: -0.56, w: 0.07, ht: 0.06, h: 0.07, y: 0.16 },
    ].map((st) => ({ ...st, x: s * 0.34, p: 0.45, pb: 0.4, q: 0.5 })), 32));
    // side wing between the wheels: floor plane, rising flap and a tall endplate
    parts.push(...element(s > 0 ? 0.45 : -0.6, s > 0 ? 0.6 : -0.45, 0.3, 0.6, 0.06, 0.02, { mirror: false }));
    parts.push(...element(s > 0 ? 0.45 : -0.6, s > 0 ? 0.6 : -0.45, -0.28, 0.24, 0.12, 0.45, { mirror: false }));
    parts.push(fin([[0.32, 0.02], [0.32, 0.17], [-0.55, 0.36], [-0.56, 0.02]], { x: s * 0.61, t: 0.014 }));
  }
  // floor
  parts.push(...planform([[0.0, 0.95], [0.3, 0.6], [0.42, 0.35], [0.42, -0.6], [0.0, -0.9]], { t: 0.012, y: 0.035 }));
  // front wing: full-width main plane, two flaps curling up outboard, fences and endplates
  parts.push(...element(0, 0.72, 1.52, 0.27, 0.05, 0.06));
  parts.push(...element(0.2, 0.72, 1.27, 0.15, 0.105, 0.45));
  parts.push(...element(0.28, 0.72, 1.15, 0.11, 0.165, 0.8));
  for (const s of [1, -1]) {
    parts.push(fin([[1.54, 0.01], [1.54, 0.16], [1.3, 0.29], [0.98, 0.29], [0.96, 0.01]], { x: s * 0.73, t: 0.014 }));
    parts.push(fin([[1.42, 0.05], [1.36, 0.25], [1.18, 0.27], [1.12, 0.06]], { x: s * 0.25, t: 0.012 }));
  }
  // nose antenna and front push-rod/steering details
  parts.push(rod([0, 0.46, 0.7], [0, 0.64, 0.72], 0.006));
  // roll hoops, bracing and headrest (shared with the monocoque model)
  parts.push(...tubHardware());
  // rear wing: big four-element stack between tall rectangular endplates
  parts.push(...element(0, 0.56, -0.86, 0.36, 0.8, 0.12));
  parts.push(...element(0, 0.56, -1.1, 0.22, 0.93, 0.55));
  parts.push(...element(0, 0.56, -1.24, 0.15, 1.05, 0.9));
  parts.push(...element(0, 0.56, -1.31, 0.11, 1.14, 1.2));
  for (const s of [1, -1]) {
    parts.push(fin([[-0.8, 0.52], [-0.82, 1.27], [-1.44, 1.27], [-1.44, 0.6]], { x: s * 0.57, t: 0.014 }));
    parts.push(rod([s * 0.1, 0.42, -0.9], [s * 0.14, 0.8, -1.0], 0.014));
  }
  // wheels (wheelbase ≈ 1.53 m, track ≈ 1.2 m) with double wishbones and push rods
  const zF = 0.62, zR = -0.82, xT = 0.6;
  for (const s of [1, -1]) {
    const wheels = [...tyre(s * xT, zF), ...tyre(s * (xT - 0.01), zR)];
    parts.push(...wheels);
    weighted.push(...wheels.map((g) => g.clone()), ...wheels.map((g) => g.clone()));
    for (const [z, zz, xi] of [[zF, 0.12, 0.21], [zR, 0.1, 0.19]]) {
      const hx = s * (xT - 0.09);
      for (const y of [0.12, 0.3]) parts.push(rod([s * xi, y, z + zz], [hx, y, z]), rod([s * xi, y, z - zz], [hx, y, z]));
      parts.push(rod([hx, 0.13, z], [s * (xi - 0.02), 0.42, z], 0.009));
    }
  }
  // particle weighting: big flat plates (wings, floor) would take most particles, so the
  // body and tyres are added a second time to be sampled twice as densely
  parts.push(...weighted);
  return carPose(merge(parts), 0.98);
}

function carPt(x, y, z, scale) {
  return new THREE.Vector3(x, y - 0.35, z).multiplyScalar(scale)
    .applyAxisAngle(new THREE.Vector3(0, 1, 0), 0.75).applyAxisAngle(new THREE.Vector3(1, 0, 0), 0.3);
}
function carPose(g, scale) {
  g.translate(0, -0.35, 0);
  g.scale(scale, scale, scale);
  g.rotateY(0.75);
  g.rotateX(0.3);
  return g;
}

// 4. Research — lower molar modelled on the CT-derived thesis specimen (Prajwal's renders):
// oval crown with five cusps around a deep central basin and fissures, a straight root
// trunk with shallow grooves, and two roots (broad grooved mesial, narrower distal)
// cut flat at the scan boundary. x = mesiodistal, z = buccolingual, y = up.
function gridSurface(rings, closeEnd = false) {
  // rings: array of closed loops (same length) → quad strips between consecutive loops
  const pos = [];
  const n = rings[0].length;
  for (let i = 0; i < rings.length - 1; i++) {
    const a = rings[i], b = rings[i + 1];
    for (let k = 0; k < n; k++) {
      const k1 = (k + 1) % n;
      pos.push(...a[k], ...b[k], ...b[k1], ...a[k], ...b[k1], ...a[k1]);
    }
  }
  if (closeEnd) {
    // cap the last loop with a fan (flat cut root end)
    const last = rings[rings.length - 1];
    const c = last.reduce((s, p) => [s[0] + p[0] / n, s[1] + p[1] / n, s[2] + p[2] / n], [0, 0, 0]);
    for (let k = 0; k < n; k++) pos.push(...c, ...last[(k + 1) % n], ...last[k]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  return g;
}
const MA = 0.66, MB = 0.54; // crown half-length (mesiodistal) and half-width (buccolingual)
function crownOutline(t) {
  // rounded-rectangle oval with lobes where the cusps sit
  const c = Math.cos(t), s = Math.sin(t), n = 2.6;
  const r = 1 / Math.pow(Math.pow(Math.abs(c), n) + Math.pow(Math.abs(s), n), 1 / n);
  const lobe = 1 + 0.035 * Math.cos(4 * t + 0.5) + 0.02 * Math.cos(2 * t);
  return [c * r * lobe * MA, s * r * lobe * MB];
}
const CUSPS = [ // [u, v, height]: mesiobuccal, distobuccal, distal, mesiolingual, distolingual
  [-0.5, 0.48, 0.21], [0.32, 0.52, 0.18], [0.8, 0.08, 0.12], [-0.46, -0.48, 0.24], [0.38, -0.48, 0.2],
];
function occlusalHeight(u, v) {
  let h = 0.24;
  for (const [cu, cv, ch] of CUSPS) h += ch * Math.exp(-((u - cu) ** 2 + (v - cv) ** 2) / 0.2);
  h -= 0.24 * Math.exp(-(u * u) / 0.28 - (v * v) / 0.1); // deep central fossa
  h -= 0.09 * Math.exp(-(v * v) / 0.01) * (1 - u * u * 0.5); // mesiodistal fissure
  h -= 0.07 * Math.exp(-((u + 0.08) ** 2) / 0.01) * (1 - v * v); // buccolingual fissure
  h -= 0.05 * Math.exp(-((u - 0.58) ** 2) / 0.008) * Math.max(0, v); // distobuccal groove
  h += 0.01 * Math.sin(u * 15 + v * 4) * Math.cos(v * 12); // scan texture
  return h;
}
const CEJ = -0.15;
export function molar() {
  const K = 120; // samples around
  const T = Array.from({ length: K }, (_, k) => (k / K) * Math.PI * 2);
  const O = T.map(crownOutline);
  const RIM = 0.95; // the wall's top ring is exactly the occlusal table's outer ring
  const wallTop = O.map(([x, z]) => occlusalHeight((x * RIM) / MA, (z * RIM) / MB));
  const rings = [];
  // crown wall: from the cemento-enamel junction, bulging out, rolling over the rim
  for (let j = 0; j <= 14; j++) {
    const u = j / 14;
    rings.push(T.map((t, k) => {
      const y = CEJ + (1 - (1 - u) ** 1.3) * (wallTop[k] - CEJ);
      // bulge out from the CEJ, then curve back in to meet the rim at RIM
      const f = 0.86 + 0.15 * Math.sin(u * Math.PI * 0.75) + (RIM - 0.86 - 0.15 * Math.sin(Math.PI * 0.75)) * u * u;
      const bump = 1 + 0.01 * Math.sin(t * 7 + 1.3) * Math.sin(u * Math.PI);
      return [O[k][0] * f * bump, y, O[k][1] * f * bump];
    }));
  }
  // occlusal table: from the rim to the centre of the basin
  for (let j = 0; j <= 24; j++) {
    const r = RIM * (1 - j / 24) + 0.001;
    rings.push(T.map((t, k) => {
      const x = O[k][0] * r, z = O[k][1] * r;
      return [x, occlusalHeight(x / MA, z / MB), z];
    }));
  }
  const parts = [gridSurface(rings)];
  // roots: each starts as one half of the root trunk (together they continue the crown
  // outline below the CEJ) and separates below the furcation into its own tapering root
  const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const trunkX = MA * 0.84, trunkZ = MB * 0.78;
  for (const [side, rx1, rz1, lean, gr] of [[-1, 0.22, 0.44, -0.05, 0.3], [1, 0.2, 0.37, 0.1, 0.1]]) {
    const rr = [];
    for (let j = 0; j <= 20; j++) {
      const d = j / 20, y = CEJ - d * 1.05;
      const sep = ss(0.22, 0.55, d); // 0 = fused trunk, 1 = separate root
      const cx = side * (trunkX / 2 + (0.36 - trunkX / 2) * sep) + lean * d * sep;
      const rx = trunkX / 2 + (rx1 - trunkX / 2) * sep;
      const rz = (trunkZ + (rz1 - trunkZ) * sep) * (1 - 0.18 * d);
      const n = 2.6 - 0.6 * sep; // matches the crown outline where fused, oval when free
      rr.push(T.map((t) => {
        const c = Math.cos(t), sn = Math.sin(t);
        const e = 1 / Math.pow(Math.pow(Math.abs(c), n) + Math.pow(Math.abs(sn), n), 1 / n);
        // groove down the broad faces; the mesial root's makes it bilobed
        const pinch = 1 - (gr * sep + 0.06) * Math.exp(-(sn * sn) / 0.05);
        const x = cx + c * e * rx * (1 - 0.15 * d) * pinch;
        return [x, y, sn * e * rz];
      }));
    }
    parts.push(gridSurface(rr, true));
  }
  const g = merge(parts);
  g.translate(0, 0.42, 0);
  g.scale(1.3, 1.3, 1.3);
  g.rotateY(0.55);
  g.rotateX(0.32);
  return g;
}
const molarPt = (x, y, z) =>
  new THREE.Vector3(x, y + 0.42, z).multiplyScalar(1.3).applyAxisAngle(new THREE.Vector3(0, 1, 0), 0.55).applyAxisAngle(new THREE.Vector3(1, 0, 0), 0.32);

// 5. Optimisation — a spur gear (nod to the gearbox housing project)
export function gear() {
  const teeth = 18, rOut = 1.15, rIn = 0.95;
  const shape = new THREE.Shape();
  for (let i = 0; i < teeth; i++) {
    const a0 = (i / teeth) * Math.PI * 2;
    const step = (Math.PI * 2) / teeth;
    const pts = [
      [rIn, a0], [rIn, a0 + step * 0.15], [rOut, a0 + step * 0.3],
      [rOut, a0 + step * 0.55], [rIn, a0 + step * 0.7],
    ];
    pts.forEach(([r, a], j) => {
      const x = Math.cos(a) * r, y = Math.sin(a) * r;
      i === 0 && j === 0 ? shape.moveTo(x, y) : shape.lineTo(x, y);
    });
  }
  const bore = new THREE.Path();
  bore.absarc(0, 0, 0.28, 0, Math.PI * 2, true);
  shape.holes.push(bore);
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2;
    const h = new THREE.Path();
    h.absarc(Math.cos(a) * 0.62, Math.sin(a) * 0.62, 0.16, 0, Math.PI * 2, true);
    shape.holes.push(h);
  }
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: 0.32, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.03, bevelSegments: 2, curveSegments: 24,
  });
  g.translate(0, 0, -0.16);
  g.rotateX(-0.7);
  g.rotateY(0.4);
  return g;
}

// Each shape gets one or more load points. Each shape gets a pseudo "stress" field: hot near a load point, cool far away,
// with a little noise so the contour looks like a real result plot.
export const loadPoints = [
  new THREE.Vector3(0.7, 0.8, 0.5),   // gyroid: point load on the upper shell
  // aircraft: wing-root bending on both sides (coordinates in the showcase pose)
  [shown(0.3, 0, -0.25), shown(-0.3, 0, -0.25)],   // AMCA
  [shown(0.3, 0, -0.35), shown(-0.3, 0, -0.35)],   // Tejas
  // car: front-wing mounts + main hoop; monocoque: main-hoop / tub junction and front bulkhead
  [carPt(0, 0.1, 1.3, 0.98), carPt(0, 0.95, -1.0, 0.98)],
  [carPt(0, 0.4, -0.42, 0.98), carPt(0, 0.22, 0.84, 0.98)],
  new THREE.Vector3(1.1, 0.2, 0),     // gear: tooth in mesh
  // molar: load on the mesiolingual and mesiobuccal cusps (as in the thesis load cases)
  [molarPt(-0.32, 0.45, -0.28), molarPt(-0.34, 0.43, 0.27)],
];

export const shapeBuilders = [gyroid, amca, tejas, fsCar, monocoque, gear, molar];
// extra particle thinning for flat shapes (wings, plates) whose skins overlap on screen
export const densityTrim = [1, 0.55, 0.6, 0.95, 1, 1, 1];
