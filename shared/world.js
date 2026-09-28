// Statik dünya: ızgara + arazi verisi. Oyun durumu (state) burada tutulmaz.
import { buildGrid, vecToLatLon } from './geodesic.js';
import { TERRAIN, T } from './data/terrain.js';

export function createWorld(data) {
  const grid = buildGrid(data.f, data.rot);
  const N = grid.count;
  const terrain = Uint8Array.from(data.terrain);
  const baseDev = Uint8Array.from(data.dev);
  const river = new Uint8Array(N);
  const city = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    river[i] = data.river.charCodeAt(i) - 48;
    city[i] = data.city.charCodeAt(i) - 48;
  }
  const nbr = [];
  for (let i = 0; i < N; i++) nbr.push(grid.neighbors.subarray(grid.cellStart[i], grid.cellStart[i + 1]));

  const lat = new Float32Array(N), lon = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const [la, lo] = vecToLatLon([grid.center[i * 3], grid.center[i * 3 + 1], grid.center[i * 3 + 2]]);
    lat[i] = la;
    lon[i] = lo;
  }

  const isWater = (i) => terrain[i] <= 1;
  const isLand = (i) => terrain[i] > 1;
  const isOwnable = (i) => terrain[i] > 1 && terrain[i] !== T.buzul;
  const coastal = new Uint8Array(N);
  const landCells = [];
  for (let i = 0; i < N; i++) {
    if (!isLand(i)) continue;
    landCells.push(i);
    for (const n of nbr[i]) if (isWater(n)) { coastal[i] = 1; break; }
  }

  // ortalama hücre açısı (A* sezgiseli için)
  let tot = 0;
  for (let k = 0; k < 200; k++) {
    const a = k * 37, b = nbr[a][0];
    tot += Math.acos(Math.min(1, grid.center[a * 3] * grid.center[b * 3] + grid.center[a * 3 + 1] * grid.center[b * 3 + 1] + grid.center[a * 3 + 2] * grid.center[b * 3 + 2]));
  }
  const stepAngle = tot / 200;

  function angle(a, b) {
    const d = grid.center[a * 3] * grid.center[b * 3] + grid.center[a * 3 + 1] * grid.center[b * 3 + 1] + grid.center[a * 3 + 2] * grid.center[b * 3 + 2];
    return Math.acos(Math.max(-1, Math.min(1, d)));
  }

  function cellName(i) {
    if (isLand(i)) return data.name[i];
    return data.seas[data.sea[i]] || 'Deniz';
  }

  return {
    N, grid, terrain, baseDev, river, city, nbr, lat, lon, coastal, landCells, stepAngle,
    culture: Int16Array.from(data.culture), sea: Int16Array.from(data.sea),
    names: data.name, cultures: data.cultures, seas: data.seas, rivers: data.rivers,
    isWater, isLand, isOwnable, angle, cellName,
    terrainOf: (i) => TERRAIN[terrain[i]],
    isDeep: (i) => terrain[i] === T.okyanus,
  };
}
