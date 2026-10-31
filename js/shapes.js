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

// 1. Hero — a lumpy "specimen" blob (sphere with layered displacement)
export function specimen() {
  const g = new THREE.IcosahedronGeometry(1.15, 40);
  const p = g.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).normalize();
    const d =
      1 +
      0.12 * Math.sin(v.x * 3.1 + v.y * 2.0) * Math.cos(v.z * 2.7) +
      0.05 * Math.sin(v.y * 7.0 + v.z * 5.0);
    v.multiplyScalar(1.15 * d);
    p.setXYZ(i, v.x, v.y, v.z);
  }
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
      const p = s.p || 1, q = s.q || 1;
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

// ---- Formula Student car (modelled on KA-RaceIng's 2025 electric car, KIT25) ----
// Typical FS proportions: ~2.9 m long, ~1.53 m wheelbase, ~1.2 m track, 10" wheels.
// Scale: 0.9 units per metre. Axes as the aircraft: x = width, y = up, z = length (nose +z).
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
  // roll hoop: two legs + a top arc
  const g = new THREE.TorusGeometry(halfW, r, 8, 32, Math.PI);
  g.translate(0, y0 + height - halfW, z);
  return [g, rod([halfW, y0, z], [halfW, y0 + height - halfW, z], r), rod([-halfW, y0, z], [-halfW, y0 + height - halfW, z], r)];
}
// carbon tub: boxy loft with a real cockpit opening
function tub() {
  const st = [
    { z: 1.02, w: 0.07, h: 0.07, y: 0.24, p: 0.55, q: 0.55 },
    { z: 0.85, w: 0.14, h: 0.12, y: 0.25, p: 0.55, q: 0.55 },
    { z: 0.6, w: 0.19, h: 0.16, y: 0.27, p: 0.5, q: 0.5 },
    { z: 0.36, w: 0.22, h: 0.18, y: 0.28, p: 0.5, q: 0.5, open: true },
    { z: 0.0, w: 0.24, h: 0.19, y: 0.28, p: 0.5, q: 0.5, open: true },
    { z: -0.36, w: 0.25, h: 0.2, y: 0.28, p: 0.5, q: 0.5, open: true },
    { z: -0.46, w: 0.25, h: 0.2, y: 0.28, p: 0.5, q: 0.5 },
  ];
  return loft(st, 56);
}
export function monocoque() {
  const parts = [tub()];
  // front bulkhead plate + cockpit rim
  const bh = new THREE.BoxGeometry(0.15, 0.13, 0.02, 4, 4, 1);
  bh.translate(0, 0.25, 1.03);
  parts.push(bh);
  const rim = new THREE.TorusGeometry(1, 0.012, 6, 64);
  rim.rotateX(Math.PI / 2);
  rim.scale(0.2, 1, 0.36);
  rim.translate(0, 0.47, -0.02);
  parts.push(rim);
  // steel roll hoops and main-hoop bracing (part of the primary structure)
  parts.push(...hoop(0.36, 0.44, 0.17, 0.2), ...hoop(-0.44, 0.44, 0.2, 0.42));
  parts.push(rod([0.12, 0.84, -0.44], [0.16, 0.42, -0.85]), rod([-0.12, 0.84, -0.44], [-0.16, 0.42, -0.85]));
  // suspension pick-up inserts on the tub sides
  for (const s of [1, -1]) for (const z of [0.75, 0.55, -0.3]) {
    const ins = new THREE.CylinderGeometry(0.025, 0.025, 0.03, 12);
    ins.rotateZ(Math.PI / 2);
    ins.translate(s * 0.2, 0.2, z);
    parts.push(ins);
  }
  return carPose(merge(parts), 1.25);
}
function wheelAt(x, z) {
  const parts = [];
  const tyre = new THREE.CylinderGeometry(0.205, 0.205, 0.18, 48, 2, true);
  tyre.rotateZ(Math.PI / 2);
  const side = new THREE.RingGeometry(0.12, 0.205, 48, 1);
  side.rotateY(Math.PI / 2);
  const sideIn = side.clone();
  side.translate(0.09, 0, 0); sideIn.translate(-0.09, 0, 0);
  const rimG = new THREE.CircleGeometry(0.12, 32);
  rimG.rotateY(Math.PI / 2 * Math.sign(x));
  rimG.translate(0.05 * Math.sign(x), 0, 0);
  for (const g of [tyre, side, sideIn, rimG]) { g.translate(x, 0.205, z); parts.push(g); }
  return parts;
}
export function fsCar() {
  const parts = [tub()];
  // nose cone with LiDAR (driverless) and the driver's helmet
  parts.push(loft([
    { z: 1.32, w: 0.02, h: 0.02, y: 0.17 }, { z: 1.2, w: 0.07, h: 0.05, y: 0.19 }, { z: 1.02, w: 0.09, h: 0.08, y: 0.22 },
  ], 32));
  const lidar = new THREE.CylinderGeometry(0.04, 0.04, 0.06, 24); lidar.translate(0, 0.12, 1.24); parts.push(lidar);
  const helmet = new THREE.SphereGeometry(0.1, 24, 16); helmet.scale(1, 1.05, 1.15); helmet.translate(0, 0.6, -0.2); parts.push(helmet);
  parts.push(...hoop(0.36, 0.44, 0.17, 0.2), ...hoop(-0.44, 0.44, 0.2, 0.42));
  // rear: motor / accumulator bodywork tapering to the diffuser
  parts.push(loft([
    { z: -0.46, w: 0.24, h: 0.18, y: 0.28, p: 0.6, q: 0.6 },
    { z: -0.75, w: 0.21, h: 0.15, y: 0.27, p: 0.6, q: 0.6 },
    { z: -0.98, w: 0.12, h: 0.1, y: 0.24, p: 0.6, q: 0.6 },
  ], 40));
  // sidepods with radiator inlets
  for (const s of [1, -1]) {
    parts.push(loft([
      { z: 0.22, w: 0.07, h: 0.08, y: 0.2, p: 0.5, q: 0.5 },
      { z: 0.0, w: 0.1, h: 0.12, y: 0.22, p: 0.5, q: 0.5 },
      { z: -0.5, w: 0.08, h: 0.09, y: 0.2, p: 0.5, q: 0.5 },
    ].map((st) => ({ ...st, x: s * 0.33 })), 32));
  }
  // undertray / floor
  parts.push(...planform([[0.0, 0.5], [0.42, 0.25], [0.42, -0.75], [0.0, -0.9]], { t: 0.012, y: 0.05 }));
  // front wing: main plane + two flaps, endplates
  parts.push(...planform([[0.0, 1.36], [0.62, 1.36], [0.62, 1.12], [0.0, 1.16]], { t: 0.012, y: 0.06 }));
  parts.push(...planform([[0.12, 1.12], [0.62, 1.1], [0.62, 1.0], [0.12, 1.02]], { t: 0.01, y: 0.12 }));
  parts.push(...planform([[0.18, 1.0], [0.62, 0.98], [0.62, 0.92], [0.18, 0.94]], { t: 0.01, y: 0.18 }));
  for (const s of [1, -1]) { const ep = new THREE.BoxGeometry(0.012, 0.2, 0.46, 1, 4, 8); ep.translate(s * 0.63, 0.13, 1.14); parts.push(ep); }
  // rear wing: three stacked elements between big endplates
  parts.push(...planform([[0.0, -1.02], [0.5, -1.02], [0.5, -1.3], [0.0, -1.3]], { t: 0.012, y: 0.78 }));
  parts.push(...planform([[0.0, -0.95], [0.5, -0.95], [0.5, -1.08], [0.0, -1.08]], { t: 0.01, y: 0.9 }));
  parts.push(...planform([[0.0, -0.88], [0.5, -0.88], [0.5, -0.98], [0.0, -0.98]], { t: 0.01, y: 1.0 }));
  for (const s of [1, -1]) {
    const ep = new THREE.BoxGeometry(0.012, 0.42, 0.5, 1, 6, 8); ep.translate(s * 0.51, 0.84, -1.1); parts.push(ep);
    parts.push(rod([s * 0.12, 0.4, -0.85], [s * 0.2, 0.78, -1.12], 0.014));
  }
  // wheels: wheelbase ≈ 1.53 m, track ≈ 1.2 m
  const zF = 0.72, zR = -0.66, xT = 0.56;
  for (const s of [1, -1]) {
    parts.push(...wheelAt(s * xT, zF), ...wheelAt(s * xT, zR));
    // double wishbones + push rods
    for (const [z, zz] of [[zF, 0.12], [zR, 0.1]]) {
      const hub = [s * (xT - 0.07), 0.205, z];
      for (const y of [0.12, 0.3]) {
        parts.push(rod([s * 0.2, y, z + zz], [hub[0], y, z]), rod([s * 0.2, y, z - zz], [hub[0], y, z]));
      }
      parts.push(rod([hub[0], 0.12, z], [s * 0.18, 0.42, z], 0.009));
    }
  }
  return carPose(merge(parts), 1.05);
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

// 4. Research — a stylised molar: crown with four cusps and two roots
export function molar() {
  const crown = new THREE.SphereGeometry(0.85, 96, 64);
  const p = crown.attributes.position;
  const v = new THREE.Vector3();
  const cusps = [
    [0.5, 0.5], [-0.5, 0.5], [0.5, -0.5], [-0.5, -0.5],
  ];
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    // squarish crown
    v.x *= 1.08; v.z *= 0.95; v.y *= 0.72;
    if (v.y > 0) {
      let bump = 0;
      for (const [cx, cz] of cusps) {
        const d = Math.hypot(v.x - cx * 0.85, v.z - cz * 0.8);
        bump += 0.32 * Math.exp(-d * d * 7);
      }
      // central fissure
      const fiss = 0.18 * Math.exp(-(v.x * v.x) * 30) + 0.12 * Math.exp(-(v.z * v.z) * 30);
      v.y += bump - fiss * (v.y / 0.6);
    }
    p.setXYZ(i, v.x, v.y + 0.35, v.z);
  }
  const parts = [crown];
  for (const s of [1, -1]) {
    const root = new THREE.ConeGeometry(0.3, 1.35, 32, 10, true);
    root.rotateX(Math.PI);
    root.rotateZ(s * 0.18);
    root.translate(s * 0.38, -0.65, 0);
    parts.push(root);
  }
  const g = merge(parts);
  g.rotateX(0.35);
  g.rotateY(0.5);
  return g;
}

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
  new THREE.Vector3(0.6, 0.9, 0.4),   // specimen: point load top-right
  // aircraft: wing-root bending on both sides (coordinates in the showcase pose)
  [shown(0.3, 0, -0.25), shown(-0.3, 0, -0.25)],   // AMCA
  [shown(0.3, 0, -0.35), shown(-0.3, 0, -0.35)],   // Tejas
  // car: front-wing mounts + main hoop; monocoque: main-hoop / tub junction and front bulkhead
  [carPt(0, 0.1, 0.95, 1.05), carPt(0, 0.85, -0.44, 1.05)],
  [carPt(0, 0.44, -0.44, 1.25), carPt(0, 0.25, 0.95, 1.25)],
  new THREE.Vector3(1.1, 0.2, 0),     // gear: tooth in mesh
  new THREE.Vector3(0.3, 0.9, 0.2),   // molar: occlusal cusp
];

export const shapeBuilders = [specimen, amca, tejas, fsCar, monocoque, gear, molar];
// extra particle thinning for flat shapes (wings, plates) whose skins overlap on screen
export const densityTrim = [1, 0.55, 0.6, 0.6, 1, 1, 1];
