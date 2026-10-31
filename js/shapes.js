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

// 2. Aerospace — a stylised twin-tail delta-wing jet (not a model of any real aircraft)
export function jet() {
  const parts = [];
  const fus = new THREE.CylinderGeometry(0.16, 0.2, 2.2, 32, 8);
  fus.rotateX(Math.PI / 2);
  parts.push(fus);
  const nose = new THREE.ConeGeometry(0.16, 0.7, 32, 4);
  nose.rotateX(Math.PI / 2);
  nose.translate(0, 0, 1.45);
  parts.push(nose);
  const canopy = new THREE.SphereGeometry(0.13, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2);
  canopy.scale(1, 0.8, 2.6);
  canopy.translate(0, 0.14, 0.75);
  parts.push(canopy);

  const wingShape = new THREE.Shape();
  wingShape.moveTo(0, 0.55);
  wingShape.lineTo(1.25, -0.45);
  wingShape.lineTo(1.2, -0.75);
  wingShape.lineTo(0, -0.8);
  wingShape.lineTo(0, 0.55);
  const wingR = new THREE.ExtrudeGeometry(wingShape, { depth: 0.04, bevelEnabled: false });
  wingR.rotateX(Math.PI / 2);
  wingR.translate(0.12, 0, 0);
  const wingL = wingR.clone();
  wingL.scale(-1, 1, 1);
  parts.push(wingR, wingL);

  const finShape = new THREE.Shape();
  finShape.moveTo(0, 0);
  finShape.lineTo(0.35, 0.55);
  finShape.lineTo(0.55, 0.55);
  finShape.lineTo(0.6, 0);
  finShape.lineTo(0, 0);
  for (const s of [1, -1]) {
    const fin = new THREE.ExtrudeGeometry(finShape, { depth: 0.03, bevelEnabled: false });
    fin.rotateY(Math.PI / 2);
    fin.rotateZ(s * 0.35);
    fin.translate(s * 0.18, 0.1, -0.35);
    parts.push(fin);
  }
  const g = merge(parts);
  g.rotateY(-0.6);
  g.rotateX(0.35);
  g.scale(1.05, 1.05, 1.05);
  return g;
}

// 3. Motorsport — open-wheel race wheel: tyre, rim, spokes, hub
export function wheel() {
  const parts = [];
  const tyre = new THREE.TorusGeometry(1.0, 0.3, 32, 120);
  tyre.scale(1, 1, 1.4);
  parts.push(tyre);
  const rim = new THREE.CylinderGeometry(0.72, 0.72, 0.6, 96, 6, true);
  rim.rotateX(Math.PI / 2);
  parts.push(rim);
  for (let i = 0; i < 10; i++) {
    const s = new THREE.BoxGeometry(0.06, 0.62, 0.05, 2, 12, 2);
    s.translate(0, 0.38, 0.12);
    s.rotateZ((i / 10) * Math.PI * 2 + 0.15);
    parts.push(s);
  }
  const hub = new THREE.CylinderGeometry(0.14, 0.18, 0.4, 32, 4);
  hub.rotateX(Math.PI / 2);
  parts.push(hub);
  const g = merge(parts);
  g.rotateY(0.5);
  g.rotateX(-0.15);
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

// Each shape gets a pseudo "stress" field: hot near a load point, cool far away,
// with a little noise so the contour looks like a real result plot.
export const loadPoints = [
  new THREE.Vector3(0.6, 0.9, 0.4),   // specimen: point load top-right
  new THREE.Vector3(0.25, 0, 0.2),    // jet: wing root
  new THREE.Vector3(0, 0.4, 0.1),     // wheel: spoke roots / hub
  new THREE.Vector3(1.1, 0.2, 0),     // gear: tooth in mesh
  new THREE.Vector3(0.3, 0.9, 0.2),   // molar: occlusal cusp
];

export const shapeBuilders = [specimen, jet, wheel, gear, molar];
