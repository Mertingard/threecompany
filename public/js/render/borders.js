// Ülke sınırları: her ülke kendi tarafına koyu renkli bir şerit çizer
import * as THREE from 'three';
import { col } from './colors.js';

const A = new THREE.Vector3(), B = new THREE.Vector3(), CI = new THREE.Vector3(), AI = new THREE.Vector3(), BI = new THREE.Vector3(), AO = new THREE.Vector3(), BO = new THREE.Vector3();

export class Borders {
  constructor(globe) {
    this.globe = globe;
    const mat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.95, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    this.mesh = new THREE.Mesh(new THREE.BufferGeometry(), mat);
    this.mesh.renderOrder = 2;
    globe.scene.add(this.mesh);
    this.coast = null;
  }

  rebuild(G) {
    const W = G.world, s = G.state, g = W.grid, globe = this.globe;
    const pos = [], colr = [], idx = [];
    const dark = new THREE.Color(), edge = new THREE.Color(), inner = new THREE.Color();
    const quad = (p0, p1, p2, p3, c0, c1) => {
      const b = pos.length / 3;
      pos.push(p0.x, p0.y, p0.z, p1.x, p1.y, p1.z, p2.x, p2.y, p2.z, p3.x, p3.y, p3.z);
      colr.push(c0.r, c0.g, c0.b, c0.r, c0.g, c0.b, c1.r, c1.g, c1.b, c1.r, c1.g, c1.b);
      idx.push(b, b + 1, b + 2, b, b + 2, b + 3, b, b + 2, b + 1, b, b + 3, b + 2);
    };
    for (const i of W.landCells) {
      const o = s.owner[i];
      if (!o) continue;
      const n = s.nations[o];
      if (!n) continue;
      const r = globe.height(i) + 0.0006;
      const st = g.cellStart[i], k = g.cellStart[i + 1] - st;
      globe.cellPos(i, 0.0006, CI);
      const base = col(n.color);
      dark.copy(base).multiplyScalar(0.42);
      edge.copy(base).multiplyScalar(0.18);
      inner.copy(base).multiplyScalar(0.75);
      for (let j = 0; j < k; j++) {
        const nb = g.neighbors[st + j];
        if (W.isWater(nb)) continue;
        const on = s.owner[nb];
        if (on === o) continue;
        globe.corner(i, j, r, A);
        globe.corner(i, j + 1, r, B);
        AO.copy(A).lerp(CI, 0.05);
        BO.copy(B).lerp(CI, 0.05);
        AI.copy(A).lerp(CI, 0.2);
        BI.copy(B).lerp(CI, 0.2);
        const national = !!on;
        quad(A, B, BO, AO, edge, edge);
        quad(AO, BO, BI, AI, national ? dark : inner, inner);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colr, 3));
    geo.setIndex(idx);
    this.mesh.geometry.dispose();
    this.mesh.geometry = geo;
  }
}
