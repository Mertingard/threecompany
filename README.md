# Orta Çağ İmparatorlukları

Three.js ile yapılmış, **3D dünya küresi** üzerinde oynanan **gerçek zamanlı orta çağ büyük strateji oyunu**. Yıl 1200: tarihi bir devleti yönet ya da haritada istediğin yere kendi ülkeni kur; sınırlarını büyüt, teknoloji geliştir, ordular topla, diplomasi yap. Amaç hayatta kalmak ya da diğer ülkeleri tarih sahnesinden silmek. Tek oyunculu (yapay zekâya karşı) veya çok oyunculu (aynı sunucuda en fazla 8 kişi) oynanabilir.

## Kurulum ve çalıştırma

Gereksinim: Node.js 18 veya üzeri.

```bash
npm install
npm start
```

Tarayıcıda **http://localhost:3000** adresini aç. Tek oyunculu mod tamamen tarayıcıda çalışır; çok oyunculu mod aynı sunucuyu kullanır. Arkadaşlarınla oynamak için sunucuyu onların erişebileceği bir makinede çalıştır (`PORT` ortam değişkeniyle portu değiştirebilirsin) ve oda kodunu paylaş.

> Dosyayı doğrudan (`file://`) açmak çalışmaz; oyun `npm start` ile başlatılan sunucu üzerinden açılmalıdır.

## Özellikler

**Harita**
- Natural Earth verisinden üretilmiş gerçek dünya kıyıları; ~16.000 altıgen hücreli küre (Goldberg çokyüzlüsü, 12 beşgen okyanuslara yerleştirildi)
- Arazi tipleri: ova, orman, tayga, tepe, dağ, çöl, bozkır, tundra, cangıl, bataklık, buzul — hareket hızını, savunmayı ve yıpranmayı etkiler
- 34 büyük nehir, 260 tarihi şehir, kültürlere göre üretilmiş bölge adları, deniz adları
- Harita modları: siyasi, arazi, diplomatik, gelişmişlik, din
- Kavisli ülke adları, iki renkli sınırlar, işgal edilen bölgelerde çizgili desen, atmosfer ve animasyonlu okyanus

**Başlangıç**
- 1200 yılının ~75 devleti: Bizans, Anadolu Selçukluları, Kutsal Roma, Fransa, Eyyubiler, Harezmşahlar, Moğollar, Song, Jin, Khmer, Mali, İnka ve daha fazlası
- Bazı devletlerin tarihi bonusları (ör. Moğollar: *Cihan Fatihi*, Venedik: *Denizlerin Kraliçesi*)
- **Yeni ülke kur**: ad, renk, din, yönetim biçimi seç; haritada başkentini belirle

**Ekonomi ve gelişim**
- Vergi, ticaret (nehir ve kıyı bonusları), insan gücü, bilim
- Binalar: çiftlik, pazar, kışla, manastır, liman, atölye, üniversite, 3 seviyeli kale
- Bölge geliştirme, sahipsiz topraklara yerleşim kurma veya ordu ile yerli kabileleri fethetme
- 28 teknolojilik ağaç (yönetim, askeri, bilim); komşuların bildiği teknolojiler ucuzlar

**Askeri**
- Birlikler: piyade, okçu, süvari, şövalye, mancınık, arkebüzcü, top
- Gerçek zamanlı hareket ve yol bulma (deniz yoluyla da; açık okyanus için Karavel gerekir)
- Zar, arazi, nehir, kale, moral ve teknolojiye dayalı muharebeler; geri çekilme ve ordunun yok olması
- Kalesiz bölgelerin işgali ve kalelerin kuşatılması, yıpranma, takviye, ordu sınırı

**Diplomasi**
- İttifak, ticaret anlaşması, saldırmazlık paktı, hanedan evliliği, askeri geçiş hakkı, vasallık talebi, hediye, hakaret
- Yapay zekânın kararını önceden gösteren gerekçeli kabul/ret tahmini
- Savaş ilanı ve müttefik çağrıları, savaş skoru, işgal edilen bölgeleri/tazminatı/vasallığı içeren barış antlaşmaları, beyaz barış, ateşkes
- Kötü şöhret, savaş yorgunluğu, vasal entegrasyonu ve bağımsızlık savaşları

**Olaylar**
- Seçimli rastgele olaylar (bereketli hasat, salgın, gezgin bilgin, köylü ayaklanması, maden, yangın, turnuva…)
- 1346'da Kırım'dan başlayıp ticaret yollarıyla yayılan **Kara Ölüm**

**Zafer**
- Seçilen bitiş yılına (1300–1600) kadar hayatta kal; en yüksek puanlı oyuncu kazanır
- Tüm ülkeleri yok et (fetih), dünya gelişmişliğinin %35'ini kontrol et (hegemonya) veya son kalan oyuncu ol

**Çok oyunculu**
- Oda kodu ile katılma, lobide ülke seçimi (tarihi veya yeni), hazır olma, sohbet
- Sunucu-otoriter simülasyon; istemcilere sıkıştırılmış durum farkları gönderilir
- Bağlantı koparsa aynı tarayıcıdan "Son odaya yeniden bağlan" ile kaldığın yerden devam

**Diğer**
- Tek oyunculuda 3 kayıt yuvası + yıllık otomatik kayıt, kayıt dosyası indirme/yükleme
- Tamamen Türkçe arayüz

## Kontroller

| Eylem | Kontrol |
| --- | --- |
| Küreyi döndür / yakınlaş | Sol tık sürükle / fare tekerleği |
| Bölge veya ordu seç | Sol tık (aynı bölgeye ikinci tık: ordu yerine bölge) |
| Orduyu hareket ettir, saldır, kuşat | Sağ tık |
| Seçime ordu ekle | Shift + tık |
| Duraklat / hız | Boşluk / 1–5 |
| Seçimi kaldır / menü | Esc |
| Teknoloji, Diplomasi, Savaşlar, Ordular, Ekonomi, Sıralama, Yardım | T, D, W, A, E, R, H |
| Harita modu: siyasi / din / siyasi↔arazi | Q / Y / M |
| Başkente git / ülke adları | F / L |

## Mimari

```
shared/            Tarayıcı ve sunucunun ortak kodu (saf JavaScript ES modülleri)
  geodesic.js        Goldberg çokyüzlüsü (altıgen küre) üretimi
  world.js           Statik dünya: komşuluklar, arazi, adlar
  sync.js            Çok oyunculu durum farkı (diff/apply)
  data/              Arazi, birlik, bina, din, yönetim, teknoloji ve 1200 devletleri
  sim/               Simülasyon: ekonomi, ordu/muharebe/kuşatma, diplomasi, yapay zekâ, olaylar, oyun döngüsü
server/            HTTP statik sunucu + WebSocket oda sistemi (ws)
public/            İstemci: Three.js render, arayüz, yerel/uzak oyun bağlantısı
  data/world.json    Üretilmiş harita verisi
scripts/
  build-world.js     Harita verisini Natural Earth'ten üretir
  geo-data.js        Dağlar, çöller, bozkırlar, şehirler, nehirler, denizler, kültürler
  sim-test.js        Başsız yapay zekâ simülasyon testi
```

Simülasyon günlük adımlarla ilerler (hız 1'de saniyede 1 gün, hız 5'te 50 gün). Tek oyunculuda simülasyon tarayıcıda, çok oyunculuda sunucuda çalışır; her iki durumda da aynı `shared/sim` kodu kullanılır.

## Geliştirme

```bash
npm test                 # yapay zekâlar kendi aralarında 30 yıl oynar (ör. node scripts/sim-test.js 100)
npm run build:world      # public/data/world.json dosyasını yeniden üretir (geliştirme bağımlılıkları gerekir)
```

Harita verisi: [Natural Earth](https://www.naturalearthdata.com/) (world-atlas paketi, kamu malı). Yazı tipleri: Google Fonts (Cinzel, Alegreya); çevrimdışı ortamda sistem serif yazı tipine düşer.
