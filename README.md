# Novera: Kayıp Adalar

Tarayıcıda oynanan, gerçek 3D (Three.js) bir **ada hayatta kalma** oyunu. Gemi kazasından sağ kurtulan oyuncu, bilinmeyen bir adada sıfırdan başlar: kaynak toplar, alet üretir, ateş yakar, barınak kurar, adayı keşfeder ve "bu adada benden önce kim vardı?" sorusunun peşine düşer.

Bu sürüm **MVP / Bölüm 1**'dir: baştan sona oynanabilir bir öğretici + hikâye zinciri içerir ve sonraki sistemler (savaş, düşmanlar, madencilik, tekneler, yeni adalar…) için modüler bir temel sunar.

---

## Çalıştırma

Gereksinim: [Node.js](https://nodejs.org) 18+ (geliştirme için). Oyuncu için kurulum gerekmez.

```bash
npm install      # bağımlılıklar (three, vite)
npm run dev      # geliştirme sunucusu → http://localhost:5173
npm run build    # dist/index.html üretir
```

`npm run build` çıktısı **tek bir HTML dosyasıdır** (tüm kod ve stiller gömülü). `dist/index.html` dosyasını çift tıklayarak internet ya da kurulum olmadan herhangi bir modern tarayıcıda (Chrome, Edge, Firefox) oynayabilirsin. İlerleme tarayıcının yerel deposuna (localStorage) kaydedilir.

### GitHub Pages'te yayınlama

Repoda `.github/workflows/deploy.yml` hazır: `main` dalına her gönderimde oyun derlenip GitHub Pages'e yüklenir. Repo ayarlarında bir kez **Settings → Pages → Build and deployment → Source: GitHub Actions** seçmek yeterli. Oyun `https://<kullanıcı-adı>.github.io/<repo-adı>/` adresinde yayınlanır.

## Kontroller

| Tuş | Eylem |
| --- | --- |
| **W A S D** | Hareket |
| **Fare** | Bakış (oyuna tıklayınca imleç kilitlenir; kilit yoksa basılı tutup sürükle) |
| **V** | 1. şahıs (gözden) ↔ 3. şahıs kamera |
| **Fare tekerleği** | 3. şahısta kamerayı yakınlaştır/uzaklaştır |
| **Sol tık / E** | Etkileşim, topla, vur (basılı tutunca devam eder) |
| **Sağ tık** | Seçili eşyayı kullan (yiyecek ye) · inşa modunda iptal |
| **Shift** | Koş · **Boşluk** Zıpla |
| **1–5** | Hızlı slot seç |
| **I / Tab** | Envanter |
| **C** | Üretim |
| **B** | İnşa (R: döndür) |
| **J** | Günlük (görevler + bulunan notlar) |
| **M** | Harita (keşfettikçe açılır) |
| **K** | Yetenekler |
| **T** | Teknoloji ağacı |
| **Esc** | Menü / paneli kapat |

Tüm tuşlar **Ayarlar → Kontroller** bölümünden değiştirilebilir. Sistemler oyunun başında kilitlidir; görevler ilerledikçe açılır (ör. Üretim, ilk odunları toplayınca gelir).

## MVP'de neler var?

- **3D ada**: sahil, çayırlar, sık orman, ~150 m yüksekliğinde kayalık bir dağ (iki yan zirveyle), tatlı su gölü; stilize su (derinliğe göre renk, kıyı köpüğü, dalgalar), sürüklenen bulutlar, ufukta henüz ulaşılamayan adalar (volkan, buz, çöl).
- **Ölçek**: her şey 1.8 m boyundaki karaktere göre: palmiyeler 9–11 m, orman ağaçları 8–10 m, çamlar 11–14 m, dev kayalar 3–6 m.
- **Doğa**: oyuncunun çevresinde rüzgârda dalgalanan, yürürken kenara eğilen sık çimen ve çiçekler; büyük kayalar, kayalık sivri çıkıntılar, eğrelti otları, çalılar, devrik kütükler, kütükler, mantarlar, deniz kabukları, göl kıyısında sazlar.
- **Oyuncu**: varsayılan **1. şahıs** (gözden) kamera, elde alet ve kol animasyonları (vurma, toplama, yeme), yürürken hafif baş sallanması; istenirse **V** ile 3. şahıs kamera (araziye/yapılara çarpmaz, aradaki ağaçlar şeffaflaşır).
- **Düşme hasarı**: ~4.5 m'den yüksek düşüşler can yakar (~18 m ölümcül); suya düşmek can yakmaz.
- **Kaynaklar**: palmiye, orman ağacı, çam, kaya, kuru dal, çakıl taşı, lifli çalı, meyve çalısı, hindistan cevizi, balık sürüsü. Ağaçlar vuruldukça sallanır, devrilir ve bir süre sonra yeniden büyür.
- **Aletler & üretim**: taş balta, taş kazma, meşale, taş mızrak, pişmiş yemekler, sargı, sırt çantaları (envanter 10 → 15 → 20). İstasyon gerektiren tarifler (kamp ateşi, çalışma masası).
- **İnşa**: kamp ateşi (ışık + pişirme), küçük kulübe (uyku, doğma noktası), sandık (20 slot), çalışma masası. Şeffaf önizleme; geçersiz yerde kırmızı.
- **Hayatta kalma**: can, açlık, susuzluk, enerji. Sıfıra inen değerler anında öldürmez; yavaşlatır, enerjiyi geç doldurur ve canı yavaşça azaltır. Bayılınca eşyalar kaybolmaz.
- **Gün/gece**: hızlandırılmış saat (gündüz ~10 dk, gece ~3.5 dk), gün sayacı, akşam uyarısı, kulübede uyuyarak sabahı bekleme. Geceleri ateş böcekleri ve ormanda uzaktan izleyen parlayan gözler.
- **Görevler**: 16 öğretici/ana görev + 10 yan görev; pusula ve ekranda hedef işaretleri.
- **Hikâye**: gemi enkazındaki seyir defteri, terk edilmiş kamp ve günlük, üç antik sembol taşı, dağın altındaki mühürlü kapı (Bölüm 1 finali).
- **İlerleme**: XP, seviye (50'ye kadar), her seviyede yetenek puanı, 8 yetenek, görsel teknoloji ağacı.
- **Keşif**: sisli harita (fog of war), bölge keşif bildirimleri.
- **Ses**: tamamen prosedürel (dosya yok): dalga, rüzgâr, kuşlar, cırcır böcekleri, uzak uluma, ateş çıtırtısı, efektler ve seyrek, alçak sesli ambiyans müziği.
- **Kayıt**: otomatik (60 sn'de bir + önemli olaylarda), elle kaydetme, ana menüden devam.
- **Ayarlar**: ses kanalları, grafik kalitesi (Düşük/Orta/Yüksek), kamera modu, baş sallanması, FOV, fare hassasiyeti, Y ekseni, FPS göstergesi, tuş atamaları.

## Klasör yapısı

```text
index.html               giriş noktası (yükleme ekranı)
vite.config.js           geliştirme/derleme (build → tek dosya)
src/
  main.js                önyükleme
  styles/main.css        tüm arayüz stilleri
  core/                  motor çekirdeği
    Game.js              döngü, oyun modları, kayıt/yükleme orkestrasyonu
    GameState.js         açılan sistemler, tarifler, yapılar, bayraklar, istatistikler
    EventBus.js          sistemler arası olaylar (gevşek bağlılık)
    InputManager.js      yeniden atanabilir tuşlar, imleç kilidi
    TimeManager.js       oyun saati, gün evreleri
    SaveManager.js       localStorage kaydı (sürümlü)
    AudioManager.js      prosedürel ses
    Settings.js          oyuncu ayarları + kalite ön ayarları
  player/
    Player.js            oyuncu varlığı, süreli eylemler
    PlayerController.js  hareket, yerçekimi, yüzme, çarpışma
    PlayerModel.js       karakter modeli + prosedürel animasyon (1. şahısta yalnızca gölgesi görünür)
    CameraController.js  1. / 3. şahıs kamera
    ViewModel.js         1. şahısta eldeki kol ve alet (ayrı geçişte çizilir)
    PlayerStats.js       can/açlık/susuzluk/enerji
    Inventory.js         slot tabanlı envanter (sandıklar da kullanır)
  world/
    WorldManager.js      dünya parçalarını birleştirir
    Island.js            ada tasarımı: yükseklik fonksiyonu, bölgeler, göl, dağ
    Terrain.js           yükseklik haritası mesh'i (flat-shaded)
    Water.js             stilize deniz + göl shader'ı
    DayNightCycle.js     gökyüzü, güneş/ay, sis, yıldızlar
    ResourceManager.js   kaynak yerleşimi, parçalı InstancedMesh çizimi, LOD, animasyon, yeniden doğma
    InstancedChunks.js   dünyayı parçalara bölen instancing + mesafe kesici
    ResourceNode.js      tek bir kaynak
    Models.js            tüm prosedürel düşük poligon modeller
    Landmarks.js         enkaz, kamp, sembol taşları, mühürlü kapı
    Collision.js         2D çarpışma dünyası + platformlar
    GrassField.js        oyuncuyu takip eden sık çimen alanı (rüzgâr, eğilme, kenarda solma)
    DecorScatter.js      kaya, eğrelti, çalı, kütük, mantar, kabuk, saz yerleşimi
    Clouds.js            sürüklenen bulutlar
    Ambience.js          ateş böcekleri, gece gözleri
    DistantIslands.js    ufuktaki adalar
    Particles.js         havuzlanmış parçacıklar
    LightPool.js         sabit sayıda nokta ışık (shader yeniden derlemesini önler)
    ItemDrops.js         envanter dolunca yere bırakılan çuvallar
  systems/
    InteractionSystem.js hedef seçimi, toplama, vurma, yeme, su içme
    CraftingSystem.js    üretim
    BuildingSystem.js    inşa
    QuestSystem.js       olay tabanlı görevler
    ProgressionSystem.js XP, seviye, yetenekler
    ExplorationSystem.js bölgeler, harita sisi, önemli noktalar
    LootSystem.js        düşüş tabloları, nadirlik
  ui/                    HUD, paneller (envanter, üretim, inşa, günlük, harita, yetenekler,
                         teknoloji ağacı, sandık, not) ve menüler
  data/                  TÜM içerik burada, veri olarak:
    items.js recipes.js resources.js buildings.js quests.js lore.js landmarks.js
    perks.js techtree.js regions.js islands.js progression.js rarities.js controls.js
  utils/                 matematik ve tohumlanabilir gürültü
```

`assets/` klasörü yok: tüm modeller, dokular ve sesler kodla üretiliyor. İleride GLTF modeller veya ses dosyaları eklenecekse `src/assets/` altına konup `Models.js` / `AudioManager.js` üzerinden bağlanabilir.

## Yeni içerik eklemek

Oyun veri tabanlı tasarlandı; çoğu yeni içerik için yalnızca `src/data/` dosyalarına kayıt eklemek yeterli.

**Yeni eşya** (`data/items.js`):
```js
iron_axe: {
  name: 'Demir Balta', icon: '🪓', category: 'tool', maxStack: 1, rarity: 'uncommon',
  tool: { type: 'axe', tier: 2, power: 2 }, durability: 300, damage: 10, held: 'axe',
  desc: 'Ağaçları çok daha hızlı keser.',
},
```

**Yeni tarif** (`data/recipes.js`): `{ id, result, count, category, ingredients, station, unlock, xp }`

**Yeni görev** (`data/quests.js`): hedef türleri `collect, craft, cook, fell, build, discover, interact, region, regions, sleep, drink, level, day, walk`. Ödüller tarif, yapı, sistem (`features`) ve yetenek puanı açabilir; `next` ile zincirlenir.

**Yeni kaynak** (`data/resources.js` + `world/Models.js` içinde bir model fonksiyonu + `ResourceManager.generate()` içinde bir dağılım kuralı).

**Yeni yapı** (`data/buildings.js` + `Models.js` → `BUILDING_BUILDERS`).

## Performans notları

- Aynı türden nesneler `InstancedMesh` ile çizilir; dünya 120 m'lik parçalara bölündüğü için kameranın ve gölge kamerasının görmediği parçalar hiç çizilmez.
- Ağaçların uzak parçaları otomatik olarak düşük poligonlu ikizleriyle (LOD) değiştirilir; küçük süsler belli bir mesafeden sonra gizlenir.
- Çimen yalnızca oyuncunun çevresindeki ~48 m'de, hücre hücre üretilir; kenarda yumuşakça zemine iner.
- Modeller düşük poligonlu ve köşe renklidir; doku yüklenmez.
- Tek gölge ışığı oyuncuyu takip eder; gölge haritası kaliteye göre 1024/2048 ya da kapalı.
- Nokta ışıklar sabit bir havuzdan atanır (ışık sayısı değişince oluşan shader derleme takılmaları önlenir).
- Su derinliği yükseklik dokusundan okunur; ek derinlik geçişi gerekmez.
- Grafik kalitesi: piksel oranı, gölgeler, gölge çözünürlüğü, çimen yoğunluğu, ağaç LOD mesafesi ve sis mesafesi.

## Yol haritası (sonraki aşamalar)

Mevcut MVP, istenen geliştirme sırasının 1–7. aşamalarını ve görev/ilerleme/keşif sistemlerinin temelini kapsar. Sıradakiler:

1. **Hayvanlar** — tavuk, geyik, koyun (pasif); et, deri, tüy, yün → `systems/EnemySystem.js` + `data/enemies.js`
2. **Savaş** — normal/güçlü saldırı, kaçınma; mızrak ve kılıç → `systems/CombatSystem.js` (yetenek sistemindeki *Savaşçı* bonusu hazır)
3. **Düşman yapay zekâsı** — yaban domuzu, kurt, orman yaratığı; gece daha fazla düşman (gece gözleri bunun habercisi)
4. **Tarım** — toprak hazırla → ek → sula → bekle → hasat → `systems/FarmingSystem.js`
5. **Madencilik & mağaralar** — kömür, demir, bakır; mühürlü kapının ardındaki mağara
6. **Demir çağı** — fırın, demir aletler, demirci (teknoloji ağacında "Yakında" düğümleri)
7. **Bosslar** — Dev Orman Canavarı, Taş Golem, Lav Golemi
8. **Tekne & yeni adalar** — sal → küçük tekne → gelişmiş tekne; ufuktaki volkan, buz ve çöl adaları
9. **Gelişmiş teknoloji & endgame** — çelik, gelişmiş atölye, kristal teknolojisi
