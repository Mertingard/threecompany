// Goldberg çokyüzlüsü (altıgen küre) üretimi.
// İkosahedron f frekansıyla bölünür; her tepe noktası bir hücre olur (10f²+2 hücre,
// 12'si beşgen, geri kalanı altıgen). Tarayıcı ve sunucu aynı kodu kullandığı için
// hücre numaraları her iki tarafta da birebir aynıdır.

function norm(v) {
  const l = Math.hypot(v[0], v[1], v[2]);
  return [v[0] / l, v[1] / l, v[2] / l];
}

function slerp(a, b, t) {
  const d = Math.min(1, Math.max(-1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]));
  const om = Math.acos(d);
  if (om < 1e-9) return a.slice();
  const s = Math.sin(om);
  const ka = Math.sin((1 - t) * om) / s;
  const kb = Math.sin(t * om) / s;
  return norm([a[0] * ka + b[0] * kb, a[1] * ka + b[1] * kb, a[2] * ka + b[2] * kb]);
}

function rotate(v, q) {
  // q = [x, y, z, w]
  const [x, y, z] = v;
  const [qx, qy, qz, qw] = q;
  const ix = qw * x + qy * z - qz * y;
  const iy = qw * y + qz * x - qx * z;
  const iz = qw * z + qx * y - qy * x;
  const iw = -qx * x - qy * y - qz * z;
  return [
    ix * qw + iw * -qx + iy * -qz - iz * -qy,
    iy * qw + iw * -qy + iz * -qx - ix * -qz,
    iz * qw + iw * -qz + ix * -qy - iy * -qx,
  ];
}

export function latLonToVec(lat, lon) {
  const la = (lat * Math.PI) / 180;
  const lo = (lon * Math.PI) / 180;
  return [Math.cos(la) * Math.sin(lo), Math.sin(la), Math.cos(la) * Math.cos(lo)];
}

export function vecToLatLon(v) {
  const lat = (Math.asin(Math.max(-1, Math.min(1, v[1]))) * 180) / Math.PI;
  const lon = (Math.atan2(v[0], v[2]) * 180) / Math.PI;
  return [lat, lon];
}

export function icosahedronVertices(rot) {
  const t = (1 + Math.sqrt(5)) / 2;
  const base = [
    [-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0],
    [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t],
    [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1],
  ];
  return base.map((v) => {
    const n = norm(v);
    return rot ? norm(rotate(n, rot)) : n;
  });
}

const FACES = [
  [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
  [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
  [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
  [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
];

/**
 * @param {number} f bölme frekansı
 * @param {number[]|null} rot dönüş kuaterniyonu [x,y,z,w]
 */
export function buildGrid(f, rot = null) {
  const P = icosahedronVertices(rot); // tepe noktaları (hücre merkezleri)
  const edgeMap = new Map();

  function edgeKey(a, b) {
    return a < b ? a * 16 + b : b * 16 + a;
  }
  for (const [a, b, c] of FACES) {
    for (const [u, v] of [[a, b], [b, c], [a, c]]) {
      const lo = Math.min(u, v), hi = Math.max(u, v);
      const key = edgeKey(lo, hi);
      if (edgeMap.has(key)) continue;
      const ids = [];
      for (let k = 1; k < f; k++) {
        ids.push(P.length);
        P.push(slerp(P[lo], P[hi], k / f));
      }
      edgeMap.set(key, ids);
    }
  }
  function edgeVert(u, v, k) {
    const ids = edgeMap.get(edgeKey(u, v));
    return u < v ? ids[k - 1] : ids[f - k - 1];
  }

  const tris = [];
  for (const [a, b, c] of FACES) {
    const inner = new Map();
    const vid = (i, j) => {
      if (i === 0 && j === 0) return a;
      if (i === f && j === 0) return b;
      if (i === 0 && j === f) return c;
      if (j === 0) return edgeVert(a, b, i);
      if (i === 0) return edgeVert(a, c, j);
      if (i + j === f) return edgeVert(b, c, j);
      const key = i * (f + 1) + j;
      let id = inner.get(key);
      if (id === undefined) {
        const r = i + j;
        const pab = slerp(P[a], P[b], r / f);
        const pac = slerp(P[a], P[c], r / f);
        id = P.length;
        P.push(slerp(pab, pac, j / r));
        inner.set(key, id);
      }
      return id;
    };
    for (let i = 0; i < f; i++) {
      for (let j = 0; j < f - i; j++) {
        tris.push([vid(i, j), vid(i + 1, j), vid(i, j + 1)]);
        if (i + j < f - 1) tris.push([vid(i + 1, j), vid(i + 1, j + 1), vid(i, j + 1)]);
      }
    }
  }

  const N = P.length;
  const T = tris.length;
  const triCenter = new Float32Array(T * 3);
  const incident = Array.from({ length: N }, () => []);
  for (let t = 0; t < T; t++) {
    const [a, b, c] = tris[t];
    const cc = norm([
      P[a][0] + P[b][0] + P[c][0],
      P[a][1] + P[b][1] + P[c][1],
      P[a][2] + P[b][2] + P[c][2],
    ]);
    triCenter[t * 3] = cc[0];
    triCenter[t * 3 + 1] = cc[1];
    triCenter[t * 3 + 2] = cc[2];
    incident[a].push(t);
    incident[b].push(t);
    incident[c].push(t);
  }

  const center = new Float32Array(N * 3);
  const cellStart = new Int32Array(N + 1);
  let total = 0;
  for (let v = 0; v < N; v++) {
    cellStart[v] = total;
    total += incident[v].length;
  }
  cellStart[N] = total;
  const cellTris = new Int32Array(total);
  const neighbors = new Int32Array(total);

  for (let v = 0; v < N; v++) {
    const n = P[v];
    center[v * 3] = n[0];
    center[v * 3 + 1] = n[1];
    center[v * 3 + 2] = n[2];
    // teğet düzlem tabanı
    let ref = Math.abs(n[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
    let u = norm([n[1] * ref[2] - n[2] * ref[1], n[2] * ref[0] - n[0] * ref[2], n[0] * ref[1] - n[1] * ref[0]]);
    const w = [n[1] * u[2] - n[2] * u[1], n[2] * u[0] - n[0] * u[2], n[0] * u[1] - n[1] * u[0]];
    const list = incident[v].map((t) => {
      const d = [triCenter[t * 3] - n[0], triCenter[t * 3 + 1] - n[1], triCenter[t * 3 + 2] - n[2]];
      return { t, ang: Math.atan2(d[0] * w[0] + d[1] * w[1] + d[2] * w[2], d[0] * u[0] + d[1] * u[1] + d[2] * u[2]) };
    });
    list.sort((p, q) => p.ang - q.ang);
    const s = cellStart[v];
    const k = list.length;
    for (let i = 0; i < k; i++) cellTris[s + i] = list[i].t;
    for (let i = 0; i < k; i++) {
      const t1 = tris[list[i].t];
      const t2 = tris[list[(i + 1) % k].t];
      let nb = -1;
      for (const x of t1) if (x !== v && t2.includes(x)) nb = x;
      neighbors[s + i] = nb;
    }
  }

  return { f, count: N, center, triCenter, cellStart, cellTris, neighbors };
}
