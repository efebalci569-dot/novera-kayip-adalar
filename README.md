# Novera: Kayıp Adalar

Tarayıcıda oynanan, gerçek 3D (Three.js) bir **ada hayatta kalma** oyunu. Gemi kazasından sağ kurtulan oyuncu, bilinmeyen bir adada sıfırdan başlar: kaynak toplar, alet üretir, ateş yakar, barınak kurar, adayı keşfeder ve "bu adada benden önce kim vardı?" sorusunun peşine düşer.

Bu sürüm (**0.4 — Kayıp Adalar**) üç bölümlük hikâyenin tamamını içerir: Novera'daki öğretici + hikâye zinciri, mağara, ve tekneyle ulaşılan **dört adalı bir takımada** (Novera, Çöl, Buz, Volkan). Her yeni adada **saldırgan canlılar**, yeni malzemeler, **yeni bir silah** ve sunağında çağrılan bir **ada muhafızı (boss)** var; her boss yenilince bir sonraki adanın **seyir haritasını** düşürür. Envanter ve arayüzdeki tüm simgeler emoji yerine oyunun kendi **3B modellerinden çizilir**, elde tutulan her eşya 3B görünür. Menüden **karakterini tasarlayabilir**, **4 zorluk modundan** birini seçebilir ve arkadaşlarınla **çevrim içi (en fazla 8 kişi)** oynayabilirsin.

---

## Çalıştırma

Gereksinim: [Node.js](https://nodejs.org) 18+ (geliştirme için). Oyuncu için kurulum gerekmez.

```bash
npm install      # bağımlılıklar (three, peerjs, vite)
npm run dev      # geliştirme sunucusu → http://localhost:5173
npm run build    # dist/index.html üretir
```

`npm run build` çıktısı **tek bir HTML dosyasıdır** (tüm kod ve stiller gömülü). `dist/index.html` dosyasını çift tıklayarak internet ya da kurulum olmadan herhangi bir modern tarayıcıda (Chrome, Edge, Firefox) oynayabilirsin (çok oyunculu için internet gerekir). İlerleme tarayıcının yerel deposuna (localStorage) kaydedilir.

### GitHub Pages'te yayınlama

Repoda `.github/workflows/deploy.yml` hazır: `main` dalına her gönderimde oyun derlenip GitHub Pages'e yüklenir. Repo ayarlarında bir kez **Settings → Pages → Build and deployment → Source: GitHub Actions** seçmek yeterli. Oyun `https://<kullanıcı-adı>.github.io/<repo-adı>/` adresinde yayınlanır.

## Kontroller

| Tuş | Eylem |
| --- | --- |
| **W A S D** | Hareket |
| **Fare** | Bakış (oyuna tıklayınca imleç kilitlenir; kilit yoksa basılı tutup sürükle) |
| **V** | 1. şahıs (gözden) ↔ 3. şahıs kamera |
| **Fare tekerleği** | 3. şahısta kamerayı yakınlaştır/uzaklaştır |
| **Sol tık / E** | Etkileşim, topla, vur, hayvana/düşmana/boss'a saldır (basılı tutunca devam eder) · teknedeyken **E** ile in |
| **Sağ tık** | Seçili eşyayı kullan (yiyecek ye, sal/tekneyi suya indir, zırh kuşan, seyir haritasını aç) · inşa modunda iptal |
| **Shift** | Koş · **Boşluk** Zıpla |
| **1–5** | Hızlı slot seç |
| **I / Tab** | Envanter |
| **C** | Üretim |
| **B** | İnşa (R: döndür) — önizleme mavi: uygun, kırmızı: bir şeyle çakışıyor |
| **J** | Günlük (görevler + bulunan notlar) |
| **M** | Harita (keşfettikçe açılır) |
| **K** | Yetenekler |
| **T** | Teknoloji ağacı |
| **Enter** | Sohbet (çok oyunculu): yaz, Enter ile gönder, Esc ile kapat |
| **Esc** | Menü / paneli kapat |

Tüm tuşlar **Ayarlar → Kontroller** bölümünden değiştirilebilir. Sistemler oyunun başında kilitlidir; görevler ilerledikçe açılır (ör. Üretim, ilk odunları toplayınca gelir).

## Karakter, zorluk ve çok oyunculu

### Karakter düzenleyici (Ana menü → 👤 Karakter)

- **Erkek / kadın** karakter (kadın karakterin gövdesi ve kolları daha ince, kirpikleri ve yanak allığı var).
- **12 saç modeli**: kısa, yana taralı, kirpi, kıvırcık, ibik, afro, uzun, at kuyruğu, topuz, örgü, küt, kel.
- **Sakal / bıyık** (erkek): kirli sakal, bıyık, keçi sakalı, tam sakal, uzun sakal.
- **Renkler**: 8 ten rengi, 14 saç rengi, 8 göz rengi, gömlek ve pantolon renkleri.
- Döndürülebilir 3B önizleme (sürükle; tekerlek ya da "Yüz" düğmesiyle yüze yakınlaş), 🎲 rastgele karakter, oyuncu adı.
- Karakter tüm dünyalarda ve çok oyunculuda ortaktır; oyun içinde duraklatma menüsünden de düzenlenebilir.
- Karakter modeli de güzelleştirildi: kulak, burun, ağız, kaşlar, göz akı/irisi/parıltısı, göz kırpma, kemer, yaka, kıvrılmış paçalar, ayakkabılar.

### Zorluk modları (Yeni Oyun → zorluk seçimi)

| Mod | Açlık / susuzluk | Alınan hasar | Can yenilenmesi | Deneyim | Ölünce |
| --- | --- | --- | --- | --- | --- |
| 🌴 **Kolay** | ×0.6 (yavaş) | ×0.6 | ×1.6 | ×1.25 | eşyalar sende kalır |
| 🏝️ **Normal** | ×1 | ×1 | ×1 | ×1 | eşyalar sende kalır |
| 🔥 **Zor** | **×1.75 (çok daha hızlı)** | ×1.35 | ×0.6 | ×1.1 | eşyalar öldüğün yerde bir çuvala düşer (haritada 💀) |
| 💀 **Hardcore** | ×1.75 | ×1.35 | ×0.6 | ×1.3 | **tek can**: tekrar canlanılmaz |

Hardcore'da ölünce tek kişilik dünya **silinir**. Çok oyunculuda ölen oyuncu **izleyici** olur (görünmez, çarpışmasız uçar; WASD + Boşluk + Shift) ve o dünyaya tekrar katılsa bile yalnızca izleyebilir. Zorluk dünya oluşturulurken seçilir ve kayıtla saklanır; çok oyunculuda odayı kuranın zorluğu herkese uygulanır.

### Çok oyunculu (Ana menü → 🌐 Çok Oyunculu)

- **Oda kur**: kayıtlı dünyanla ya da yeni bir dünya (zorluk seçerek) ile. 6 karakterlik **oda kodu** ekranda (sol üst) ve menüde görünür; tıklayınca kopyalanır. Tek kişilik oyunu sürerken de duraklatma menüsünden **🌐 Odayı Aç** ile arkadaşlarını çağırabilirsin.
- **Odaya katıl**: arkadaşının verdiği kodu yaz → Katıl. Bir odada **en fazla 8 oyuncu** olur; dolu odaya girilmez.
- Herkes birbirini karakter görünümü, ad etiketi, animasyonları (yürüme, yüzme, vurma, kürek…) ve elindeki meşalenin ışığıyla görür; haritada diğer oyuncular mavi noktadır.
- Ortak dünya: kesilen ağaçlar/kırılan kayalar, kurulan yapılar, sandık içerikleri, indirilen sal/tekneler (birinin bindiği tekneye başkası binemez), hayvanlar (avlanma, parçalama — leşi ilk alan alır) ve gün/gece herkes için aynıdır.
- **Ortak uyku**: gece herkes yatağa yatınca sabah olur (kaç kişinin yattığı gösterilir; Esc ile kalkılır).
- **Sohbet**: Enter.
- Dünya **odayı kuranın** bilgisayarında çalışır ve kaydedilir; oda kurucu çıkınca oda kapanır. Misafirlerin karakteri (envanter, seviye, görevler) kendi tarayıcılarında saklanır; aynı odaya tekrar katılınca kaldıkları yerden devam ederler. Çok oyunculuda menü açmak oyunu durdurmaz.

**Nasıl çalışıyor?** Tarayıcılar birbirine doğrudan (WebRTC, [PeerJS](https://peerjs.com)) bağlanır; ayrı bir oyun sunucusu yoktur. Oda kodunu eşleştirmek için PeerJS'in ücretsiz genel eşleşme sunucusu kullanılır. Bazı okul/iş ağları ya da sıkı NAT/güvenlik duvarları doğrudan bağlantıyı engelleyebilir (bu durumda "Doğrudan bağlantı kurulamadı" hatası çıkar).

**Kendi eşleşme sunucunu kullanmak** (isteğe bağlı): `npx peer --port 9000` ile bir [PeerJS sunucusu](https://github.com/peers/peerjs-server) çalıştır ve oyunu `?peer=alanadi:9000` ile aç (HTTPS için `&peerSecure=1`, farklı yol için `&peerPath=/yol`). Odadaki herkes aynı adresi kullanmalı.

## Kayıp Adalar (0.4)

### Takımada ve seyir

| Ada | Konum | İklim | Saldırgan canlılar | Yeni malzemeler | Muhafız (boss) | Çağırma eşyası |
| --- | --- | --- | --- | --- | --- | --- |
| 🏝️ **Novera** | merkez | ılıman | — | kristal, demir, kömür (mağara) | 🌳 **Orman Muhafızı** (Kadim Sunak) | Orman Kalbi |
| 🌵 **Çöl Adası** | güneybatı | sıcak | Çöl Akrebi (zehirler), Çöl Sırtlanı | kumtaşı, bakır, kemik, kitin, kaktüs meyvesi | 👑 **Kum Kralı** (Kum Tapınağı) | Akrep Mührü |
| ❄️ **Buz Adası** | kuzeybatı | **dondurucu** | Kar Kurdu, Buz Cini (uzaktan buz atar) | buz kristali, kürk, kurt dişi, buz özü, demir damarı | 🧊 **Buz Devi** (Buzul Sunağı) | Buz Kalbi |
| 🌋 **Volkan Adası** | kuzeydoğu | **kavurucu**, lav nehirleri | Lav Balçığı, Ateş Kertenkelesi (yakar) | obsidyen, kükürt, magma çekirdeği, ateş pulu | 🔥 **Lav Golemi** (Ateş Sunağı) | Ateş Mührü |

- Adalar dünyada **gerçek konumlarında** durur; tekneyle açık denize çıkıp gerçekten yelken açarak gidilir (ışınlanma yok). Açık denizde rüzgâr tekneyi **1.8 kat** hızlandırır.
- **Konumu bilinmeyen** bir adanın etrafında fırtınalı bir sis perdesi vardır; tekne oraya giremez. Bir adanın muhafızını yenince düşen **seyir haritası** sıradaki adanın konumunu açar (pusula ve ekranda hedef, haritada rota). Sal kıyıdan ayrılamaz; yüzerek de açığa çıkılamaz.
- **Harita (M)**: her ada için ayrı sisli harita + **🧭 Takımada** görünümü (bilinen adalar, rotalar, yenilen muhafızlar).
- Ada başına ayrı bölgeler, kaynaklar, süsler, çimen renkleri, gökyüzü tonu, kar / kül / kum savrulması.
- **İklim**: Buz adasında ateşten ya da barınaktan uzak kalınca **üşürsün** (ekran buzlanır, sonra donup can kaybedersin, yavaşlarsın) — **Kürk Mont** korur. Volkan adasında sıcaktan **daha çabuk susarsın**, lava basmak ölümcüldür — **Ateş Zırhı** korur.
- Her adanın kendi **doğma noktası** vardır: o adada ölürsen orada kurduğun son barınakta/yatakta, yoksa adanın varış sahilinde uyanırsın.

### Saldırgan canlılar ve savaş

- Canlılar yuvalarının çevresinde dolaşır, yaklaşınca fark edip kovalar, saldırmadan önce **hazırlanır** (kaçmak için an), yuvadan çok uzaklaşınca geri döner ve iyileşir. Öldürülen canlıların yerine bir süre sonra (yakında oyuncu yokken) yenileri doğar.
- Vuruş etkileri: **zehir** (akrep), **yanık** (lav canlıları), **donma** (yavaşlatır). Vurulunca geri itilir, ekran kırmızı parlar.
- Ganimet doğrudan öldürenin envanterine geçer; çok oyunculuda öldüren misafirse ganimet ona gider.
- **Zırhlar** (sağ tık / Envanter → Kuşan; karakterin üzerinde görünür): Kitin Zırh (Savunma +15), Kürk Mont (+10, soğuğa dayanıklı), Ateş Zırhı (+25, ateşe dayanıklı).
- **Silahlar**: Bakır Pala (18 hasar) → Buz Kılıcı (26, vurduğunu yavaşlatır) → Obsidyen Kılıç (38, vurduğunu yakar). **Bakır Kazma** obsidyeni kırabilen tek kazmadır.
- **Fırın** (yeni yapı): kumtaşından eritme ocağı + örs. Bakır/demir külçe eritir, palaları, kılıçları ve mühürleri döver; yanında ısınılır.

### Ada muhafızları (boss)

- Sunağa çağırma eşyasını koyunca muhafız topraktan yükselir; ekranın üstünde **can çubuğu** belirir. Canı yarıya inince **öfkelenir** (daha hızlı ve sık saldırır, yardımcılarını çağırır).
- Her saldırı yere çizilen **kırmızı uyarı halkasıyla** önceden belli olur; halka dolduğunda vuruş gelir:
  - **Orman Muhafızı**: yere vuruş (çevresine), kökler (oyuncuların altından), savuruş (önündeki yay)
  - **Kum Kralı**: kuyruk iğnesi (zehirli), savuruş, **kuma dalıp oyuncunun altından çıkma**, akrep çağırma
  - **Buz Devi**: yere vuruş, **buz kayası fırlatma** (düştüğü yer işaretli), savuruş, kurt çağırma
  - **Lav Golemi**: yere vuruş, **gökten ateş yağmuru**, **lav birikintileri** (üstünde duran yanar), balçık çağırma, savuruş
- Muhafızın canı odadaki oyuncu sayısına göre artar. Yenilince odadaki **herkes** ödül alır (seyir haritası, malzemeler, çok miktarda XP). Kimse kalmazsa muhafız yeniden uykuya döner ve çağırma eşyası sunağın önüne bırakılır.
- Son muhafız yenilince takımadanın sırrı çözülür (Bölüm 3 finali).

### Hikâye: Bölüm 3

Madencinin defteri → **Orman Kalbi** → Orman Muhafızı → tekneyle Çöl Adası → fırın ve bakır → Bakır Pala → Kum Kralı → Buz Adası → Kürk Mont → demir ve Buz Kılıcı → Buz Devi → Volkan Adası → obsidyen → Lav Golemi. Yan görevler: Gemi Ustası, Çöl Avcısı, Serap Değil (vaha), Soğuk Işıklar, Ateşe Dayanıklı. Teknoloji ağacı bu ilerlemeyi gösterir.

### Emoji yerine oyun içi simgeler

- Envanter, hızlı slotlar, üretim, inşa, görev ödülleri, bildirimler, harita ve teknoloji ağacındaki tüm eşya/yapı/hayvan/düşman/boss simgeleri, oyunun **kendi 3B modellerinden** ayrı bir çizicide çizilen küçük resimlerdir (ör. odun envanterde gerçek bir odun demeti olarak görünür).
- Arayüz simgeleri (can, açlık, su, enerji, kilit, harita…) özel çizilmiş SVG'lerdir.
- **Elde tutma**: balta ve kazma gibi, seçili hızlı slottaki **her eşya** elde 3B olarak görünür (odun, taş, meyve, külçe, harita…); 1. ve 3. şahısta, çok oyunculuda diğer oyuncular da görür.

## MVP'de neler var?

- **3D ada**: sahil, çayırlar, sık orman, ~150 m yüksekliğinde kayalık bir dağ (iki yan zirveyle), tatlı su gölü; stilize su (derinliğe göre renk, kıyı köpüğü, dalgalar), sürüklenen bulutlar, ufukta diğer adaların siluetleri (konumu bilinince görünür).
- **Ölçek**: her şey 1.8 m boyundaki karaktere göre: palmiyeler 9–11 m, orman ağaçları 8–10 m, çamlar 11–14 m, dev kayalar 3–6 m.
- **Doğa**: oyuncunun çevresinde rüzgârda dalgalanan, yürürken kenara eğilen sık çimen ve çiçekler; büyük kayalar, kayalık sivri çıkıntılar, eğrelti otları, çalılar, devrik kütükler, kütükler, mantarlar, deniz kabukları, göl kıyısında sazlar.
- **Oyuncu**: varsayılan **1. şahıs** (gözden) kamera, elde alet ve kol animasyonları (vurma, toplama, yeme), yürürken hafif baş sallanması; istenirse **V** ile 3. şahıs kamera (araziye/yapılara çarpmaz, aradaki ağaçlar şeffaflaşır).
- **Yüzme**: ilerlerken serbest stil kulaç (3. şahısta kollar sırayla sudan çıkar, ayaklar çırpar, nefes için baş yana döner), dururken su sayma; 1. şahısta iki kolla kurbağalama; kulaçlarla su halkaları ve sıçramalar, başın dalgayla inip kalkması.
- **Düşme hasarı**: ~4.5 m'den yüksek düşüşler can yakar (~18 m ölümcül); suya düşmek can yakmaz.
- **Kaynaklar**: palmiye, orman ağacı, çam, kaya, kuru dal, çakıl taşı, lifli çalı, meyve çalısı, sarmaşık, hindistan cevizi, balık sürüsü. Ağaçlar ve çalılar rüzgârda sallanır (gölgeleriyle birlikte); ağaçlar vuruldukça sallanıp yaprak döker, son vuruşta gıcırdayıp hızlanarak devrilir, yere çarpınca seker, toz ve yaprak saçar, geride kütük bırakır ve bir süre sonra kütükten yeniden büyür.
- **Sarmaşıklar**: orman ağaçlarının gövdesine sarılan ve dallardan sarkan sarmaşıklar; ormanda toplanabilir sarmaşık yumakları (sarmaşık → halat).
- **Hayvanlar**: inek, koyun ve tavuk (yoğunluk bilerek düşük). Otlar, dolaşır, vurulunca kaçar; tavuklar yaklaşınca ürker. Ölünce zıplayarak yana devrilir, bacakları gerilir, gözleri kapanır. **Taş Bıçak** ile parçalanınca: inek → et + deri, koyun → yün + et, tavuk → et + tüy. Ölenlerin yerine bir süre sonra uzakta yenileri doğar.
- **Aletler & üretim**: taş balta, taş kazma, taş bıçak, meşale, taş mızrak, olta (tüy), halat, yün battaniye, pişmiş yemekler (et dahil), sargı, sırt çantaları (envanter 10 → 15 → 20). İstasyon gerektiren tarifler (kamp ateşi, çalışma masası). Seviye kilitli tarifler adıyla ve gereken seviyeyle görünür.
- **İnşa**: kamp ateşi (ışık + pişirme), yatak (uyku; yün battaniyeyle yapılır), sandık (20 slot), çalışma masası, fırın, kristal fener. Şeffaf önizleme: uygunsa mavi, bir ağaç, kaya, çalı, çakıl, kütük, yapı vb. ile çakışıyorsa **kırmızı** (neyle çakıştığı yazar). Yatak ve sandık barınakların içine konabilir.
- **Barınaklar (seviyeyle açılır)**: Küçük Kulübe (görev), Saz Çardak (Sv 2), Ahşap Kulübe (Sv 5), Taş Ev (Sv 9). Yatak bir barınağın içindeyse uyku daha çok dinlendirir (konfor ★).
- **Sal ve tekne (seviyeyle açılır)**: çalışma masasında Sal (Sv 4) ve yün yelkenli Tekne (Sv 8) üretilir, envanterden suya indirilir; binilir, W/S ileri-geri, A/D dönüş, kürek/dümen animasyonu, dalgalarla yalpalama, iz halkaları, sığlıkta karaya oturma; kıyıya yakınken **E** ile inilir. Tekne saldan hızlıdır ve açık denize çıkıp diğer adalara gidebilir.
- **Mağara**: dağın batı eteğindeki kaya kemerli girişten girilen, odalar ve tünellerden oluşan kapalı mağara. Karanlık (meşale işe yarar), sarkıt ve dikitler, parlayan kristaller, kömür ve demir damarları, ışıldayan mantarlar, tavandaki yarıktan süzülen ışıkla çıkış ve madencinin terk ettiği kamp (hikâye notu).
- **Hayatta kalma**: can, açlık, susuzluk, enerji. Sıfıra inen değerler anında öldürmez; yavaşlatır, enerjiyi geç doldurur ve canı yavaşça azaltır. Ölünce ne olacağı zorluğa bağlıdır (yukarıdaki tablo).
- **Gün/gece**: hızlandırılmış saat (gündüz ~10 dk, gece ~3.5 dk), gün sayacı, akşam uyarısı, yatakta uyuyarak sabahı bekleme. Geceleri ateş böcekleri ve ormanda uzaktan izleyen parlayan gözler.
- **Görevler**: 34 öğretici/ana görev + 18 yan görev (av, yatak, mağara, sarmaşık, sal, adalar, muhafızlar…); pusula ve ekranda hedef işaretleri (hayvanlar, düşmanlar, uzak adalar ve mağara içi hedefler dahil).
- **Hikâye**: gemi enkazındaki seyir defteri, terk edilmiş kamp ve günlük, üç antik sembol taşı, dağın altındaki mühürlü kapı (Bölüm 1 finali), mağaradaki madencinin defteri (Bölüm 2), çöl kalıntıları, donmuş kamp ve obsidyen tapınak notları, dört ada muhafızı (Bölüm 3).
- **İlerleme**: XP, seviye (50'ye kadar), her seviyede yetenek puanı, 8 yetenek, görsel teknoloji ağacı.
- **Keşif**: sisli harita (fog of war), bölge keşif bildirimleri.
- **Ses**: tamamen prosedürel (dosya yok): dalga, rüzgâr, kuşlar, cırcır böcekleri, uzak uluma, ateş çıtırtısı, efektler ve seyrek, alçak sesli ambiyans müziği.
- **Kayıt**: otomatik (60 sn'de bir + önemli olaylarda), elle kaydetme, ana menüden devam. Eski kayıtlar yeni sürüme otomatik uyarlanır (yeni tarif/yapılar seviyeye ve tamamlanan görevlere göre açılır).
- **Ayarlar**: ses kanalları, grafik kalitesi (Düşük/Orta/Yüksek), otomatik çözünürlük, arayüz boyutu, kamera modu, baş sallanması, FOV, fare/dokunmatik hassasiyeti, Y ekseni, FPS göstergesi, tuş atamaları.
- **Telefon ve tablet**: sol tarafta joystick (sonuna kadar itince koşar), sağ tarafta kaydırarak bakış; Eylem, Zıpla, Kullan, Koş düğmeleri; üstte Envanter, Harita, Sohbet ve **Menü** (üretim, inşa, günlük, yetenekler, teknoloji, kamera, tam ekran, duraklat). Görev listesine dokununca küçülür, çevrim içi oda paneli **Tamam** ile küçük bir rozete döner. Uygulama arka plana alınınca oyun kaydedilir.

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
    Profile.js           oyuncu adı + karakter görünümü (tüm dünyalarda ortak)
  player/
    Player.js            oyuncu varlığı, süreli eylemler
    PlayerController.js  hareket, yerçekimi, yüzme, çarpışma
    PlayerModel.js       karakter modeli (görünüme göre saç/sakal/renk) + prosedürel animasyon (1. şahısta yalnızca gölgesi görünür)
    CameraController.js  1. / 3. şahıs kamera
    ViewModel.js         1. şahısta eldeki kol ve alet (ayrı geçişte çizilir)
    PlayerStats.js       can/açlık/susuzluk/enerji
    Inventory.js         slot tabanlı envanter (sandıklar da kullanır)
  world/
    WorldManager.js      dünya parçalarını birleştirir
    Island.js            ada tasarımı (dünya koordinatlı): yükseklik fonksiyonu, bölgeler, göl/vaha/donmuş göl, dağ, plato, krater, lav nehirleri
    Terrain.js           ada başına yükseklik haritası mesh'i (biyom renkleri) + TerrainSet (tüm adalar tek arayüz)
    Water.js             kamerayı izleyen stilize deniz + ada başına göl shader'ı
    Lava.js              krater, lav birikintileri ve nehirleri (ışıklı shader)
    Weather.js           kar, kül/kıvılcım ve kum savrulması (kameranın çevresinde)
    ItemModels.js        her eşyanın 3B modeli (ikon çizimi ve elde tutma)
    CreatureModels.js    düşman ve boss modelleri + prosedürel animasyon (yürüme, hazırlanma, saldırı, ölüm)
    DayNightCycle.js     gökyüzü, güneş/ay, sis, yıldızlar
    ResourceManager.js   kaynak yerleşimi, parçalı InstancedMesh çizimi, LOD, animasyon, yeniden doğma
    InstancedChunks.js   dünyayı parçalara bölen instancing + mesafe kesici
    ResourceNode.js      tek bir kaynak
    Models.js            tüm prosedürel düşük poligon modeller
    Landmarks.js         enkaz, kamp, sembol taşları, mühürlü kapı
    Collision.js         2D çarpışma dünyası (yüzey/mağara katmanları) + platformlar + dikdörtgen kesişimleri
    GrassField.js        oyuncuyu takip eden sık çimen alanı (rüzgâr, eğilme, kenarda solma)
    DecorScatter.js      kaya, eğrelti, çalı, kütük, mantar, kabuk, saz yerleşimi
    Clouds.js            sürüklenen bulutlar
    Ambience.js          ateş böcekleri, gece gözleri
    DistantIslands.js    ufuktaki adalar
    Particles.js         havuzlanmış parçacıklar
    LightPool.js         sabit sayıda nokta ışık (shader yeniden derlemesini önler)
    ItemDrops.js         envanter dolunca yere bırakılan çuvallar
    Cave.js              dağın altındaki mağara: SDF tabanlı zemin/tavan, süsler, çıkış, kaynak yerleşimi
    AnimalModels.js      inek, koyun, tavuk modelleri (eklemli parçalar)
    Ripples.js           su yüzeyinde genişleyen halkalar (yüzme, kürek, tekne izi)
  systems/
    InteractionSystem.js hedef seçimi, toplama, vurma, yeme, su içme
    CraftingSystem.js    üretim
    BuildingSystem.js    inşa
    QuestSystem.js       olay tabanlı görevler
    ProgressionSystem.js XP, seviye, yetenekler
    ExplorationSystem.js bölgeler, harita sisi, önemli noktalar
    LootSystem.js        düşüş tabloları, nadirlik
    AnimalSystem.js      hayvan yapay zekâsı, avlanma, ölüm animasyonu, parçalama, yeniden doğma
    VehicleSystem.js     sal/tekne: suya indirme, binme, sürme, kıyıya inme
    NavigationSystem.js  bilinen adalar, deniz sınırları ve sis perdesi, açık deniz rüzgârı, ada başına doğma noktası
    EnemySystem.js       saldırgan canlılar: yuvalar, yapay zekâ, saldırılar, mermiler, ganimet, ağ senkronu
    BossSystem.js        ada muhafızları: sunakta çağırma, uyarı halkalı saldırılar, öfke, ödüller, ağ senkronu
  net/
    Network.js           oda kurma/katılma (PeerJS), mesajlaşma, ev sahibi aktarımı, ortak uyku
    RemotePlayers.js     diğer oyuncuların modeli, ad etiketi, meşale ışığı, yumuşak geçiş
  ui/                    HUD (sohbet, oda paneli, boss can çubuğu), paneller (envanter, üretim, inşa, günlük,
                         harita + takımada, yetenekler, teknoloji ağacı, sandık, not), menüler (karakter düzenleyici,
                         zorluk seçimi, çok oyunculu) ve CharacterPreview.js (3B önizleme)
    ItemIcons.js         3B modelleri ayrı bir çizicide küçük resimlere çevirir (önbellekli)
    icons.js rich.js     SVG arayüz simgeleri; metindeki {i:wood} gibi belirteçleri (ve eski emojileri) simgeye çevirir
  data/                  TÜM içerik burada, veri olarak:
    items.js recipes.js resources.js buildings.js quests.js lore.js landmarks.js animals.js
    perks.js techtree.js regions.js islands.js progression.js rarities.js controls.js
    appearance.js (saç/sakal modelleri, renk paletleri) difficulty.js (zorluk çarpanları)
    enemies.js (saldırgan canlılar) bosses.js (ada muhafızları)
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

**Yeni görev** (`data/quests.js`): hedef türleri `collect, craft, cook, fell, build, discover, interact, region, regions, sleep, drink, level, day, walk, kill, butcher, sail, island, slay, boss`. Ödüller tarif, yapı, sistem (`features`) ve yetenek puanı açabilir; `next` ile zincirlenir.

**Eşya modeli ve simgesi** (`world/ItemModels.js` → `MODELS`): bir geometri kurucusu, ikon açısı ve elde tutma ölçüsü. Metinlerde `{i:eşya}`, `{b:yapı}`, `{a:hayvan}`, `{e:düşman}`, `{x:boss}`, `{s:svg-adı}` belirteçleri simgeye dönüşür.

**Yeni düşman** (`data/enemies.js` + `world/CreatureModels.js` içinde bir model): can, hasar, hızlar, saldırı menzili/hazırlanma süresi, fark etme ve kovalama mesafesi, etkiler (zehir/yanık/donma), uzaktan saldırı, yuva bölgeleri, ganimet.

**Yeni boss** (`data/bosses.js` + sunak için `data/landmarks.js` → `altar` + model): saldırı sırası (`slam, sweep, roots, tail, burrow, boulder, meteor, pools, summon`), çağırma eşyası, yardımcı düşman, ödüller ve açılacak ada (`reward.reveal`).

**Yeni ada** (`data/islands.js`): merkez, tohum, yarıçap, biyom, dağ/plato/krater/göl, önemli noktalar ve düzleştirilecek alanlar; kaynak ve süs kuralları `ResourceManager` / `DecorScatter` içindeki biyom tablolarındadır.

**Yeni hayvan** (`data/animals.js` + `world/AnimalModels.js` içinde bir model): can, hız, bölgeler, sürü sayısı ve bıçakla parçalayınca düşenler (`harvest`).

**Yeni kaynak** (`data/resources.js` + `world/Models.js` içinde bir model fonksiyonu + `ResourceManager.generate()` içinde bir dağılım kuralı).

**Yeni saç / sakal modeli** (`data/appearance.js` içine bir kayıt + `player/PlayerModel.js` → `HAIR_BUILDERS` / `BEARD_BUILDERS` içine aynı anahtarla bir şekil fonksiyonu).

**Zorluk ayarı** (`data/difficulty.js`): her mod için açlık/susuzluk, hasar, can yenilenmesi ve XP çarpanları, ölünce eşya düşürme ve tek can.

**Yeni yapı** (`data/buildings.js` + `Models.js` → `BUILDING_BUILDERS`). `bounds` taban dikdörtgenini (yerleştirme/çakışma), `unlock: { level }` seviye kilidini, `shelter/comfort/interior` barınak özelliklerini belirler.

## Performans notları

- Aynı türden nesneler `InstancedMesh` ile çizilir; dünya 120 m'lik parçalara bölündüğü için kameranın ve gölge kamerasının görmediği parçalar hiç çizilmez.
- Ağaçların uzak parçaları otomatik olarak düşük poligonlu ikizleriyle (LOD) değiştirilir; küçük süsler belli bir mesafeden sonra gizlenir.
- Çimen yalnızca oyuncunun çevresindeki ~48 m'de, hücre hücre üretilir; kenarda yumuşakça zemine iner.
- Modeller düşük poligonlu ve köşe renklidir; doku yüklenmez.
- Tek gölge ışığı oyuncuyu takip eder; gölge haritası kaliteye göre kapalı / 1536 / 2048. Orta kalitede gölge haritası iki karede bir yenilenir; çimenler gölge almaz.
- **Otomatik çözünürlük**: kare hızı düşük kalırsa çözünürlük kademeli azaltılır (en az %55), akıcılık dönünce geri artar.
- Canlılar yalnızca yakındayken (~32 m) gölge düşürür; hayvan gözleri tek parça çizilir. Eşya simgeleri boşta, birer birer önceden hazırlanır.
- Rüzgâr salınımı tamamen köşe gölgelendiricisinde (GPU) hesaplanır; ek CPU maliyeti yoktur.
- Mağara yüzeyden ayrı bir alandır: içerideyken ada, su ve gökyüzü hiç çizilmez; ışık havuzu 3B uzaklığa göre seçer.
- Uzaktaki hayvanlar donar ve çizilmez; kütükler tek bir InstancedMesh ile yalnızca kullanılan yuvalar kadar çizilir.
- Nokta ışıklar sabit bir havuzdan atanır (ışık sayısı değişince oluşan shader derleme takılmaları önlenir).
- Su derinliği yükseklik dokusundan okunur; ek derinlik geçişi gerekmez.
- Kameradan uzaktaki adaların arazisi, kaynakları ve süsleri tamamen gizlenir; deniz, bulutlar ve hava efektleri kamerayı izler.
- Yakınında oyuncu olmayan düşmanlar düşünmez, uzaktakiler çizilmez; çok oyunculuda her misafire yalnızca yakınındaki düşmanların durumu gönderilir.
- Eşya simgeleri bir kez çizilip önbelleğe alınır.
- Grafik kalitesi: piksel oranı, gölgeler, gölge çözünürlüğü, çimen yoğunluğu, ağaç LOD mesafesi ve sis mesafesi.

## Yol haritası (sonraki aşamalar)

Tamamlananlar: pasif hayvanlar ve avlanma, mağara + madencilik, sal ve tekne, seviyeyle açılan barınaklar, karakter düzenleyici, zorluk modları, çevrim içi çok oyunculu (8 kişi), **dört adalı takımada**, **saldırgan canlılar ve savaş**, **fırın, bakır ve demir işleme**, **zırhlar**, **dört ada muhafızı**, **3B eşya simgeleri**. Sıradakiler:

1. **Tarım** — toprak hazırla → ek → sula → bekle → hasat → `systems/FarmingSystem.js`
2. **Novera'da gece yaratıkları** — gece gözlerinin sahipleri; kaçınma/blok gibi gelişmiş savaş hareketleri
3. **Çelik ve kristal teknolojisi** — gelişmiş atölye, kristal kazma ve silahlar
4. **Yeni adalar ve deniz canlıları** — takımadanın ötesi, köpek balıkları, batık gemiler
