// Ordu figürleri (sancak), güç etiketleri, muharebe ve kuşatma işaretleri
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { armyMen } from '/shared/sim/core.js';
import { fmtNum } from '/shared/sim/util.js';
import { col } from './colors.js';

const MAX = 4000;
const tmpM = new THREE.Matrix4();
const P = new THREE.Vector3(), Q = new THREE.Vector3(), X = new THREE.Vector3(), Y = new THREE.Vector3(), Z = new THREE.Vector3(), S = new THREE.Vector3();
const camRight = new THREE.Vector3();
const tc = new THREE.Color();

export class ArmyLayer {
  constructor(globe, overlay) {
    this.globe = globe;
    this.overlay = overlay;
    const base = new THREE.CylinderGeometry(0.0052, 0.0062, 0.0014, 16);
    base.translate(0, 0.0007, 0);
    const pole = new THREE.CylinderGeometry(0.00045, 0.00045, 0.021, 6);
    pole.translate(0, 0.0105, 0);
    const knob = new THREE.SphereGeometry(0.0011, 8, 6);
    knob.translate(0, 0.0215, 0);
    const wood = mergeGeometries([base, pole, knob]);
    const flag = new THREE.BoxGeometry(0.0115, 0.0072, 0.0007);
    flag.translate(0.0058, 0.0168, 0);
    this.wood = new THREE.InstancedMesh(wood, new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.6, metalness: 0.2 }), MAX);
    this.flag = new THREE.InstancedMesh(flag, new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.7 }), MAX);
    for (const m of [this.wood, this.flag]) {
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.count = 0;
      m.frustumCulled = false;
      this.globe.scene.add(m);
    }
    this.wood.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 3), 3);
    this.flag.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 3), 3);
    this.labels = new Map();
    this.markers = new Map();
    this.selected = new Set();
    this.onArmyClick = null;
    this.posCache = new Map();
  }

  clear() {
    for (const el of this.labels.values()) el.remove();
    for (const el of this.markers.values()) el.remove();
    this.labels.clear();
    this.markers.clear();
    this.wood.count = 0;
    this.flag.count = 0;
    this.selected = new Set();
    this.onArmyClick = null;
    this.onArmyRight = null;
  }

  armyPos(a, out) {
    const g = this.globe;
    g.cellPos(a.cell, 0, out);
    if (a.path && a.path.length && a.need > 0 && a.prog > 0) {
      g.cellPos(a.path[0], 0, Q);
      const t = Math.min(1, a.prog / a.need);
      const len = out.length() * (1 - t) + Q.length() * t;
      out.lerp(Q, t).setLength(len);
    }
    return out;
  }

  update(G, me, dist) {
    const s = G.state;
    const cam = this.globe.camera;
    const camPos = cam.position;
    camRight.setFromMatrixColumn(cam.matrixWorld, 0);
    const scale = Math.min(1.6, Math.max(0.28, (dist - 1) * 1.05));
    const armies = Object.values(s.armies);
    const perCell = new Map();
    let n = 0;
    const seen = new Set();
    const rect = this.globe.renderer.domElement.getBoundingClientRect();
    for (const a of armies) {
      if (n >= MAX) break;
      const k = perCell.get(a.cell) || 0;
      perCell.set(a.cell, k + 1);
      this.armyPos(a, P);
      Y.copy(P).normalize();
      if (k) {
        // aynı hücredeki orduları yana kaydır
        X.copy(camRight).addScaledVector(Y, -camRight.dot(Y)).normalize();
        P.addScaledVector(X, 0.0075 * scale * k * (k % 2 ? 1 : -1));
      }
      const nat = s.nations[a.owner];
      X.copy(camRight).addScaledVector(Y, -camRight.dot(Y)).normalize();
      Z.crossVectors(X, Y);
      const sc = scale * (a.owner === me ? 1.1 : 1);
      tmpM.makeBasis(X.multiplyScalar(sc), Y.clone().multiplyScalar(sc), Z.multiplyScalar(sc));
      tmpM.setPosition(P);
      this.wood.setMatrixAt(n, tmpM);
      this.flag.setMatrixAt(n, tmpM);
      tc.copy(col(nat?.color || '#888888'));
      this.flag.setColorAt(n, tc);
      tc.multiplyScalar(0.35);
      if (this.selected.has(a.id)) tc.setRGB(1, 0.85, 0.3);
      else if (a.ret) tc.setRGB(0.35, 0.35, 0.35);
      this.wood.setColorAt(n, tc);
      n++;

      // etiket
      seen.add(a.id);
      let el = this.labels.get(a.id);
      if (!el) {
        el = document.createElement('div');
        el.className = 'army-label';
        el.innerHTML = '<i></i><span></span>';
        el.addEventListener('pointerdown', (e) => e.stopPropagation());
        el.addEventListener('click', (e) => { e.stopPropagation(); this.onArmyClick && this.onArmyClick(a.id, e); });
        el.addEventListener('contextmenu', (e) => { e.preventDefault(); e.stopPropagation(); this.onArmyRight && this.onArmyRight(a.id, e); });
        this.overlay.appendChild(el);
        this.labels.set(a.id, el);
      }
      const big = armyMen(a) >= 8000;
      const visible = dist < (a.owner === me ? 6 : big ? 3.2 : 2.3);
      const horizon = P.dot(camPos) / (P.length() * camPos.length());
      if (!visible || horizon < 1 / camPos.length() + 0.03) {
        if (el.style.display !== 'none') el.style.display = 'none';
        continue;
      }
      Q.copy(P).addScaledVector(Y.normalize(), 0.026 * sc).project(cam);
      const x = ((Q.x + 1) / 2) * rect.width, y = ((1 - Q.y) / 2) * rect.height;
      el.style.display = '';
      el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -100%)`;
      const txt = fmtNum(armyMen(a));
      const sp = el.lastChild;
      if (sp.textContent !== txt) sp.textContent = txt;
      const cls = 'army-label' + (a.owner === me ? ' own' : '') + (this.selected.has(a.id) ? ' sel' : '') + (a.ret ? ' ret' : '') + (a.inB ? ' fight' : '');
      if (el.className !== cls) el.className = cls;
      const colr = nat?.color || '#888';
      if (el.firstChild.style.background !== colr) el.firstChild.style.background = colr;
    }
    this.wood.count = n;
    this.flag.count = n;
    this.wood.instanceMatrix.needsUpdate = true;
    this.flag.instanceMatrix.needsUpdate = true;
    this.wood.instanceColor.needsUpdate = true;
    this.flag.instanceColor.needsUpdate = true;
    for (const [id, el] of this.labels) if (!seen.has(id)) { el.remove(); this.labels.delete(id); }
    this.updateMarkers(G, me, dist, rect);
  }

  updateMarkers(G, me, dist, rect) {
    const s = G.state;
    const cam = this.globe.camera;
    const want = new Map();
    for (const k in s.battles) {
      const b = s.battles[k];
      const involved = [b.A, b.D].includes(me);
      want.set('b' + k, { cell: +k, cls: 'marker battle' + (involved ? ' mine' : ''), html: '⚔', title: 'Muharebe' });
    }
    for (const k in s.sieges) {
      const sg = s.sieges[k];
      const pct = Math.min(100, Math.round((sg.prog / sg.need) * 100));
      const mine = sg.by === me || s.owner[k] === me;
      want.set('s' + k, { cell: +k, cls: 'marker siege' + (mine ? ' mine' : '') + (sg.k ? ' native' : ''), html: `<b>${sg.k ? '⛺' : '🏰'}</b><u style="width:${pct}%"></u>`, title: (sg.k ? 'Yerli fethi' : 'Kuşatma') + ` %${pct}` });
    }
    if (me) {
      for (const k in s.colonies) {
        const c = s.colonies[k];
        if (c.n !== me) continue;
        const pct = Math.round((1 - c.left / c.tot) * 100);
        want.set('c' + k, { cell: +k, cls: 'marker colony mine', html: `<b>⚑</b><u style="width:${pct}%"></u>`, title: `Yerleşim %${pct}` });
      }
    }
    const camPos = cam.position;
    for (const [key, m] of want) {
      let el = this.markers.get(key);
      if (!el) {
        el = document.createElement('div');
        el.style.pointerEvents = 'none';
        this.overlay.appendChild(el);
        this.markers.set(key, el);
      }
      if (el.className !== m.cls) el.className = m.cls;
      if (el._h !== m.html) { el.innerHTML = m.html; el._h = m.html; }
      el.title = m.title;
      this.globe.cellPos(m.cell, 0.004, P);
      const horizon = P.dot(camPos) / (P.length() * camPos.length());
      if (horizon < 1 / camPos.length() + 0.03 || dist > 4) { el.style.display = 'none'; continue; }
      Q.copy(P).project(cam);
      const x = ((Q.x + 1) / 2) * rect.width, y = ((1 - Q.y) / 2) * rect.height;
      el.style.display = '';
      el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, 30%)`;
    }
    for (const [key, el] of this.markers) if (!want.has(key)) { el.remove(); this.markers.delete(key); }
  }
}
