// Üç boyutlu dünya küresi: altıgen hücreler, deniz, atmosfer, nehirler, seçim
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TERRAIN, T } from '/shared/data/terrain.js';
import { latLonToVec } from '/shared/geodesic.js';
import { landColor, waterColor, stripeColor } from './colors.js';

const tmpC = new THREE.Color();
const tmpS = new THREE.Color();

export class Globe {
  constructor(container, W) {
    this.W = W;
    this.container = container;
    this.mode = 'siyasi';
    this.highlights = new Map();
    this.hoverCell = -1;
    this.selCell = -1;
    this.listeners = {};

    const renderer = (this.renderer = new THREE.WebGLRenderer({ antialias: true, logarithmicDepthBuffer: false }));
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    container.appendChild(renderer.domElement);

    const scene = (this.scene = new THREE.Scene());
    scene.background = new THREE.Color('#05070d');
    const camera = (this.camera = new THREE.PerspectiveCamera(38, container.clientWidth / container.clientHeight, 0.01, 200));
    const start = latLonToVec(38, 25);
    camera.position.set(start[0] * 3.3, start[1] * 3.3, start[2] * 3.3);
    scene.add(camera);

    const controls = (this.controls = new OrbitControls(camera, renderer.domElement));
    controls.enablePan = false;
    controls.enableDamping = true;
    controls.dampingFactor = 0.12;
    controls.minDistance = 1.12;
    controls.maxDistance = 5;
    controls.zoomSpeed = 0.9;
    controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: null };

    scene.add(new THREE.HemisphereLight('#dfe8ff', '#3a3020', 1.1));
    const sun = new THREE.DirectionalLight('#fff4e0', 1.9);
    sun.position.set(-1.2, 1.4, 1.5);
    camera.add(sun);
    camera.add(sun.target);
    sun.target.position.set(0, 0, -3);

    this.buildGlobe();
    this.buildAtmosphere();
    this.buildStars();
    this.buildRivers();
    this.buildOutlines();

    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();
    this.bindEvents();

    this.clock = new THREE.Clock();
    renderer.setAnimationLoop(() => this.frame());
    window.addEventListener('resize', () => this.resize());
  }

  on(ev, fn) { (this.listeners[ev] ||= []).push(fn); }
  emit(ev, ...a) { for (const f of this.listeners[ev] || []) f(...a); }

  height(i) {
    const W = this.W;
    if (W.isWater(i)) return 1.0;
    return 1 + (TERRAIN[W.terrain[i]].h || 0.008);
  }

  cellPos(i, extra = 0, out = new THREE.Vector3()) {
    const C = this.W.grid.center;
    const r = this.height(i) + extra;
    return out.set(C[i * 3] * r, C[i * 3 + 1] * r, C[i * 3 + 2] * r);
  }

  corner(i, k, r, out = new THREE.Vector3()) {
    const g = this.W.grid;
    const s = g.cellStart[i];
    const cnt = g.cellStart[i + 1] - s;
    const t = g.cellTris[s + (k % cnt)];
    return out.set(g.triCenter[t * 3] * r, g.triCenter[t * 3 + 1] * r, g.triCenter[t * 3 + 2] * r);
  }

  buildGlobe() {
    const W = this.W, g = W.grid, N = W.N;
    const build = (land) => {
      const pos = [], nor = [], idx = [], faceCell = [];
      const vStart = new Int32Array(N).fill(-1), vCount = new Int32Array(N), wStart = new Int32Array(N).fill(-1), wCount = new Int32Array(N);
      const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), d = new THREE.Vector3(), n = new THREE.Vector3(), e1 = new THREE.Vector3(), e2 = new THREE.Vector3();
      const pushTri = (i0, i1, i2, want, cell) => {
        a.fromArray(pos, i0 * 3); b.fromArray(pos, i1 * 3); c.fromArray(pos, i2 * 3);
        e1.subVectors(b, a); e2.subVectors(c, a); n.crossVectors(e1, e2);
        if (n.dot(want) < 0) idx.push(i0, i2, i1); else idx.push(i0, i1, i2);
        faceCell.push(cell);
      };
      for (let i = 0; i < N; i++) {
        if (W.isLand(i) !== land) continue;
        const r = this.height(i);
        const s = g.cellStart[i], k = g.cellStart[i + 1] - s;
        const cx = g.center[i * 3], cy = g.center[i * 3 + 1], cz = g.center[i * 3 + 2];
        const base = pos.length / 3;
        vStart[i] = base;
        pos.push(cx * r, cy * r, cz * r); nor.push(cx, cy, cz);
        for (let j = 0; j < k; j++) {
          this.corner(i, j, r, a);
          pos.push(a.x, a.y, a.z);
          nor.push(cx, cy, cz);
        }
        vCount[i] = k + 1;
        const up = new THREE.Vector3(cx, cy, cz);
        for (let j = 0; j < k; j++) pushTri(base, base + 1 + j, base + 1 + ((j + 1) % k), up, i);
        if (!land) continue;
        // yan duvarlar
        const wb = pos.length / 3;
        wStart[i] = wb;
        for (let j = 0; j < k; j++) {
          const nb = g.neighbors[s + j];
          const rn = this.height(nb);
          if (rn >= r - 1e-6) continue;
          this.corner(i, j, r, a); this.corner(i, j + 1, r, b);
          this.corner(i, j, rn, c); this.corner(i, j + 1, rn, d);
          const mid = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5);
          const out = mid.clone().sub(up.clone().multiplyScalar(r));
          out.sub(up.clone().multiplyScalar(out.dot(up))).normalize();
          const v0 = pos.length / 3;
          for (const p of [a, b, d, c]) { pos.push(p.x, p.y, p.z); nor.push(out.x, out.y, out.z); }
          pushTri(v0, v0 + 1, v0 + 2, out, i);
          pushTri(v0, v0 + 2, v0 + 3, out, i);
        }
        wCount[i] = pos.length / 3 - wb;
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
      const colors = new Float32Array(pos.length);
      geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      if (land) geo.setAttribute('stripe', new THREE.BufferAttribute(new Float32Array((pos.length / 3) * 4), 4));
      geo.setIndex(idx);
      geo.computeBoundingSphere();
      return { geo, vStart, vCount, wStart, wCount, faceCell };
    };

    const L = (this.landData = build(true));
    const landMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0.0, flatShading: false });
    landMat.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute vec4 stripe;\nvarying vec4 vStripe;\nvarying vec3 vWPos;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvStripe = stripe;\nvWPos = position;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec4 vStripe;\nvarying vec3 vWPos;')
        .replace('#include <color_fragment>', '#include <color_fragment>\nif (vStripe.a > 0.5) { float st = step(0.5, fract((vWPos.x * 0.8 + vWPos.y + vWPos.z * 0.55) * 170.0)); diffuseColor.rgb = mix(diffuseColor.rgb, vStripe.rgb, st * 0.9); }');
    };
    this.land = new THREE.Mesh(L.geo, landMat);
    this.land.userData.faceCell = L.faceCell;
    this.scene.add(this.land);

    const Wd = (this.waterData = build(false));
    const wc = Wd.geo.getAttribute('color').array;
    for (let i = 0; i < W.N; i++) {
      if (Wd.vStart[i] < 0) continue;
      waterColor(W, i, tmpC);
      for (let v = Wd.vStart[i]; v < Wd.vStart[i] + Wd.vCount[i]; v++) {
        const m = v === Wd.vStart[i] ? 1.0 : 0.94;
        wc[v * 3] = tmpC.r * m; wc[v * 3 + 1] = tmpC.g * m; wc[v * 3 + 2] = tmpC.b * m;
      }
    }
    const waterMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.38, metalness: 0.08 });
    this.waterUniforms = { uTime: { value: 0 } };
    waterMat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = this.waterUniforms.uTime;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vWPos2;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWPos2 = position;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform float uTime;\nvarying vec3 vWPos2;')
        .replace('#include <color_fragment>', `#include <color_fragment>
          float wv = sin(vWPos2.x * 90.0 + uTime * 0.7) * sin(vWPos2.y * 80.0 - uTime * 0.5) * sin(vWPos2.z * 85.0 + uTime * 0.6);
          diffuseColor.rgb *= 1.0 + wv * 0.06;`);
    };
    this.water = new THREE.Mesh(Wd.geo, waterMat);
    this.water.userData.faceCell = Wd.faceCell;
    this.scene.add(this.water);
  }

  buildAtmosphere() {
    const geo = new THREE.SphereGeometry(1.1, 64, 64);
    const mat = new THREE.ShaderMaterial({
      uniforms: {},
      vertexShader: `varying vec3 vN; varying vec3 vP; void main(){ vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position,1.0); vP = mv.xyz; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `varying vec3 vN; varying vec3 vP; void main(){ vec3 v = normalize(-vP); float f = pow(1.0 - abs(dot(vN, v)), 2.6); gl_FragColor = vec4(vec3(0.35,0.6,1.0) * f * 1.4, f); }`,
      side: THREE.BackSide,
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
    });
    this.scene.add(new THREE.Mesh(geo, mat));
    // ince iç parıltı
    const inner = new THREE.Mesh(
      new THREE.SphereGeometry(1.035, 64, 64),
      new THREE.ShaderMaterial({
        vertexShader: `varying vec3 vN; varying vec3 vP; void main(){ vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position,1.0); vP = mv.xyz; gl_Position = projectionMatrix * mv; }`,
        fragmentShader: `varying vec3 vN; varying vec3 vP; void main(){ vec3 v = normalize(-vP); float f = pow(1.0 - max(dot(vN, v), 0.0), 3.5); gl_FragColor = vec4(vec3(0.45,0.7,1.0), f * 0.55); }`,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    this.scene.add(inner);
  }

  buildStars() {
    const n = 2500, pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const u = Math.random() * 2 - 1, th = Math.random() * Math.PI * 2, r = 60 + Math.random() * 40;
      const s = Math.sqrt(1 - u * u);
      pos[i * 3] = r * s * Math.cos(th); pos[i * 3 + 1] = r * u; pos[i * 3 + 2] = r * s * Math.sin(th);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.scene.add(new THREE.Points(geo, new THREE.PointsMaterial({ color: '#cfd8ff', size: 0.18, sizeAttenuation: true, transparent: true, opacity: 0.8 })));
  }

  nearestFrom(start, v) {
    const W = this.W, C = W.grid.center;
    let cur = start;
    const dot = (i) => C[i * 3] * v[0] + C[i * 3 + 1] * v[1] + C[i * 3 + 2] * v[2];
    for (let it = 0; it < 500; it++) {
      let best = cur, bd = dot(cur);
      for (const nb of W.nbr[cur]) { const d = dot(nb); if (d > bd) { bd = d; best = nb; } }
      if (best === cur) break;
      cur = best;
    }
    return cur;
  }

  buildRivers() {
    const W = this.W;
    const mat = new THREE.MeshStandardMaterial({ color: '#3d7fc4', roughness: 0.4, metalness: 0.1 });
    const group = new THREE.Group();
    let cell = 0;
    for (const r of W.rivers) {
      const pts = [];
      const vs = r.pts.map(([la, lo]) => latLonToVec(la, lo));
      for (let i = 0; i < vs.length - 1; i++) {
        const a = new THREE.Vector3(...vs[i]), b = new THREE.Vector3(...vs[i + 1]);
        for (let k = 0; k < 6; k++) {
          const v = a.clone().lerp(b, k / 6).normalize();
          cell = this.nearestFrom(cell, [v.x, v.y, v.z]);
          const h = W.isWater(cell) ? 1.001 : this.height(cell) + 0.0007;
          pts.push(v.multiplyScalar(h));
        }
      }
      const last = new THREE.Vector3(...vs[vs.length - 1]);
      cell = this.nearestFrom(cell, vs[vs.length - 1]);
      pts.push(last.multiplyScalar(W.isWater(cell) ? 1.001 : this.height(cell) + 0.0007));
      const curve = new THREE.CatmullRomCurve3(pts);
      group.add(new THREE.Mesh(new THREE.TubeGeometry(curve, pts.length * 2, 0.0011, 4, false), mat));
    }
    this.rivers = group;
    this.scene.add(group);
  }

  buildOutlines() {
    const mk = (color, op) => {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(8 * 3), 3));
      const l = new THREE.LineLoop(geo, new THREE.LineBasicMaterial({ color, transparent: true, opacity: op, depthTest: true }));
      l.visible = false;
      l.renderOrder = 5;
      this.scene.add(l);
      return l;
    };
    this.hoverLine = mk('#ffffff', 0.85);
    this.selLine = mk('#ffd75a', 1);
    // seçili hücre için yarı saydam dolgu
    const fillGeo = new THREE.BufferGeometry();
    fillGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(8 * 3), 3));
    fillGeo.setIndex([0, 1, 2, 0, 2, 3, 0, 3, 4, 0, 4, 5, 0, 5, 6, 0, 6, 1]);
    this.selFill = new THREE.Mesh(fillGeo, new THREE.MeshBasicMaterial({ color: '#ffe38a', transparent: true, opacity: 0.25, depthWrite: false }));
    this.selFill.visible = false;
    this.selFill.renderOrder = 4;
    this.scene.add(this.selFill);
    // yol çizgisi
    this.pathGroup = new THREE.Group();
    this.scene.add(this.pathGroup);
  }

  setOutline(line, cell) {
    if (cell < 0) { line.visible = false; return; }
    const g = this.W.grid;
    const k = g.cellStart[cell + 1] - g.cellStart[cell];
    const r = this.height(cell) + 0.0012;
    const arr = new Float32Array(k * 3);
    const v = new THREE.Vector3();
    for (let j = 0; j < k; j++) { this.corner(cell, j, r, v); arr[j * 3] = v.x; arr[j * 3 + 1] = v.y; arr[j * 3 + 2] = v.z; }
    line.geometry.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    line.geometry.computeBoundingSphere();
    line.visible = true;
  }

  setHover(cell) {
    if (cell === this.hoverCell) return;
    this.hoverCell = cell;
    this.setOutline(this.hoverLine, cell);
  }

  setSelected(cell) {
    this.selCell = cell;
    this.setOutline(this.selLine, cell);
    if (cell < 0) { this.selFill.visible = false; return; }
    const g = this.W.grid;
    const k = g.cellStart[cell + 1] - g.cellStart[cell];
    const r = this.height(cell) + 0.0009;
    const arr = new Float32Array(8 * 3);
    const v = new THREE.Vector3();
    this.cellPos(cell, 0.0009, v);
    arr[0] = v.x; arr[1] = v.y; arr[2] = v.z;
    for (let j = 0; j < 6; j++) { this.corner(cell, Math.min(j, k - 1), r, v); arr[(j + 1) * 3] = v.x; arr[(j + 1) * 3 + 1] = v.y; arr[(j + 1) * 3 + 2] = v.z; }
    this.selFill.geometry.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    this.selFill.geometry.computeBoundingSphere();
    this.selFill.visible = true;
  }

  // Ordu yolu: hücre dizisi boyunca çizgi ve hedef işareti
  setPath(fromPos, cells, color = '#ffe07a') {
    const grp = this.pathGroup;
    while (grp.children.length) { const c = grp.children.pop(); c.geometry.dispose(); }
    if (!cells || !cells.length) return;
    const pts = [fromPos.clone()];
    for (const c of cells) pts.push(this.cellPos(c, 0.004));
    const dense = [];
    for (let i = 0; i < pts.length - 1; i++) {
      for (let k = 0; k < 4; k++) {
        const p = pts[i].clone().lerp(pts[i + 1], k / 4);
        const len = Math.max(pts[i].length(), pts[i + 1].length());
        dense.push(p.setLength(len + 0.002));
      }
    }
    dense.push(pts[pts.length - 1]);
    const geo = new THREE.BufferGeometry().setFromPoints(dense);
    const line = new THREE.Line(geo, new THREE.LineDashedMaterial({ color, dashSize: 0.006, gapSize: 0.004, depthTest: false, transparent: true }));
    line.computeLineDistances();
    line.renderOrder = 10;
    grp.add(line);
    const end = pts[pts.length - 1];
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.004, 0.0065, 20), new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, depthTest: false, transparent: true }));
    ring.position.copy(end);
    ring.lookAt(end.clone().multiplyScalar(2));
    ring.renderOrder = 10;
    grp.add(ring);
  }

  // Tüm kara renklerini yeniden hesapla
  recolor(G, me) {
    const W = this.W, L = this.landData;
    const col = L.geo.getAttribute('color');
    const st = L.geo.getAttribute('stripe');
    const ca = col.array, sa = st.array;
    for (const i of W.landCells) {
      landColor(G, this.mode, me, i, tmpC);
      const hl = this.highlights.get(i);
      if (hl) tmpC.lerp(tmpS.set(hl), 0.6);
      const has = this.mode === 'siyasi' || this.mode === 'diplomasi' ? stripeColor(G, i, tmpS) : false;
      const vs = L.vStart[i];
      for (let v = vs; v < vs + L.vCount[i]; v++) {
        const m = v === vs ? 1.015 : 0.985;
        ca[v * 3] = tmpC.r * m; ca[v * 3 + 1] = tmpC.g * m; ca[v * 3 + 2] = tmpC.b * m;
        sa[v * 4] = tmpS.r; sa[v * 4 + 1] = tmpS.g; sa[v * 4 + 2] = tmpS.b; sa[v * 4 + 3] = has ? 1 : 0;
      }
      const ws = L.wStart[i];
      for (let v = ws; v < ws + L.wCount[i]; v++) {
        ca[v * 3] = tmpC.r * 0.62; ca[v * 3 + 1] = tmpC.g * 0.62; ca[v * 3 + 2] = tmpC.b * 0.62;
        sa[v * 4 + 3] = 0;
      }
    }
    col.needsUpdate = true;
    st.needsUpdate = true;
  }

  flyTo(cell, dist = null) {
    const target = this.cellPos(cell).normalize();
    const d = dist ?? Math.max(1.5, Math.min(2.4, this.camera.position.length()));
    this.fly = { from: this.camera.position.clone(), to: target.multiplyScalar(d), t: 0 };
  }

  pick(clientX, clientY) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.mouse.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(this.mouse, this.camera);
    const hits = this.raycaster.intersectObjects([this.land, this.water], false);
    if (!hits.length) return -1;
    const h = hits[0];
    return h.object.userData.faceCell[h.faceIndex] ?? -1;
  }

  bindEvents() {
    const el = this.renderer.domElement;
    let down = null;
    el.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY, b: e.button }; });
    el.addEventListener('pointermove', (e) => {
      const c = this.pick(e.clientX, e.clientY);
      this.setHover(c);
      this.emit('hover', c, e);
    });
    el.addEventListener('pointerleave', () => { this.setHover(-1); this.emit('hover', -1, null); });
    el.addEventListener('pointerup', (e) => {
      if (!down) return;
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5;
      const b = down.b;
      down = null;
      if (moved) return;
      const c = this.pick(e.clientX, e.clientY);
      if (b === 0) this.emit('click', c, e);
      else if (b === 2) this.emit('rightclick', c, e);
    });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  resize() {
    const w = this.container.clientWidth, h = this.container.clientHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  frame() {
    const dt = Math.min(0.1, this.clock.getDelta());
    this.waterUniforms.uTime.value += dt;
    const dist = this.camera.position.length();
    this.controls.rotateSpeed = Math.max(0.05, 0.42 * (dist - 1));
    this.controls.zoomSpeed = 0.6 + 0.5 * Math.min(1, (dist - 1.1) / 2);
    if (this.fly) {
      this.fly.t = Math.min(1, this.fly.t + dt * 1.8);
      const t = 1 - Math.pow(1 - this.fly.t, 3);
      const a = this.fly.from.clone().normalize(), b = this.fly.to.clone().normalize();
      const len = this.fly.from.length() * (1 - t) + this.fly.to.length() * t;
      const q = new THREE.Quaternion().setFromUnitVectors(a, b);
      const qi = new THREE.Quaternion().slerp(q, t);
      this.camera.position.copy(a.applyQuaternion(qi).multiplyScalar(len));
      if (this.fly.t >= 1) this.fly = null;
    }
    this.controls.update();
    this.rivers.visible = dist < 2.6;
    this.emit('frame', dt, dist);
    this.renderer.render(this.scene, this.camera);
  }
}
