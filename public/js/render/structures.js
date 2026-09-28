// Başkent kaleleri, surlu bölgeler ve şehir işaretleri
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { col } from './colors.js';

const M = new THREE.Matrix4();
const P = new THREE.Vector3(), Y = new THREE.Vector3(), X = new THREE.Vector3(), Z = new THREE.Vector3();
const C = new THREE.Color();

function castleGeo() {
  const parts = [];
  const wall = new THREE.BoxGeometry(0.0075, 0.0022, 0.0075);
  wall.translate(0, 0.0011, 0);
  parts.push(wall);
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const t = new THREE.CylinderGeometry(0.0013, 0.0014, 0.0038, 8);
    t.translate(x * 0.0037, 0.0019, z * 0.0037);
    parts.push(t);
    const roof = new THREE.ConeGeometry(0.0017, 0.0022, 8);
    roof.translate(x * 0.0037, 0.0049, z * 0.0037);
    parts.push(roof);
  }
  const keep = new THREE.BoxGeometry(0.0032, 0.0052, 0.0032);
  keep.translate(0, 0.0026, 0);
  parts.push(keep);
  const kroof = new THREE.ConeGeometry(0.0026, 0.0028, 4);
  kroof.rotateY(Math.PI / 4);
  kroof.translate(0, 0.0066, 0);
  parts.push(kroof);
  return mergeGeometries(parts.map((g) => g.toNonIndexed()));
}

function townGeo() {
  const parts = [];
  const spots = [[0, 0, 1], [0.0022, 0.0012, 0.8], [-0.002, 0.0014, 0.7], [0.0008, -0.0022, 0.75]];
  for (const [x, z, s] of spots) {
    const b = new THREE.BoxGeometry(0.0016 * s, 0.0014 * s, 0.0016 * s);
    b.translate(x, 0.0007 * s, z);
    parts.push(b);
    const r = new THREE.ConeGeometry(0.0013 * s, 0.001 * s, 4);
    r.rotateY(Math.PI / 4);
    r.translate(x, 0.0019 * s, z);
    parts.push(r);
  }
  return mergeGeometries(parts.map((g) => g.toNonIndexed()));
}

export class Structures {
  constructor(globe) {
    this.globe = globe;
    const mat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.75, metalness: 0.05 });
    this.castles = new THREE.InstancedMesh(castleGeo(), mat, 1500);
    this.towns = new THREE.InstancedMesh(townGeo(), new THREE.MeshStandardMaterial({ color: '#e8dcc0', roughness: 0.8 }), 600);
    for (const m of [this.castles, this.towns]) {
      m.count = 0;
      m.frustumCulled = false;
      globe.scene.add(m);
    }
    this.castles.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(1500 * 3), 3);
    this.key = '';
  }

  place(mesh, i, cell, scale) {
    const g = this.globe;
    g.cellPos(cell, 0, P);
    Y.copy(P).normalize();
    X.set(0, 1, 0).cross(Y);
    if (X.lengthSq() < 1e-6) X.set(1, 0, 0);
    X.normalize();
    Z.crossVectors(X, Y);
    M.makeBasis(X.multiplyScalar(scale), Y.clone().multiplyScalar(scale), Z.multiplyScalar(scale));
    M.setPosition(P);
    mesh.setMatrixAt(i, M);
  }

  rebuild(G) {
    const s = G.state, W = G.world;
    let key = s.ownVer + ':' + s.ctrlVer;
    let fsum = 0;
    for (let i = 0; i < s.fort.length; i++) if (s.fort[i]) fsum += s.fort[i] * (i % 97 + 1);
    key += ':' + fsum;
    for (const id in s.nations) if (s.nations[id].alive) key += ',' + s.nations[id].capital;
    if (key === this.key) return;
    this.key = key;
    let n = 0, t = 0;
    const caps = new Set();
    for (const id in s.nations) {
      const nat = s.nations[id];
      if (!nat.alive || nat.capital < 0 || n >= 1500) continue;
      caps.add(nat.capital);
      this.place(this.castles, n, nat.capital, 1.25 + Math.min(1, (s.fort[nat.capital] || 0) * 0.15));
      C.copy(col(nat.color)).lerp(C.set('#d8cdb0'), 0.45);
      this.castles.setColorAt(n, C);
      n++;
    }
    for (const c of W.landCells) {
      if (caps.has(c)) continue;
      const o = s.owner[c];
      if (s.fort[c] && o && n < 1500) {
        this.place(this.castles, n, c, 0.8);
        C.copy(col(s.nations[o]?.color || '#999999')).lerp(C.set('#b8b0a0'), 0.55);
        this.castles.setColorAt(n, C);
        n++;
      } else if (W.city[c] && t < 600) {
        this.place(this.towns, t, c, 1 + W.city[c] * 0.25);
        t++;
      }
    }
    this.castles.count = n;
    this.towns.count = t;
    this.castles.instanceMatrix.needsUpdate = true;
    this.castles.instanceColor.needsUpdate = true;
    this.towns.instanceMatrix.needsUpdate = true;
  }

  setVisible(dist) {
    const v = dist < 2.8;
    this.castles.visible = v;
    this.towns.visible = dist < 2.0;
  }
}
