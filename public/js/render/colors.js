// Harita modlarına göre hücre renkleri
import * as THREE from 'three';
import { TERRAIN, T } from '/shared/data/terrain.js';
import { RELIGIONS } from '/shared/data/rules.js';
import { atWar, isAlly, hasPact, overlordOf, opinion, hasTruce } from '/shared/sim/core.js';

const cache = new Map();
export function col(hex) {
  let c = cache.get(hex);
  if (!c) { c = new THREE.Color(hex); cache.set(hex, c); }
  return c;
}

const terrainCols = TERRAIN.map((t) => new THREE.Color(t.color));
const deep = new THREE.Color('#123256');
const shallow = new THREE.Color('#2a6390');
const tmp = new THREE.Color();
const tmp2 = new THREE.Color();

// Küçük, hücreye bağlı renk oynaması (doğal görünüm)
function jitter(i) {
  const h = Math.sin(i * 12.9898) * 43758.5453;
  return (h - Math.floor(h)) * 0.08 - 0.04;
}

export function waterColor(W, i, out) {
  out.copy(W.terrain[i] === T.okyanus ? deep : shallow);
  const j = jitter(i) * 0.5;
  out.r += j * 0.3; out.g += j * 0.5; out.b += j;
  return out;
}

export function terrainColor(W, i, out) {
  out.copy(terrainCols[W.terrain[i]]);
  const j = jitter(i);
  out.r += j; out.g += j; out.b += j;
  return out;
}

const DIP = {
  me: new THREE.Color('#e6c34a'),
  ally: new THREE.Color('#3f7fd6'),
  vassal: new THREE.Color('#7fb2ef'),
  overlord: new THREE.Color('#9b6bd6'),
  enemy: new THREE.Color('#d0392b'),
  truce: new THREE.Color('#d98a3a'),
  good: new THREE.Color('#5aa35a'),
  neutral: new THREE.Color('#9a9a8a'),
  bad: new THREE.Color('#a25a4a'),
  none: new THREE.Color('#6f6a5c'),
};

export function landColor(G, mode, me, i, out) {
  const W = G.world, s = G.state;
  const o = s.owner[i];
  terrainColor(W, i, out);
  if (W.terrain[i] === T.buzul) return out;
  if (mode === 'arazi') return out;
  if (mode === 'gelisim') {
    const d = s.dev[i];
    const t = Math.min(1, (d - 1) / 14);
    out.setRGB(0.25 + 0.7 * t, 0.2 + 0.55 * (1 - Math.abs(t - 0.5) * 2) + 0.2 * t, 0.15 + 0.1 * (1 - t));
    if (!o) out.multiplyScalar(0.55);
    return out;
  }
  if (!o) {
    // sahipsiz topraklar: soluk arazi
    const g = out.r * 0.3 + out.g * 0.59 + out.b * 0.11;
    out.setRGB(out.r * 0.72 + g * 0.28, out.g * 0.72 + g * 0.28, out.b * 0.72 + g * 0.28).multiplyScalar(0.8);
    return out;
  }
  const n = s.nations[o];
  if (mode === 'din') {
    tmp.set(RELIGIONS[n.religion]?.color || '#888888');
    return out.lerp(tmp, 0.82);
  }
  if (mode === 'diplomasi') {
    let c = DIP.neutral;
    if (!me || !s.nations[me]?.alive) c = DIP.neutral;
    else if (o === me) c = DIP.me;
    else if (atWar(G, me, o)) c = DIP.enemy;
    else if (overlordOf(G, o) === me) c = DIP.vassal;
    else if (overlordOf(G, me) === o) c = DIP.overlord;
    else if (isAlly(G, me, o)) c = DIP.ally;
    else if (hasTruce(G, me, o)) c = DIP.truce;
    else {
      const op = opinion(G, o, me);
      c = op > 25 ? DIP.good : op < -25 ? DIP.bad : DIP.neutral;
    }
    return out.lerp(c, 0.85);
  }
  // siyasi
  const nc = col(n.color);
  const lum = out.r * 0.3 + out.g * 0.59 + out.b * 0.11;
  out.copy(nc).multiplyScalar(0.78 + lum * 0.45);
  return out;
}

export function stripeColor(G, i, out) {
  const s = G.state;
  const o = s.owner[i], c = s.ctrl[i];
  if (!o || !c || o === c) return false;
  out.copy(col(s.nations[c]?.color || '#000000'));
  return true;
}

export function borderColor(hex, out) {
  return out.copy(col(hex)).multiplyScalar(0.55);
}

export { tmp2 };
