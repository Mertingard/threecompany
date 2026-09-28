// Oyun kuralları ve sabitler

export const START_YEAR = 1200;
export const MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
export const MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

// Oyun hızları: saniyedeki gün sayısı
export const SPEEDS = [0, 1, 3, 8, 20, 50];

export const REG_SIZE = 1000;

export const UNITS = {
  piyade: { ad: 'Piyade', atk: 1.0, def: 1.0, cost: 15, maint: 0.3, speed: 1.0, siege: 0, days: 30, desc: 'Ucuz ve dayanıklı mızraklı piyade.' },
  okcu: { ad: 'Okçu', atk: 1.3, def: 0.8, cost: 20, maint: 0.36, speed: 1.0, siege: 0, days: 30, desc: 'Uzaktan yüksek hasar, savunması zayıf.' },
  suvari: { ad: 'Süvari', atk: 1.7, def: 1.0, cost: 35, maint: 0.6, speed: 1.35, siege: 0, days: 45, desc: 'Hızlı ve güçlü hafif süvari.' },
  sovalye: { ad: 'Şövalye', atk: 2.6, def: 1.8, cost: 60, maint: 0.95, speed: 1.15, siege: 0, days: 60, tech: 'agir_suvari', desc: 'Zırhlı ağır süvari; savaş alanının hakimi.' },
  mancinik: { ad: 'Mancınık', atk: 0.4, def: 0.4, cost: 40, maint: 0.55, speed: 0.8, siege: 1, days: 60, tech: 'mancinik', desc: 'Kuşatmaları hızlandırır.' },
  arkebuz: { ad: 'Arkebüzcü', atk: 2.4, def: 1.6, cost: 40, maint: 0.55, speed: 1.0, siege: 0, days: 45, tech: 'arkebuz', desc: 'Barutlu ateşli silah piyadesi.' },
  top: { ad: 'Top', atk: 1.8, def: 0.6, cost: 70, maint: 0.9, speed: 0.8, siege: 2.5, days: 60, tech: 'top', desc: 'Surları yıkan bronz toplar.' },
};

export const BUILDINGS = {
  ciftlik: { bit: 0, ad: 'Çiftlik', cost: 30, days: 120, desc: '+%50 vergi, +%25 insan gücü' },
  pazar: { bit: 1, ad: 'Pazar', cost: 40, days: 150, desc: '+%100 ticaret geliri' },
  kisla: { bit: 2, ad: 'Kışla', cost: 35, days: 120, desc: '+%50 insan gücü, birlikler %30 daha hızlı toplanır' },
  manastir: { bit: 3, ad: 'Manastır', cost: 40, days: 180, desc: '+0.4 bilim/ay' },
  liman: { bit: 4, ad: 'Liman', cost: 50, days: 180, coastal: true, desc: '+%60 ticaret, gemilere binmek daha hızlı' },
  atolye: { bit: 5, ad: 'Atölye', cost: 70, days: 240, tech: 'loncalar', desc: '+%60 vergi' },
  universite: { bit: 6, ad: 'Üniversite', cost: 120, days: 365, tech: 'universite', desc: '+1.2 bilim/ay' },
};
export const FORT_COST = 60; // seviye başına
export const FORT_DAYS = 240;
export const FORT_MAINT = 0.25;

export const RELIGIONS = {
  katolik: { ad: 'Katolik', grup: 'hristiyan', color: '#d9c36a' },
  ortodoks: { ad: 'Ortodoks', grup: 'hristiyan', color: '#9cc3e8' },
  kopt: { ad: 'Doğu Hristiyanlığı', grup: 'hristiyan', color: '#b894d8' },
  sunni: { ad: 'Sünni İslam', grup: 'islam', color: '#3f9d4b' },
  sii: { ad: 'Şii İslam', grup: 'islam', color: '#1f6b3a' },
  tengri: { ad: 'Gök Tanrı', grup: 'pagan', color: '#6ab0d8' },
  budist: { ad: 'Budizm', grup: 'dogu', color: '#e8a33c' },
  konfucyus: { ad: 'Konfüçyüsçülük', grup: 'dogu', color: '#c94f6c' },
  sinto: { ad: 'Şinto', grup: 'dogu', color: '#e38fb5' },
  hindu: { ad: 'Hinduizm', grup: 'dharmik', color: '#e0735a' },
  yerli: { ad: 'Yerli İnançlar', grup: 'pagan', color: '#8a6a4a' },
};

export const GOVS = {
  krallik: { ad: 'Krallık', hukumdar: 'Kral', fx: { tax: 0.05 } },
  imparatorluk: { ad: 'İmparatorluk', hukumdar: 'İmparator', fx: { fl: 3 } },
  sultanlik: { ad: 'Sultanlık', hukumdar: 'Sultan', fx: { mp: 0.1 } },
  halifelik: { ad: 'Halifelik', hukumdar: 'Halife', fx: { rp: 0.1 } },
  cumhuriyet: { ad: 'Cumhuriyet', hukumdar: 'Doç', fx: { trade: 0.25 } },
  hanlik: { ad: 'Hanlık', hukumdar: 'Han', fx: { speed: 0.1, cavCost: -0.3 } },
  kabile: { ad: 'Kabile Birliği', hukumdar: 'Şef', fx: { mp: 0.25, tax: -0.1 } },
  sogunluk: { ad: 'Şogunluk', hukumdar: 'Şogun', fx: { morale: 0.25 } },
  papalik: { ad: 'Papalık', hukumdar: 'Papa', fx: { rp: 0.15 } },
  dukluk: { ad: 'Düklük', hukumdar: 'Dük', fx: { tax: 0.05 } },
  beylik: { ad: 'Beylik', hukumdar: 'Bey', fx: { mp: 0.1, colonies: 1 } },
  knezlik: { ad: 'Knezlik', hukumdar: 'Knez', fx: { mp: 0.1 } },
  racalik: { ad: 'Racalık', hukumdar: 'Raca', fx: { tax: 0.1 } },
};

export const PACT_TYPES = {
  ittifak: { ad: 'İttifak' },
  ticaret: { ad: 'Ticaret Anlaşması' },
  saldirmazlik: { ad: 'Saldırmazlık Paktı', years: 10 },
  evlilik: { ad: 'Hanedan Evliliği' },
  gecis: { ad: 'Askeri Geçiş Hakkı' },
  vasal: { ad: 'Vasallık' },
};

export const TRUCE_DAYS = 365 * 5;
export const BASE_MORALE = 2.5;
export const MAX_DEV = 20;
