// Arazi tipleri. Dizideki sıra, world.json içindeki arazi kodudur.
// move: bir hücreyi geçme süresi çarpanı, def: savunana zar bonusu,
// dev: taban gelişmişlik, attr: aylık yıpranma (%), h: yükseklik
export const TERRAIN = [
  { id: 'okyanus', ad: 'Açık Okyanus', water: true, deep: true, color: '#17385c', move: 0.45, def: 0, dev: 0, h: 0 },
  { id: 'deniz', ad: 'Kıyı Denizi', water: true, color: '#25557f', move: 0.45, def: 0, dev: 0, h: 0 },
  { id: 'ova', ad: 'Ova', color: '#8fae55', move: 1.0, def: 0, dev: 3, attr: 0, h: 0.008 },
  { id: 'orman', ad: 'Orman', color: '#4f7d3b', move: 1.3, def: 1, dev: 2, attr: 0, h: 0.009 },
  { id: 'tepe', ad: 'Tepelik', color: '#a39456', move: 1.4, def: 1, dev: 2, attr: 0, h: 0.013 },
  { id: 'dag', ad: 'Dağlık', color: '#857a6c', move: 2.0, def: 2, dev: 1, attr: 1, h: 0.022 },
  { id: 'col', ad: 'Çöl', color: '#d9c088', move: 1.5, def: 0, dev: 1, attr: 2, h: 0.008 },
  { id: 'bozkir', ad: 'Bozkır', color: '#bfb06a', move: 0.9, def: 0, dev: 2, attr: 0, h: 0.008 },
  { id: 'tundra', ad: 'Tundra', color: '#97a08e', move: 1.3, def: 0, dev: 1, attr: 2, h: 0.009 },
  { id: 'cangil', ad: 'Cangıl', color: '#2e6a33', move: 1.8, def: 1, dev: 1, attr: 2, h: 0.009 },
  { id: 'bataklik', ad: 'Bataklık', color: '#5a7a5c', move: 1.7, def: 1, dev: 1, attr: 1, h: 0.007 },
  { id: 'buzul', ad: 'Buzul', color: '#e6edf2', impassable: true, dev: 0, h: 0.016 },
  { id: 'tayga', ad: 'Tayga', color: '#3f6148', move: 1.4, def: 1, dev: 1, attr: 1, h: 0.009 },
];

export const T = Object.fromEntries(TERRAIN.map((t, i) => [t.id, i]));
