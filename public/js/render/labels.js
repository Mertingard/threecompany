// Ülke adları: ülkenin en büyük toprak parçasının üzerine, ana eksen boyunca kavisli yazı
import * as THREE from 'three';
import { shortName } from '/shared/sim/core.js';

const UP = new THREE.Vector3(0, 1, 0);

export class Labels {
  constructor(globe) {
    this.globe = globe;
    this.group = new THREE.Group();
    this.group.renderOrder = 6;
    globe.scene.add(this.group);
    this.items = [];
  }

  clear() {
    for (const it of this.items) {
      this.group.remove(it.mesh);
      it.mesh.geometry.dispose();
      it.mesh.material.map.dispose();
      it.mesh.material.dispose();
    }
    this.items = [];
  }

  rebuild(G) {
    this.clear();
    const W = G.world, s = G.state;
    const byNation = new Map();
    for (const c of W.landCells) {
      const o = s.owner[c];
      if (!o) continue;
      let l = byNation.get(o);
      if (!l) byNation.set(o, (l = []));
      l.push(c);
    }
    for (const [id, cells] of byNation) {
      const n = s.nations[id];
      if (!n?.alive) continue;
      // en büyük bağlı parça
      const set = new Set(cells);
      const seen = new Set();
      let best = [];
      for (const c of cells) {
        if (seen.has(c)) continue;
        const comp = [c];
        seen.add(c);
        for (let h = 0; h < comp.length; h++) {
          for (const nb of W.nbr[comp[h]]) if (set.has(nb) && !seen.has(nb)) { seen.add(nb); comp.push(nb); }
        }
        if (comp.length > best.length) best = comp;
      }
      this.addLabel(G, n, best);
    }
  }

  addLabel(G, n, cells) {
    const C = G.world.grid.center;
    const p0 = new THREE.Vector3();
    for (const c of cells) p0.add(new THREE.Vector3(C[c * 3], C[c * 3 + 1], C[c * 3 + 2]));
    p0.normalize();
    let east = new THREE.Vector3().crossVectors(UP, p0);
    if (east.lengthSq() < 1e-6) east.set(1, 0, 0);
    east.normalize();
    const north = new THREE.Vector3().crossVectors(p0, east).normalize();
    let xx = 0, xy = 0, yy = 0;
    const pts = [];
    for (const c of cells) {
      const d = new THREE.Vector3(C[c * 3], C[c * 3 + 1], C[c * 3 + 2]).sub(p0);
      const x = d.dot(east), y = d.dot(north);
      pts.push([x, y]);
      xx += x * x; xy += x * y; yy += y * y;
    }
    let th = 0.5 * Math.atan2(2 * xy, xx - yy);
    if (cells.length < 3) th = 0;
    // okunabilirlik için dikliği sınırla
    th = Math.max(-0.95, Math.min(0.95, th));
    const ax = new THREE.Vector3().copy(east).multiplyScalar(Math.cos(th)).addScaledVector(north, Math.sin(th)).normalize();
    const px = new THREE.Vector3().crossVectors(p0, ax).normalize();
    let minA = Infinity, maxA = -Infinity, minP = Infinity, maxP = -Infinity;
    for (const [x, y] of pts) {
      const a = x * Math.cos(th) + y * Math.sin(th);
      const p = -x * Math.sin(th) + y * Math.cos(th);
      minA = Math.min(minA, a); maxA = Math.max(maxA, a);
      minP = Math.min(minP, p); maxP = Math.max(maxP, p);
    }
    const cell = G.world.stepAngle;
    const L = maxA - minA + cell;
    const H = maxP - minP + cell;
    const text = shortName(n.name).toLocaleUpperCase('tr');
    const chars = Math.max(3, text.length);
    let h = Math.min(H * 0.55, (L * 0.92) / (chars * 0.72));
    h = Math.max(h, cell * 0.35);
    const len = Math.min(L * 0.95, h * chars * 0.72);
    const center = p0.clone().addScaledVector(ax, (maxA + minA) / 2).addScaledVector(px, ((maxP + minP) / 2) * 0.6).normalize();
    const pxC = new THREE.Vector3().crossVectors(center, ax).normalize();
    const axC = new THREE.Vector3().crossVectors(pxC, center).normalize();

    // doku
    const fontPx = 64;
    const cv = document.createElement('canvas');
    const ctx = cv.getContext('2d');
    ctx.font = `600 ${fontPx}px Cinzel, Georgia, serif`;
    const spacing = fontPx * 0.12;
    let tw = 0;
    for (const ch of text) tw += ctx.measureText(ch).width + spacing;
    cv.width = Math.ceil(tw + fontPx * 0.6);
    cv.height = Math.ceil(fontPx * 1.35);
    ctx.font = `600 ${fontPx}px Cinzel, Georgia, serif`;
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    let x = fontPx * 0.3;
    for (const ch of text) {
      ctx.lineWidth = fontPx * 0.14;
      ctx.strokeStyle = 'rgba(20,14,6,0.75)';
      ctx.strokeText(ch, x, cv.height / 2);
      ctx.fillStyle = '#f6ecd2';
      ctx.fillText(ch, x, cv.height / 2);
      x += ctx.measureText(ch).width + spacing;
    }
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    const aspect = cv.width / cv.height;
    const width = Math.min(len, h * aspect);
    const height = width / aspect;

    // kavisli şerit
    const seg = 24;
    const R = 1.029;
    const pos = [], uv = [], idx = [];
    const half = width / 2;
    for (let i = 0; i <= seg; i++) {
      const t = i / seg;
      const ang = -half + width * t;
      const p = center.clone().multiplyScalar(Math.cos(ang)).addScaledVector(axC, Math.sin(ang));
      for (const side of [-1, 1]) {
        const q = p.clone().addScaledVector(pxC, (side * height) / 2).normalize().multiplyScalar(R);
        pos.push(q.x, q.y, q.z);
        uv.push(t, side > 0 ? 1 : 0);
      }
      if (i < seg) {
        const b = i * 2;
        idx.push(b, b + 2, b + 1, b + 1, b + 2, b + 3);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, side: THREE.DoubleSide, opacity: 0.9 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.renderOrder = 6;
    this.group.add(mesh);
    this.items.push({ mesh, h: height, id: n.id, center });
  }

  update(dist) {
    const camDir = this.globe.camera.position.clone().normalize();
    for (const it of this.items) {
      const screen = it.h / Math.max(0.05, dist - 1);
      let op = Math.min(1, (screen - 0.02) / 0.04);
      if (screen > 0.5) op = Math.max(0, 1 - (screen - 0.5) / 0.4);
      if (dist < 1.3) op *= Math.max(0, (dist - 1.12) / 0.18);
      const facing = it.center.dot(camDir);
      if (facing < 0.1) op = 0;
      it.mesh.visible = op > 0.02;
      it.mesh.material.opacity = 0.92 * Math.max(0, op);
    }
  }
}
