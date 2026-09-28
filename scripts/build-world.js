// Gerçek dünya verisinden (Natural Earth, world-atlas paketi) altıgen küre haritası üretir.
// Çıktı: public/data/world.json  —  Çalıştırma: npm run build:world
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as topojson from 'topojson-client';
import { buildGrid, icosahedronVertices, latLonToVec, vecToLatLon } from '../shared/geodesic.js';
import { T } from '../shared/data/terrain.js';
import * as GEO from './geo-data.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const F = 40;
const R_KM = 6371;

// ---------- yardımcılar ----------
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const angKm = (a, b) => Math.acos(Math.max(-1, Math.min(1, dot(a, b)))) * R_KM;

function slerp(a, b, t) {
  const d = Math.max(-1, Math.min(1, dot(a, b)));
  const om = Math.acos(d);
  if (om < 1e-9) return a.slice();
  const s = Math.sin(om);
  const ka = Math.sin((1 - t) * om) / s, kb = Math.sin(t * om) / s;
  return [a[0] * ka + b[0] * kb, a[1] * ka + b[1] * kb, a[2] * ka + b[2] * kb];
}

function samplePolyline(pts, stepKm = 20) {
  const out = [];
  const vs = pts.map(([la, lo]) => latLonToVec(la, lo));
  if (vs.length === 1) return vs;
  for (let i = 0; i < vs.length - 1; i++) {
    const d = angKm(vs[i], vs[i + 1]);
    const n = Math.max(1, Math.ceil(d / stepKm));
    for (let k = 0; k < n; k++) out.push(slerp(vs[i], vs[i + 1], k / n));
  }
  out.push(vs[vs.length - 1]);
  return out;
}

function pipRing(lon, lat, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

// [enlem, boylam] çokgenleri için
function inLatLonPoly(lat, lon, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const yi = poly[i][0], xi = poly[i][1], yj = poly[j][0], xj = poly[j][1];
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
const inAny = (lat, lon, polys) => polys.some((p) => inLatLonPoly(lat, lon, p));

// ---------- kara çokgenleri ----------
const topo = JSON.parse(fs.readFileSync(path.join(ROOT, 'node_modules/world-atlas/land-50m.json'), 'utf8'));
const land = topojson.feature(topo, topo.objects.land);
const polys = [];
for (const feat of land.features) {
  const g = feat.geometry;
  const list = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
  for (const rings of list) {
    let minX = 999, minY = 999, maxX = -999, maxY = -999;
    for (const [x, y] of rings[0]) {
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
    polys.push({ rings, minX, minY, maxX, maxY });
  }
}
function isLand(lat, lon) {
  for (const p of polys) {
    if (lon < p.minX || lon > p.maxX || lat < p.minY || lat > p.maxY) continue;
    if (pipRing(lon, lat, p.rings[0])) {
      let hole = false;
      for (let h = 1; h < p.rings.length; h++) if (pipRing(lon, lat, p.rings[h])) { hole = true; break; }
      if (!hole) return true;
    }
  }
  return false;
}
const isLandVec = (v) => {
  const [la, lo] = vecToLatLon(v);
  return isLand(la, lo);
};

// ---------- beşgenleri okyanusa yerleştiren dönüşü ara ----------
function findRotation() {
  const rnd = mulberry32(1200);
  let best = null, bestScore = -1;
  for (let it = 0; it < 4000; it++) {
    // düzgün rastgele kuaterniyon
    const u1 = rnd(), u2 = rnd(), u3 = rnd();
    const q = [
      Math.sqrt(1 - u1) * Math.sin(2 * Math.PI * u2),
      Math.sqrt(1 - u1) * Math.cos(2 * Math.PI * u2),
      Math.sqrt(u1) * Math.sin(2 * Math.PI * u3),
      Math.sqrt(u1) * Math.cos(2 * Math.PI * u3),
    ];
    const verts = icosahedronVertices(q);
    let score = 0;
    for (const v of verts) {
      const [la, lo] = vecToLatLon(v);
      let ok = !isLand(la, lo);
      if (ok) {
        for (let k = 0; k < 8 && ok; k++) {
          const a = (k / 8) * Math.PI * 2;
          const dl = 4 * Math.cos(a), dn = (4 * Math.sin(a)) / Math.max(0.2, Math.cos((la * Math.PI) / 180));
          if (isLand(Math.max(-89.9, Math.min(89.9, la + dl)), ((lo + dn + 540) % 360) - 180)) ok = false;
        }
      }
      if (ok) score++;
    }
    if (score > bestScore) { bestScore = score; best = q; }
    if (score === 12) break;
  }
  console.log('Dönüş skoru (okyanustaki beşgen):', bestScore);
  return best;
}

const rot = findRotation();
const grid = buildGrid(F, rot);
const N = grid.count;
console.log('Hücre sayısı:', N);

const cvec = (i) => [grid.center[i * 3], grid.center[i * 3 + 1], grid.center[i * 3 + 2]];
const tvec = (t) => [grid.triCenter[t * 3], grid.triCenter[t * 3 + 1], grid.triCenter[t * 3 + 2]];
const nbrs = (i) => Array.from(grid.neighbors.subarray(grid.cellStart[i], grid.cellStart[i + 1]));
const LL = [];
for (let i = 0; i < N; i++) LL.push(vecToLatLon(cvec(i)));

function nearestCell(lat, lon, filter = null) {
  const v = latLonToVec(lat, lon);
  let best = -1, bd = -2;
  for (let i = 0; i < N; i++) {
    if (filter && !filter(i)) continue;
    const d = grid.center[i * 3] * v[0] + grid.center[i * 3 + 1] * v[1] + grid.center[i * 3 + 2] * v[2];
    if (d > bd) { bd = d; best = i; }
  }
  return best;
}

// ---------- kara maskesi ----------
const landMask = new Uint8Array(N);
for (let i = 0; i < N; i++) {
  const c = cvec(i);
  let cnt = isLandVec(c) ? 1 : 0, tot = 1;
  for (let k = grid.cellStart[i]; k < grid.cellStart[i + 1]; k++) {
    const t = tvec(grid.cellTris[k]);
    const m = [(c[0] + t[0]) / 2, (c[1] + t[1]) / 2, (c[2] + t[2]) / 2];
    if (isLandVec(m)) cnt++;
    tot++;
  }
  landMask[i] = cnt / tot >= 0.45 ? 1 : 0;
}
for (const [la, lo] of GEO.FORCE_LAND) landMask[nearestCell(la, lo)] = 1;
for (const [la, lo] of GEO.FORCE_WATER) landMask[nearestCell(la, lo)] = 0;
console.log('Kara hücresi:', landMask.reduce((a, b) => a + b, 0));

// ---------- gürültü ----------
function hash3(x, y, z) {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function vnoise(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = x - xi, yf = y - yi, zf = z - zi;
  const s = (t) => t * t * (3 - 2 * t);
  const u = s(xf), v = s(yf), w = s(zf);
  let r = 0;
  for (let dx = 0; dx < 2; dx++) for (let dy = 0; dy < 2; dy++) for (let dz = 0; dz < 2; dz++) {
    const wt = (dx ? u : 1 - u) * (dy ? v : 1 - v) * (dz ? w : 1 - w);
    r += wt * hash3(xi + dx, yi + dy, zi + dz);
  }
  return r;
}
const fbm = (v, f) => (vnoise(v[0] * f, v[1] * f, v[2] * f) * 0.6 + vnoise(v[0] * f * 2.1 + 7, v[1] * f * 2.1 + 3, v[2] * f * 2.1 + 1) * 0.4);

// ---------- dağ, nehir örnekleri ----------
const rangeSamples = GEO.RANGES.map(([tip, w, pts]) => ({ tip, w, s: samplePolyline(pts) }));
const riverSamples = GEO.RIVERS.map(([ad, pts]) => ({ ad, s: samplePolyline(pts, 15) }));
function minDistKm(v, samples) {
  let best = 1e9;
  for (const s of samples) {
    const d = angKm(v, s);
    if (d < best) best = d;
  }
  return best;
}

// ---------- arazi ----------
const terrain = new Uint8Array(N);
const riverFlag = new Uint8Array(N);
const DESERT_RIVERS = new Set(['Nil', 'Fırat', 'Dicle', 'İndus', 'Nijer', 'Ceyhun', 'Seyhun']);

for (let i = 0; i < N; i++) {
  if (!landMask[i]) continue;
  const v = cvec(i);
  const [lat, lon] = LL[i];

  let riverKm = 1e9, riverName = null;
  for (const r of riverSamples) {
    const d = minDistKm(v, r.s);
    if (d < riverKm) { riverKm = d; riverName = r.ad; }
  }
  if (riverKm < 95) riverFlag[i] = 1;

  let t;
  const greenland = lat > 59.5 && lon > -74 && lon < -11 && !(lat < 66 && lon < -60);
  if (lat < -60) t = T.buzul;
  else if (greenland) t = lat < 70 && nbrs(i).some((n) => !landMask[n]) ? T.tundra : T.buzul;
  else if (lat > 76) t = T.buzul;
  else {
    let mtn = inAny(lat, lon, GEO.MOUNTAIN_POLYS) ? 'dag' : null;
    if (!mtn) {
      for (const r of rangeSamples) {
        const d = minDistKm(v, r.s);
        if (d < Math.max(r.w / 2, 90)) {
          if (r.tip === 'dag') { mtn = 'dag'; break; }
          mtn = 'tepe';
        }
      }
    }
    const nearDesertRiver = riverKm < 80 && DESERT_RIVERS.has(riverName);
    if (mtn === 'dag') t = T.dag;
    else if (inAny(lat, lon, GEO.DESERT_POLYS)) t = nearDesertRiver ? T.ova : mtn === 'tepe' ? T.tepe : T.col;
    else if (mtn === 'tepe') t = T.tepe;
    else if (lat >= 67 || (lat >= 60 && lon < -60 && lon > -170) || (lat >= 63 && lon > 60) || (lat >= 58 && lon > 140)) t = T.tundra;
    else if (GEO.MARSHES.some(([la, lo, r]) => angKm(v, latLonToVec(la, lo)) < r)) t = T.bataklik;
    else if (inAny(lat, lon, GEO.JUNGLE_POLYS)) t = T.cangil;
    else if (inAny(lat, lon, GEO.STEPPE_POLYS)) t = T.bozkir;
    else if ((lat >= 52 && (lon > 38 || lon < -52)) || (lat >= 59.5 && lon > 5)) t = T.tayga;
    else {
      const n = fbm(v, 9);
      const hill = fbm([v[1], v[2], v[0]], 14);
      let forest = 0.33;
      if (lon > -10 && lon < 40 && lat > 44 && lat < 60) forest = 0.42;
      if (lon > -97 && lon < -60 && lat > 28 && lat < 52) forest = 0.62;
      if (lon > 100 && lon < 125 && lat < 32) forest = 0.35;
      if (lat < 25 && lat > -25) forest = 0.25;
      if (hill > 0.66) t = T.tepe;
      else t = n > 0.5 + (0.5 - forest) * 0.3 ? T.orman : T.ova;
    }
  }
  terrain[i] = t;
}

// su: kıyı denizi / açık okyanus
const distLand = new Int32Array(N).fill(99);
const q = [];
for (let i = 0; i < N; i++) if (landMask[i]) { distLand[i] = 0; q.push(i); }
for (let h = 0; h < q.length; h++) {
  const c = q[h];
  if (distLand[c] >= 3) continue;
  for (const n of nbrs(c)) {
    if (distLand[n] > distLand[c] + 1) { distLand[n] = distLand[c] + 1; q.push(n); }
  }
}
for (let i = 0; i < N; i++) if (!landMask[i]) terrain[i] = distLand[i] <= 2 ? T.deniz : T.okyanus;

// ---------- kültür ----------
const cultureIds = Object.keys(GEO.CULTURES);
const cultureCenters = [];
cultureIds.forEach((id, idx) => {
  for (const [la, lo] of GEO.CULTURES[id].c) cultureCenters.push({ idx, v: latLonToVec(la, lo) });
});
const culture = new Int16Array(N).fill(-1);
for (let i = 0; i < N; i++) {
  if (!landMask[i] || terrain[i] === T.buzul) continue;
  const v = cvec(i);
  let best = -1, bd = -2;
  for (const cc of cultureCenters) {
    const d = dot(v, cc.v);
    if (d > bd) { bd = d; best = cc.idx; }
  }
  culture[i] = best;
}

// ---------- şehirler ----------
const cityTier = new Uint8Array(N);
const names = new Array(N).fill('');
const used = new Set();
const sortedCities = GEO.CITIES.slice().sort((a, b) => b[3] - a[3]);
for (const [ad, la, lo, tier] of sortedCities) {
  const v = latLonToVec(la, lo);
  let best = -1, bd = 1e9;
  for (let i = 0; i < N; i++) {
    if (!landMask[i] || terrain[i] === T.buzul || cityTier[i]) continue;
    const d = angKm(v, cvec(i));
    if (d < bd) { bd = d; best = i; }
  }
  if (best < 0 || bd > 260) { console.log('Şehir yerleştirilemedi:', ad, Math.round(bd)); continue; }
  cityTier[best] = tier;
  names[best] = ad;
  used.add(ad);
}

// ---------- adlar ----------
for (let i = 0; i < N; i++) {
  if (!landMask[i] || names[i]) continue;
  if (terrain[i] === T.buzul) { names[i] = 'Buzul'; continue; }
  const cu = GEO.CULTURES[cultureIds[culture[i]]];
  let name = '';
  for (let tries = 0; tries < 40; tries++) {
    const h1 = hash3(i, tries, 17), h2 = hash3(i, tries, 91);
    const pre = cu.pre[Math.floor(h1 * cu.pre.length)];
    const suf = cu.suf[Math.floor(h2 * cu.suf.length)];
    name = pre + suf;
    if (/[aeiouıöüâ]$/i.test(pre) && /^[aeiouıöü]/i.test(suf)) name = pre + suf.slice(1);
    if (!used.has(name)) break;
  }
  if (used.has(name)) name = name + ' ' + ['Yukarı', 'Aşağı', 'Kuzey', 'Güney', 'Doğu', 'Batı'][i % 6];
  used.add(name);
  names[i] = name;
}

// ---------- denizler ----------
const seaCenters = [];
GEO.SEAS.forEach(([ad, pts], idx) => pts.forEach(([la, lo]) => seaCenters.push({ idx, v: latLonToVec(la, lo) })));
const sea = new Int16Array(N).fill(-1);
for (let i = 0; i < N; i++) {
  if (landMask[i]) continue;
  const v = cvec(i);
  let best = -1, bd = -2;
  for (const s of seaCenters) {
    const d = dot(v, s.v);
    if (d > bd) { bd = d; best = s.idx; }
  }
  sea[i] = best;
}

// ---------- gelişmişlik ----------
const TDEV = { [T.ova]: 3, [T.orman]: 2, [T.tepe]: 2, [T.dag]: 1, [T.col]: 1, [T.bozkir]: 1.5, [T.tundra]: 1, [T.cangil]: 1, [T.bataklik]: 1, [T.buzul]: 0, [T.tayga]: 1 };
const civ = GEO.CIV_CENTERS.map(([la, lo, w, r]) => ({ v: latLonToVec(la, lo), w, r }));
const dev = new Uint8Array(N);
for (let i = 0; i < N; i++) {
  if (!landMask[i] || terrain[i] === T.buzul) continue;
  const v = cvec(i);
  let d = TDEV[terrain[i]] ?? 1;
  let c = 0;
  for (const cc of civ) {
    const km = angKm(v, cc.v);
    c += cc.w * Math.exp(-(km * km) / (2 * cc.r * cc.r));
  }
  d += Math.min(4, c);
  if (riverFlag[i]) d += 1;
  if (cityTier[i]) d += [0, 2, 4, 6][cityTier[i]];
  d += (hash3(i, 5, 5) - 0.5) * 1.2;
  dev[i] = Math.max(1, Math.min(14, Math.round(d)));
}

// ---------- yaz ----------
const out = {
  f: F,
  rot,
  terrain: Array.from(terrain),
  dev: Array.from(dev),
  river: Array.from(riverFlag).join(''),
  culture: Array.from(culture),
  sea: Array.from(sea),
  name: names,
  city: Array.from(cityTier).join(''),
  cultures: cultureIds.map((id) => ({ id, ad: GEO.CULTURES[id].ad })),
  seas: GEO.SEAS.map((s) => s[0]),
  rivers: GEO.RIVERS.map(([ad, pts]) => ({ ad, pts })),
};
fs.mkdirSync(path.join(ROOT, 'public/data'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'public/data/world.json'), JSON.stringify(out));
const counts = {};
for (let i = 0; i < N; i++) counts[terrain[i]] = (counts[terrain[i]] || 0) + 1;
console.log('Arazi dağılımı:', counts);
console.log('Yazıldı:', (fs.statSync(path.join(ROOT, 'public/data/world.json')).size / 1024).toFixed(0), 'KB');
