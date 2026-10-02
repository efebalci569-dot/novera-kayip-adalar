// Görev verileri. Görevler üç türdür: tutorial (öğretici), main (hikâye) ve side (yan görev).
//
// Hedef (objective) türleri — QuestSystem bunları olaylarla takip eder:
//   walk     { amount }                 → yürünen mesafe (m)
//   collect  { item, amount }           → toplanan eşya (başlangıçta envanterdekiler sayılır)
//   craft    { item, amount }           → üretilen eşya
//   cook     { amount }                 → kamp ateşinde pişirilen yemek
//   fell     { group, amount }          → kesilen ağaç / kırılan kaya ('tree' | 'rock')
//   build    { building, amount }       → inşa edilen yapı
//   discover { landmark }               → keşfedilen önemli nokta
//   interact { target }                 → önemli noktayla etkileşim
//   region   { region }                 → bölgeye ulaş
//   regions  { amount }                 → keşfedilen bölge sayısı
//   sleep / drink { amount }            → uyu / tatlı su iç
//   level / day { amount }              → seviye / hayatta kalınan gün
//   kill / butcher { animal?, amount }  → hayvan avla / bıçakla parçala
//   sail { amount }                     → sal/tekneyle gidilen mesafe (m)
//   island { island }                   → bir adaya ayak bas
//   slay { enemy?, island?, amount }    → saldırgan canlı öldür
//   boss { boss }                       → ada muhafızını yen
//
// marker: hedefin pusula ve ekranda gösterilmesi
//   { resource: 'fiber_bush' } en yakın kaynak | { landmark: 'wreck' } | { landmarks: [...] } | { region: 'lake' }
//   { animal: 'sheep' } en yakın hayvan (animal: true → herhangi biri)
//   { island: 'desert' } adanın varış sahili | { enemy: 'scorpion' } en yakın düşman (enemy: true → herhangi biri)
//
// rewards: { xp, items, recipes, buildings, features, perkPoints, lore }

export const QUEST_TYPES = {
  tutorial: { name: 'Öğretici', color: '#7fd1ff' },
  main: { name: 'Ana Görev', color: '#ffc857' },
  side: { name: 'Yan Görev', color: '#9be08f' },
};

export const FIRST_QUEST = 'q_explore';

export const QUESTS = {
  // ── Bölüm 1: Kazazede ────────────────────────────────────
  q_explore: {
    type: 'tutorial', title: 'Kazazede',
    desc: 'Gemin battı ve dalgalar seni bilinmeyen bir adanın kıyısına sürükledi. Önce nerede olduğunu anlamalısın.',
    hint: 'WASD ile yürü, fareyle etrafına bak. Shift ile koşabilirsin.',
    objectives: [{ type: 'walk', amount: 20, label: 'Etrafı keşfet' }],
    rewards: { xp: 20 },
    next: ['q_wreck'],
  },
  q_wreck: {
    type: 'main', title: 'Enkazdan Ne Kaldı?',
    desc: 'Geminin parçaları sahile vurmuş. Belki işe yarar bir şeyler kurtarabilirsin.',
    hint: 'Pusuladaki işareti takip et ve enkazın yanında [E] tuşuna bas.',
    objectives: [{ type: 'interact', target: 'wreck', label: 'Gemi enkazını ara' }],
    marker: { landmark: 'wreck' },
    rewards: { xp: 30, items: { berries: 3 }, features: ['map'] },
    next: ['q_fiber'],
    side: ['s_explorer'],
  },
  q_fiber: {
    type: 'tutorial', title: 'Lif Topla',
    desc: 'Hayatta kalmak için alet yapman gerekecek. Aletleri bağlamak için lif lazım.',
    hint: 'Sarımsı-yeşil lifli çalılara yaklaş ve [E] tuşuna bas.',
    objectives: [{ type: 'collect', item: 'fiber', amount: 5, label: 'Lif topla' }],
    marker: { resource: 'fiber_bush' },
    rewards: { xp: 25 },
    next: ['q_wood'],
    side: ['s_berries'],
  },
  q_wood: {
    type: 'tutorial', title: 'Odun Topla',
    desc: 'Henüz ağaç kesecek bir aletin yok. Ama yerde bolca kuru dal var.',
    hint: 'Yerdeki kuru dalları [E] ile topla.',
    objectives: [{ type: 'collect', item: 'wood', amount: 10, label: 'Odun topla' }],
    marker: { resource: 'stick' },
    rewards: { xp: 30, features: ['crafting'] },
    next: ['q_axe'],
    side: ['s_lake'],
  },
  q_axe: {
    type: 'tutorial', title: 'İlk Aletin',
    desc: 'Odun, taş ve lifle basit bir balta yapabilirsin.',
    hint: 'Sahildeki çakıl taşlarını topla, sonra [C] ile Üretim menüsünü aç.',
    objectives: [
      { type: 'collect', item: 'stone', amount: 3, label: 'Taş topla', marker: { resource: 'pebble' } },
      { type: 'craft', item: 'stone_axe', amount: 1, label: 'Taş Balta üret' },
    ],
    rewards: { xp: 40 },
    next: ['q_tree'],
  },
  q_tree: {
    type: 'tutorial', title: 'Ağaç Kes',
    desc: 'Artık bir baltan var. Ağaçlar çok daha fazla odun verir.',
    hint: 'Bir ağaca yaklaş, [E] veya sol tık ile vur. Basılı tutarsan vurmaya devam edersin.',
    objectives: [{ type: 'fell', group: 'tree', amount: 1, label: 'Bir ağaç kes' }],
    marker: { resource: 'palm_tree' },
    rewards: { xp: 40, recipes: ['stone_pickaxe', 'stone_knife'] },
    next: ['q_stone'],
    side: ['s_coconut', 's_lumberjack'],
  },
  q_stone: {
    type: 'tutorial', title: 'Taş Topla',
    desc: 'Daha sağlam aletler ve yapılar için taşa ihtiyacın olacak.',
    hint: 'Çakıl taşlarını elle toplayabilirsin.',
    objectives: [{ type: 'collect', item: 'stone', amount: 10, label: 'Taş topla' }],
    marker: { resource: 'pebble' },
    rewards: { xp: 30 },
    next: ['q_pickaxe'],
  },
  q_pickaxe: {
    type: 'tutorial', title: 'Taş Kazma',
    desc: 'Büyük kayaları kırmak için bir kazmaya ihtiyacın var.',
    hint: '[C] Üretim menüsünden Taş Kazma üret.',
    objectives: [{ type: 'craft', item: 'stone_pickaxe', amount: 1, label: 'Taş Kazma üret' }],
    rewards: { xp: 40, features: ['building'], buildings: ['campfire'], recipes: ['torch', 'bandage'] },
    next: ['q_campfire'],
    side: ['s_miner'],
  },
  q_campfire: {
    type: 'tutorial', title: 'Ateş Yak',
    desc: 'Ateş; sıcaklık, ışık ve pişmiş yemek demek. Artık inşa edebilirsin.',
    hint: '[B] ile İnşa menüsünü aç, Kamp Ateşi\'ni seç. Sol tık yerleştirir, [R] döndürür.',
    objectives: [{ type: 'build', building: 'campfire', amount: 1, label: 'Kamp ateşi kur' }],
    rewards: { xp: 50, recipes: ['cooked_fish', 'berry_skewer', 'cooked_meat'] },
    next: ['q_cook'],
  },
  q_cook: {
    type: 'tutorial', title: 'İlk Yemeğin',
    desc: 'Çiğ yemek seni hasta edebilir. Ateşin başında bir şeyler pişir.',
    hint: 'Sığ sulardaki balık sürülerinden balık tut ya da meyve topla. Sonra kamp ateşinde [E] ile pişir.',
    objectives: [{ type: 'cook', amount: 1, label: 'Kamp ateşinde yemek pişir' }],
    marker: { resource: 'fish_spot' },
    rewards: { xp: 50, buildings: ['hut'] },
    next: ['q_shelter'],
    side: ['s_fisher'],
  },
  q_shelter: {
    type: 'main', title: 'İlk Sığınağın',
    desc: 'Hava kararmadan kendine bir sığınak kur. Geceleri bu adada yalnız olmayabilirsin…',
    hint: '[B] İnşa menüsünden Küçük Kulübe\'yi seç. Düz bir zemin bul; önizleme kırmızıysa bir şeyle çakışıyordur.',
    objectives: [
      { type: 'collect', item: 'wood', amount: 20, label: 'Odun topla' },
      { type: 'collect', item: 'stone', amount: 10, label: 'Taş topla' },
      { type: 'collect', item: 'fiber', amount: 8, label: 'Lif topla' },
      { type: 'build', building: 'hut', amount: 1, label: 'Küçük Kulübe inşa et' },
    ],
    rewards: { xp: 100, buildings: ['chest', 'bed'], recipes: ['wool_blanket'] },
    next: ['q_hunt'],
  },
  q_hunt: {
    type: 'main', title: 'Av Zamanı',
    desc: 'Çayırlarda otlayan inekler, koyunlar ve tavuklar var. Et, deri, yün ve tüy hayatta kalmanın anahtarı olacak.',
    hint: 'Taş Bıçak üret. Bir hayvanı avla (sol tık), sonra bıçakla [E] parçala. Pişirmek için kamp ateşini kullan.',
    objectives: [
      { type: 'craft', item: 'stone_knife', amount: 1, label: 'Taş Bıçak üret' },
      { type: 'kill', amount: 1, label: 'Bir hayvan avla', marker: { animal: true } },
      { type: 'butcher', amount: 1, label: 'Avını bıçakla parçala' },
    ],
    rewards: { xp: 90 },
    next: ['q_bed'],
    side: ['s_hunter'],
  },
  q_bed: {
    type: 'main', title: 'Sıcak Bir Yatak',
    desc: 'Kulüben hazır ama çıplak zeminde uyunmaz. Koyun yününden bir battaniye ör ve kendine bir yatak yap.',
    hint: 'Koyun avlayıp yününü al. [C] ile Yün Battaniye ör, sonra [B] ile Yatak kur — kulübenin içine koymayı unutma.',
    objectives: [
      { type: 'collect', item: 'wool', amount: 3, label: 'Yün topla', marker: { animal: 'sheep' } },
      { type: 'craft', item: 'wool_blanket', amount: 1, label: 'Yün Battaniye ör' },
      { type: 'build', building: 'bed', amount: 1, label: 'Yatak kur' },
    ],
    rewards: { xp: 100 },
    next: ['q_first_night'],
  },
  q_first_night: {
    type: 'main', title: 'İlk Gece',
    desc: 'Erzakını sakla, ateşin yanında kal ve sabahı bekle. Karanlıkta bir şeylerin seni izlediğini hissediyorsun.',
    hint: 'Sandık kur. Akşam 19:00\'dan sonra yatağında [E] ile uyuyabilirsin.',
    objectives: [
      { type: 'build', building: 'chest', amount: 1, label: 'Sandık kur' },
      { type: 'sleep', amount: 1, label: 'Kulübende uyu ve sabahı bekle' },
    ],
    rewards: { xp: 120, buildings: ['workbench'] },
    next: ['q_workbench'],
    side: ['s_survivor'],
  },
  q_workbench: {
    type: 'tutorial', title: 'Zanaatkâr',
    desc: 'Bir çalışma masası, çok daha gelişmiş eşyalar üretmeni sağlar.',
    hint: '[B] İnşa menüsünden Çalışma Masası kur. [T] ile teknoloji ağacına göz at.',
    objectives: [{ type: 'build', building: 'workbench', amount: 1, label: 'Çalışma Masası kur' }],
    rewards: { xp: 60, recipes: ['stone_spear'], features: ['techtree'] },
    next: ['q_old_camp'],
    side: ['s_backpack', 's_vines', 's_sailor'],
  },
  q_old_camp: {
    type: 'main', title: 'Ormandaki Bayrak',
    desc: 'Ormanın derinliklerinde, ağaçların üzerinden yükselen yırtık bir bayrak gözüne çarpıyor. Biri burada kamp kurmuş olmalı.',
    hint: 'Pusuladaki işareti takip et. Ormanda dikkatli ol.',
    objectives: [{ type: 'discover', landmark: 'old_camp', label: 'Terk edilmiş kampı bul' }],
    marker: { landmark: 'old_camp' },
    rewards: { xp: 100 },
    next: ['q_runes'],
  },
  q_runes: {
    type: 'main', title: 'Antik Semboller',
    desc: 'Günlükte adanın üç ucunda sembollü taşlardan bahsediliyor: Dalga, Kök ve Alev.',
    hint: 'Haritada [M] işaretlenen sembol taşlarını bul ve incele.',
    objectives: [{ type: 'collect', item: 'rune_shard', amount: 3, label: 'Antik sembol parçası topla' }],
    marker: { landmarks: ['rune_wave', 'rune_root', 'rune_flame'] },
    rewards: { xp: 200 },
    next: ['q_sealed_door'],
  },
  q_sealed_door: {
    type: 'main', title: 'Mühürlü Kapı',
    desc: 'Üç sembol bir araya geldi. Dağın altındaki kapı seni bekliyor.',
    hint: 'Dağın güney eteğindeki taş kapıya git ve [E] ile incele.',
    objectives: [{ type: 'interact', target: 'sealed_door', label: 'Mühürlü kapıyı incele' }],
    marker: { landmark: 'sealed_door' },
    rewards: { xp: 150 },
    next: ['q_cave'],
    chapterEnd: 1,
  },

  // ── Bölüm 2: Derinlikler ─────────────────────────────────
  q_cave: {
    type: 'main', title: 'Adanın Derinlikleri',
    desc: 'Kapının ardından gelen çekiç sesi… Dağın batı yamacında, rüzgârın içine çekildiği karanlık bir yarık olmalı.',
    hint: 'Dağın batı eteğindeki mağara girişini bul. İçerisi karanlık — yanına meşale al.',
    objectives: [
      { type: 'discover', landmark: 'cave_entrance', label: 'Mağara girişini bul' },
      { type: 'region', region: 'cave', label: 'Mağaraya gir' },
    ],
    marker: { landmark: 'cave_entrance' },
    rewards: { xp: 120 },
    next: ['q_cave_ore'],
    side: ['s_crystals'],
  },
  q_cave_ore: {
    type: 'main', title: 'Demir Damarı',
    desc: 'Mağara duvarlarında koyu, paslı damarlar var. Demir! Ve yanında kömür.',
    hint: 'Kazmanla demir ve kömür damarlarını kaz.',
    objectives: [
      { type: 'collect', item: 'iron_ore', amount: 4, label: 'Demir cevheri topla', marker: { resource: 'iron_ore' } },
      { type: 'collect', item: 'coal', amount: 4, label: 'Kömür topla', marker: { resource: 'coal_ore' } },
    ],
    rewards: { xp: 160 },
    next: ['q_miner'],
  },
  q_miner: {
    type: 'main', title: 'Madencinin İzleri',
    desc: 'Mağaranın en derin odasında birinin kamp kurduğu belli. Kazmalar, bir fener… ve bir defter.',
    hint: 'Mağaranın doğu odasındaki madenci kampını bul ve defteri oku.',
    objectives: [{ type: 'interact', target: 'miner_camp', label: 'Madencinin defterini oku' }],
    marker: { landmark: 'miner_camp' },
    rewards: { xp: 220, perkPoints: 1, recipes: ['forest_heart'] },
    next: ['q_forest_heart'],
    chapterEnd: 2,
  },

  // ── Bölüm 3: Kayıp Adalar ───────────────────────────────
  q_forest_heart: {
    type: 'main', title: 'Orman Kalbi',
    desc: 'Madencinin defteri ormandaki Kadim Sunak\'tan bahsediyor: "Muhafızı uyandıran, denizin ötesindeki yolu bulur." Sunağı uyandırmak için kristalle sarmaşığı birleştiren bir tohum gerek.',
    hint: 'Mağaradan kristal, ormandan sarmaşık topla. Çalışma Masası\'nda Orman Kalbi üret.',
    objectives: [
      { type: 'collect', item: 'crystal', amount: 3, label: 'Kristal topla', marker: { resource: 'crystal_node' } },
      { type: 'collect', item: 'vine', amount: 4, label: 'Sarmaşık topla', marker: { resource: 'vine_tangle' } },
      { type: 'craft', item: 'forest_heart', amount: 1, label: 'Orman Kalbi üret' },
    ],
    rewards: { xp: 150 },
    next: ['q_guardian'],
  },
  q_guardian: {
    type: 'main', title: 'Ormanın Muhafızı',
    desc: 'Ormanın batısında, dikili taşların ortasında kökleri sarılmış bir sunak var. Orman Kalbi\'ni oraya koyduğunda adanın kadim muhafızı uyanacak.',
    hint: 'Sunağa Orman Kalbi\'ni koy [E]. Yerdeki kırmızı halkalardan uzak dur — dolduğunda vuruş gelir! Mızrak ya da bıçakla saldır.',
    objectives: [
      { type: 'discover', landmark: 'guardian_altar', label: 'Kadim Sunak\'ı bul' },
      { type: 'boss', boss: 'guardian', label: 'Orman Muhafızı\'nı yen' },
    ],
    marker: { landmark: 'guardian_altar' },
    rewards: { xp: 200, buildings: ['furnace'] },
    next: ['q_sail_desert'],
    side: ['s_boatwright'],
  },
  q_sail_desert: {
    type: 'main', title: 'Altın Kumlar',
    desc: 'Muhafızın kalbinden çıkan seyir haritası güneybatıdaki bir adayı gösteriyor. Sal oraya dayanmaz — yelkenli bir tekne gerek.',
    hint: 'Tekne üret (Seviye 8, Çalışma Masası), suya indir ve pusuladaki işareti izle. Açık denizde rüzgâr tekneyi hızlandırır.',
    objectives: [{ type: 'island', island: 'desert', label: 'Çöl Adası\'na ulaş' }],
    marker: { island: 'desert' },
    rewards: { xp: 200, recipes: ['copper_ingot', 'copper_pickaxe', 'copper_scimitar'] },
    next: ['q_furnace'],
    side: ['s_scorpions', 's_oasis'],
  },
  q_furnace: {
    type: 'main', title: 'Ateş ve Bakır',
    desc: 'Kumtaşı kayalıklarda yeşil damarlı bakır cevheri var. Bir fırın kurup eritirsen gerçek metal aletler yapabilirsin.',
    hint: 'Kumtaşı ve bakır cevheri kaz. [B] ile Fırın kur, sonra fırında Bakır Külçe erit.',
    objectives: [
      { type: 'collect', item: 'sandstone', amount: 12, label: 'Kumtaşı topla', marker: { resource: 'sandstone_rock' } },
      { type: 'build', building: 'furnace', amount: 1, label: 'Fırın kur' },
      { type: 'collect', item: 'copper_ore', amount: 6, label: 'Bakır cevheri topla', marker: { resource: 'copper_rock' } },
      { type: 'craft', item: 'copper_ingot', amount: 3, label: 'Bakır Külçe erit' },
    ],
    rewards: { xp: 220, recipes: ['chitin_armor'] },
    next: ['q_scimitar'],
  },
  q_scimitar: {
    type: 'main', title: 'Çölün Kılıcı',
    desc: 'Kum tepelerinde dolaşan akrepler ve sırtlanlar taş mızrakla baş edilecek gibi değil. Bakır bir pala dövmenin zamanı.',
    hint: 'Fırında Bakır Pala üret. Akrepler zehirler — vurmadan önce kuyruklarını kaldırırlar, o an geri çekil.',
    objectives: [
      { type: 'craft', item: 'copper_scimitar', amount: 1, label: 'Bakır Pala üret' },
      { type: 'slay', enemy: 'scorpion', amount: 3, label: 'Çöl akrebi öldür', marker: { enemy: 'scorpion' } },
    ],
    rewards: { xp: 260, recipes: ['scorpion_sigil'] },
    next: ['q_sand_king'],
  },
  q_sand_king: {
    type: 'main', title: 'Kum Kralı',
    desc: 'Tapınağın sunağında akrep oymaları var. Akrep iğnesi ve bakırla bir mühür yapıp sunağa koyarsan tapınağın sahibi uyanacak.',
    hint: 'Fırında Akrep Mührü üret ve Kum Tapınağı\'ndaki sunağa koy. Kum Kralı kuma dalar — ayağının altındaki halkaya dikkat!',
    objectives: [
      { type: 'craft', item: 'scorpion_sigil', amount: 1, label: 'Akrep Mührü üret' },
      { type: 'discover', landmark: 'sand_temple', label: 'Kum Tapınağı\'nı bul' },
      { type: 'boss', boss: 'sand_king', label: 'Kum Kralı\'nı yen' },
    ],
    marker: { landmark: 'sand_temple' },
    rewards: { xp: 300, recipes: ['fur_coat', 'iron_ingot'] },
    next: ['q_sail_ice'],
  },
  q_sail_ice: {
    type: 'main', title: 'Buzların Ötesi',
    desc: 'Kum Kralı\'nın tacındaki harita kuzeybatıda, buzlarla kaplı bir adayı gösteriyor. Oranın soğuğu öldürücü olabilir.',
    hint: 'Yanına odun ve taş al: buz adasında ateşin yanından ayrılma. Kürk Mont seni soğuktan korur.',
    objectives: [{ type: 'island', island: 'ice', label: 'Buz Adası\'na ulaş' }],
    marker: { island: 'ice' },
    rewards: { xp: 250 },
    next: ['q_fur'],
    side: ['s_wisps'],
  },
  q_fur: {
    type: 'main', title: 'Kurt Kürkü',
    desc: 'Buzulun rüzgârı iliklerine işliyor. Kar kurtlarının kalın kürkünden bir mont dikebilirsin.',
    hint: 'Kurtlar sürü halinde gezer — tek tek çek. Kürkle Çalışma Masası\'nda Kürk Mont dik ve kuşan (sağ tık).',
    objectives: [
      { type: 'slay', enemy: 'wolf', amount: 3, label: 'Kar kurdu öldür', marker: { enemy: 'wolf' } },
      { type: 'craft', item: 'fur_coat', amount: 1, label: 'Kürk Mont dik' },
    ],
    rewards: { xp: 280, recipes: ['frost_sword'] },
    next: ['q_frost_sword'],
  },
  q_frost_sword: {
    type: 'main', title: 'Buz Kılıcı',
    desc: 'Donmuş kamptaki notlar, buz cinlerinin özünü demirle birleştiren bir kılıçtan bahsediyor.',
    hint: 'Kayalıklardaki demir damarlarını kaz, fırında kömürle Demir Külçe erit. Buz cinlerinden buz özü topla.',
    objectives: [
      { type: 'craft', item: 'iron_ingot', amount: 4, label: 'Demir Külçe erit' },
      { type: 'collect', item: 'frost_core', amount: 1, label: 'Buz özü topla', marker: { enemy: 'ice_wisp' } },
      { type: 'craft', item: 'frost_sword', amount: 1, label: 'Buz Kılıcı dövün' },
    ],
    rewards: { xp: 320, recipes: ['frost_heart'] },
    next: ['q_frost_giant'],
  },
  q_frost_giant: {
    type: 'main', title: 'Uyuyan Dev',
    desc: 'Buzul sunağının ardında, buzun içinde dev bir gölge yatıyor. Buz özlerinden bir kalp yaparsan uyanacak.',
    hint: 'Buz Kalbi üret ve Buzul Sunağı\'na koy. Dev, kaya fırlatır — düştüğü yeri gösteren halkadan kaç!',
    objectives: [
      { type: 'craft', item: 'frost_heart', amount: 1, label: 'Buz Kalbi üret' },
      { type: 'boss', boss: 'frost_giant', label: 'Buz Devi\'ni yen' },
    ],
    marker: { landmark: 'frost_altar' },
    rewards: { xp: 380, recipes: ['obsidian_blade', 'ember_armor'] },
    next: ['q_sail_volcano'],
  },
  q_sail_volcano: {
    type: 'main', title: 'Ateş Dağı',
    desc: 'Devin göğsündeki buzda donmuş harita, kuzeydoğuda dumanı tüten bir volkanı gösteriyor. Takımadanın son sırrı orada.',
    hint: 'Lav nehirlerine basma! Volkanda çok çabuk susarsın — yanına su ve meyve al.',
    objectives: [{ type: 'island', island: 'volcano', label: 'Volkan Adası\'na ulaş' }],
    marker: { island: 'volcano' },
    rewards: { xp: 300 },
    next: ['q_obsidian'],
    side: ['s_ember'],
  },
  q_obsidian: {
    type: 'main', title: 'Obsidyen',
    desc: 'Lavın soğuduğu yerlerde cam gibi siyah taşlar var. Ancak bakır bir kazma onları kırabilir.',
    hint: 'Bakır Kazma ile obsidyen kaz. Ateş kertenkelelerinden pul, lav balçıklarından magma çekirdeği topla.',
    objectives: [
      { type: 'collect', item: 'obsidian', amount: 8, label: 'Obsidyen kaz', marker: { resource: 'obsidian_rock' } },
      { type: 'craft', item: 'obsidian_blade', amount: 1, label: 'Obsidyen Kılıç dövün' },
    ],
    rewards: { xp: 400, recipes: ['fire_sigil'] },
    next: ['q_lava_golem'],
  },
  q_lava_golem: {
    type: 'main', title: 'Volkanın Kalbi',
    desc: 'Krater yamacındaki sunak, takımadanın son muhafızını bekliyor. Bu savaşı kazanırsan Kayıp Adalar\'ın sırrı çözülecek.',
    hint: 'Fırında Ateş Mührü üret ve Ateş Sunağı\'na koy. Gökten yağan ateşi gösteren halkalardan ve lav birikintilerinden uzak dur.',
    objectives: [
      { type: 'craft', item: 'fire_sigil', amount: 1, label: 'Ateş Mührü üret' },
      { type: 'boss', boss: 'lava_golem', label: 'Lav Golemi\'ni yen' },
    ],
    marker: { landmark: 'fire_altar' },
    rewards: { xp: 600, perkPoints: 2 },
    next: [],
    chapterEnd: 3,
  },

  // ── Yan görevler ─────────────────────────────────────────
  s_explorer: {
    type: 'side', title: 'Kaşif Ruhu',
    desc: 'Adanın her köşesini görmek istiyorsun.',
    objectives: [{ type: 'regions', amount: 5, label: 'Farklı bölge keşfet' }],
    rewards: { xp: 120, perkPoints: 1 },
  },
  s_berries: {
    type: 'side', title: 'Tatlı Meyveler',
    desc: 'Meyve çalıları hızlı bir atıştırmalık sunar.',
    objectives: [{ type: 'collect', item: 'berries', amount: 8, label: 'Yaban meyvesi topla' }],
    marker: { resource: 'berry_bush' },
    rewards: { xp: 40 },
  },
  s_lake: {
    type: 'side', title: 'Tatlı Su',
    desc: 'Deniz suyu içilmez. Adanın içlerinde bir tatlı su kaynağı olmalı.',
    objectives: [
      { type: 'region', region: 'lake', label: 'Tatlı su gölünü bul' },
      { type: 'drink', amount: 1, label: 'Gölden su iç' },
    ],
    marker: { region: 'lake' },
    rewards: { xp: 50 },
  },
  s_coconut: {
    type: 'side', title: 'Hindistan Cevizi',
    desc: 'Palmiyelerin dibine düşen hindistan cevizleri hem yemek hem su.',
    objectives: [{ type: 'collect', item: 'coconut', amount: 3, label: 'Hindistan cevizi topla' }],
    marker: { resource: 'coconut' },
    rewards: { xp: 40 },
  },
  s_lumberjack: {
    type: 'side', title: 'Oduncu',
    desc: 'Büyük bir üs için çok odun gerekecek.',
    objectives: [{ type: 'fell', group: 'tree', amount: 8, label: 'Ağaç kes' }],
    rewards: { xp: 120, perkPoints: 1 },
  },
  s_miner: {
    type: 'side', title: 'Taş Kırıcı',
    desc: 'Kazmanı dene.',
    objectives: [{ type: 'fell', group: 'rock', amount: 5, label: 'Kaya kır' }],
    marker: { resource: 'rock' },
    rewards: { xp: 100 },
  },
  s_fisher: {
    type: 'side', title: 'Balıkçı',
    desc: 'Deniz cömerttir — sabırlı olana.',
    objectives: [{ type: 'collect', item: 'raw_fish', amount: 5, label: 'Balık tut' }],
    marker: { resource: 'fish_spot' },
    rewards: { xp: 80 },
  },
  s_survivor: {
    type: 'side', title: 'Hayatta Kalan',
    desc: 'Günleri saymaya başladın.',
    objectives: [{ type: 'day', amount: 3, label: '3. güne ulaş' }],
    rewards: { xp: 150 },
  },
  s_hunter: {
    type: 'side', title: 'Usta Avcı',
    desc: 'Et ve deri her zaman lazım.',
    objectives: [{ type: 'kill', amount: 5, label: 'Hayvan avla', marker: { animal: true } }],
    rewards: { xp: 150, perkPoints: 1 },
  },
  s_vines: {
    type: 'side', title: 'Sarmaşık Halat',
    desc: 'Ormandaki sarmaşıklar bükülünce sağlam bir halat olur.',
    objectives: [
      { type: 'collect', item: 'vine', amount: 6, label: 'Sarmaşık topla', marker: { resource: 'vine_tangle' } },
      { type: 'craft', item: 'rope', amount: 2, label: 'Halat ör' },
    ],
    rewards: { xp: 80 },
  },
  s_sailor: {
    type: 'side', title: 'Denize Açıl',
    desc: 'Seviye 4\'te çalışma masasında bir sal yapabilirsin. Kıyı boyunca kürek çekmek adayı yeni bir gözle görmeni sağlar.',
    objectives: [
      { type: 'craft', item: 'raft', amount: 1, label: 'Sal üret (Seviye 4)' },
      { type: 'sail', amount: 150, label: 'Salla kürek çek' },
    ],
    rewards: { xp: 150 },
  },
  s_crystals: {
    type: 'side', title: 'Karanlıkta Işık',
    desc: 'Mağaranın kristalleri hiç sönmüyor. Bir fener yapsan üssün geceleri de aydınlık olur.',
    objectives: [{ type: 'collect', item: 'crystal', amount: 2, label: 'Kristal topla', marker: { resource: 'crystal_node' } }],
    rewards: { xp: 120 },
  },
  s_boatwright: {
    type: 'side', title: 'Gemi Ustası',
    desc: 'Denizin ötesine geçmek için sağlam bir tekne gerekecek.',
    objectives: [{ type: 'craft', item: 'boat', amount: 1, label: 'Tekne üret (Seviye 8)' }],
    rewards: { xp: 150 },
  },
  s_scorpions: {
    type: 'side', title: 'Çöl Avcısı',
    desc: 'Çölün yırtıcıları kervan yolunu tehdit ediyor.',
    objectives: [{ type: 'slay', island: 'desert', amount: 8, label: 'Çöl canlısı öldür', marker: { enemy: true } }],
    rewards: { xp: 250, perkPoints: 1 },
  },
  s_oasis: {
    type: 'side', title: 'Serap Değil',
    desc: 'Kumların ortasında palmiyeler… gerçek bir vaha olabilir mi?',
    objectives: [
      { type: 'region', region: 'd_oasis', label: 'Vahayı bul' },
      { type: 'drink', amount: 1, label: 'Vahadan su iç' },
    ],
    rewards: { xp: 120, items: { cactus_fruit: 4 } },
  },
  s_wisps: {
    type: 'side', title: 'Soğuk Işıklar',
    desc: 'Buzulun tepelerinde süzülen soluk ışıklar yolcuları dondururmuş.',
    objectives: [{ type: 'slay', enemy: 'ice_wisp', amount: 4, label: 'Buz cini söndür', marker: { enemy: 'ice_wisp' } }],
    rewards: { xp: 300, perkPoints: 1 },
  },
  s_ember: {
    type: 'side', title: 'Ateşe Dayanıklı',
    desc: 'Volkanın sıcağına ancak ateş pullu bir zırh dayanır.',
    objectives: [{ type: 'craft', item: 'ember_armor', amount: 1, label: 'Ateş Zırhı üret' }],
    rewards: { xp: 300 },
  },
  s_backpack: {
    type: 'side', title: 'Daha Fazla Yer',
    desc: 'Envanterin dar gelmeye başladı. Seviye 3\'te çalışma masasında bir sırt çantası örebilirsin.',
    objectives: [{ type: 'craft', item: 'fiber_backpack', amount: 1, label: 'Lif Sırt Çantası üret' }],
    rewards: { xp: 60 },
  },
};
