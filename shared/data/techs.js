// Teknoloji ağacı. cat: yonetim | askeri | bilim
// fx anahtarları: tax, trade, mp, rp, fl (ordu sınırı), atk, def, morale, siege, colonies,
// colonyCost, colonyTime, seaSpeed, ocean, fortMax, devGrowth, infamyDecay, we, unitAtk
export const TECHS = [
  // ---- 1. kademe
  { id: 'uc_tarla', ad: 'Üç Tarla Sistemi', cat: 'yonetim', tier: 1, cost: 200, req: [], fx: { tax: 0.1, mp: 0.1 }, desc: 'Nadasa bırakılan tarlalar döndürülür; hasat ve nüfus artar.' },
  { id: 'feodal', ad: 'Feodal Yükümlülük', cat: 'askeri', tier: 1, cost: 200, req: [], fx: { fl: 3, mp: 0.1 }, desc: 'Vasallar lordlarına asker göndermek zorundadır.' },
  { id: 'katiplik', ad: 'Kâtiplik', cat: 'bilim', tier: 1, cost: 200, req: [], fx: { rp: 0.15 }, desc: 'Yazılı kayıtlar ve saray kâtipleri bilgiyi korur.' },
  { id: 'kiyi', ad: 'Kıyı Denizciliği', cat: 'bilim', tier: 1, cost: 200, req: [], fx: { seaSpeed: 0.2, colonies: 1 }, desc: 'Kıyı boyunca daha hızlı ve güvenli seferler.' },
  // ---- 2. kademe
  { id: 'su_degirmeni', ad: 'Su Değirmeni', cat: 'yonetim', tier: 2, cost: 420, req: ['uc_tarla'], fx: { tax: 0.1 }, desc: 'Nehirlerin gücü un ve kumaş üretiminde kullanılır.' },
  { id: 'uzun_yay', ad: 'Uzun Yay', cat: 'askeri', tier: 2, cost: 420, req: ['feodal'], fx: { unitAtk: { okcu: 0.35 } }, desc: 'Okçuların menzili ve delici gücü artar.' },
  { id: 'zincir_zirh', ad: 'Zincir Zırh', cat: 'askeri', tier: 2, cost: 420, req: ['feodal'], fx: { def: 0.1 }, desc: 'Halkalı zırh askerlerin hayatta kalmasını sağlar.' },
  { id: 'mancinik', ad: 'Karşı Ağırlıklı Mancınık', cat: 'askeri', tier: 2, cost: 420, req: ['feodal'], fx: { siege: 0.15 }, unlock: ['mancinik'], desc: 'Mancınık birliklerini açar; kuşatmalar hızlanır.' },
  { id: 'pusula', ad: 'Pusula', cat: 'bilim', tier: 2, cost: 420, req: ['kiyi'], fx: { seaSpeed: 0.25 }, desc: 'Denizciler bulutlu havalarda bile yön bulabilir.' },
  { id: 'tas_kale', ad: 'Taş Kale Mimarisi', cat: 'askeri', tier: 2, cost: 420, req: ['feodal'], fx: { fortMax: 2 }, desc: '2. seviye kaleler inşa edilebilir.' },
  // ---- 3. kademe
  { id: 'agir_suvari', ad: 'Ağır Süvari', cat: 'askeri', tier: 3, cost: 750, req: ['zincir_zirh'], fx: {}, unlock: ['sovalye'], desc: 'Zırhlı şövalye birliklerini açar.' },
  { id: 'loncalar', ad: 'Loncalar', cat: 'yonetim', tier: 3, cost: 750, req: ['su_degirmeni'], fx: { trade: 0.15 }, build: ['atolye'], desc: 'Zanaatkârlar örgütlenir; Atölye binasını açar.' },
  { id: 'universite', ad: 'Üniversiteler', cat: 'bilim', tier: 3, cost: 750, req: ['katiplik'], fx: { rp: 0.1 }, build: ['universite'], desc: 'Üniversite binasını açar.' },
  { id: 'hanedan', ad: 'Hanedan Diplomasisi', cat: 'yonetim', tier: 3, cost: 750, req: ['katiplik'], fx: { infamyDecay: 0.5, relations: 10 }, desc: 'Elçiler ve evlilikler; kötü şöhret daha hızlı unutulur.' },
  { id: 'disiplin', ad: 'Askeri Disiplin', cat: 'askeri', tier: 3, cost: 750, req: ['zincir_zirh'], fx: { morale: 0.5 }, desc: 'Talimli birlikler savaşta dağılmaz.' },
  // ---- 4. kademe
  { id: 'bankacilik', ad: 'Bankacılık', cat: 'yonetim', tier: 4, cost: 1150, req: ['loncalar'], fx: { tax: 0.1, trade: 0.15 }, desc: 'Kredi mektupları ve bankalar ticareti canlandırır.' },
  { id: 'merkezi', ad: 'Merkezi Yönetim', cat: 'yonetim', tier: 4, cost: 1150, req: ['hanedan'], fx: { tax: 0.1, fl: 3, we: -0.25 }, desc: 'Güçlü bürokrasi; savaş yorgunluğu azalır.' },
  { id: 'barut', ad: 'Barut', cat: 'askeri', tier: 4, cost: 1150, req: ['mancinik', 'katiplik'], fx: { atk: 0.1, siege: 0.25 }, desc: 'Doğudan gelen kara barut savaşı değiştirir.' },
  { id: 'karavel', ad: 'Karavel', cat: 'bilim', tier: 4, cost: 1150, req: ['pusula'], fx: { ocean: 1, seaSpeed: 0.25, colonies: 1 }, desc: 'Açık okyanusu geçebilen gemiler. Okyanus hücreleri açılır.' },
  { id: 'profesyonel', ad: 'Profesyonel Ordu', cat: 'askeri', tier: 4, cost: 1150, req: ['disiplin'], fx: { fl: 4, mp: 0.15 }, desc: 'Paralı ve daimi birlikler ordunun belkemiği olur.' },
  // ---- 5. kademe
  { id: 'top', ad: 'Top Dökümü', cat: 'askeri', tier: 5, cost: 1600, req: ['barut'], fx: { siege: 0.3 }, unlock: ['top'], desc: 'Top birliklerini açar.' },
  { id: 'arkebuz', ad: 'Arkebüz', cat: 'askeri', tier: 5, cost: 1600, req: ['barut'], fx: {}, unlock: ['arkebuz'], desc: 'Arkebüzcü birliklerini açar.' },
  { id: 'matbaa', ad: 'Matbaa', cat: 'bilim', tier: 5, cost: 1600, req: ['universite'], fx: { rp: 0.25 }, desc: 'Kitaplar çoğalır, bilgi hızla yayılır.' },
  { id: 'okyanus', ad: 'Okyanus Seferleri', cat: 'bilim', tier: 5, cost: 1600, req: ['karavel'], fx: { colonies: 1, colonyCost: -0.3, colonyTime: -0.3 }, desc: 'Uzak diyarlara koloni gönderimi ucuzlar.' },
  // ---- 6. kademe
  { id: 'yildiz_kale', ad: 'Yıldız Kale', cat: 'askeri', tier: 6, cost: 2200, req: ['top'], fx: { fortMax: 3, def: 0.1 }, desc: '3. seviye kaleler; toplara dayanıklı burçlar.' },
  { id: 'ronesans', ad: 'Rönesans', cat: 'bilim', tier: 6, cost: 2200, req: ['matbaa', 'bankacilik'], fx: { tax: 0.1, rp: 0.2, devGrowth: 1 }, desc: 'Sanat ve bilimde yeniden doğuş.' },
  { id: 'tercio', ad: 'Mızrak ve Tüfek', cat: 'askeri', tier: 6, cost: 2200, req: ['arkebuz', 'profesyonel'], fx: { atk: 0.15, def: 0.15 }, desc: 'Karma piyade düzeni; modern savaşın başlangıcı.' },
  { id: 'mutlak', ad: 'Mutlak Monarşi', cat: 'yonetim', tier: 6, cost: 2200, req: ['merkezi', 'bankacilik'], fx: { fl: 5, tax: 0.1 }, desc: 'Tüm güç hükümdarın elinde toplanır.' },
];

export const TECH_MAP = Object.fromEntries(TECHS.map((t) => [t.id, t]));
export const TECH_CATS = { yonetim: 'Yönetim ve Ekonomi', askeri: 'Askeri', bilim: 'Bilim ve Keşif' };
