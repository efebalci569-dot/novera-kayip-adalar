// Ada bölgeleri. Island.region(x, z) bu kimliklerden birini döndürür.

export const REGIONS = {
  beach: { name: 'Sahil', subtitle: 'Kazazedeler Kıyısı', color: '#efdca6', discoverable: true },
  meadow: { name: 'Çayırlar', subtitle: 'Rüzgârlı Düzlükler', color: '#8cc152', discoverable: true },
  forest: { name: 'Orman', subtitle: 'Fısıldayan Ağaçlar', color: '#4e8f3a', discoverable: true },
  mountain: { name: 'Dağ Eteği', subtitle: 'Sessiz Zirve', color: '#9a948a', discoverable: true },
  lake: { name: 'Tatlı Su Gölü', subtitle: 'Berrak Kaynak', color: '#5fb8e8', discoverable: true },
  cave: { name: 'Mağara', subtitle: 'Yankılanan Derinlikler', color: '#4b4f5c', discoverable: true },
  sea: { name: 'Açık Deniz', subtitle: 'Bir tekne olmadan uzaklaşma', color: '#2a6f9e', discoverable: false },

  // ── Çöl Adası ──
  d_beach: { name: 'Altın Kıyı', subtitle: 'Çöl Adası', color: '#f0d39a', discoverable: true, island: 'desert' },
  d_dunes: { name: 'Kum Denizi', subtitle: 'Kavurucu Tepeler', color: '#e2b674', discoverable: true, island: 'desert' },
  d_mesa: { name: 'Kızıl Kayalıklar', subtitle: 'Rüzgârın Oyduğu Taşlar', color: '#b8653f', discoverable: true, island: 'desert' },
  d_oasis: { name: 'Vaha', subtitle: 'Kumların Ortasında Hayat', color: '#4fc9b6', discoverable: true, island: 'desert' },
  // ── Buz Adası ──
  i_shore: { name: 'Buzlu Kıyı', subtitle: 'Buz Adası', color: '#b9c3cc', discoverable: true, island: 'ice' },
  i_tundra: { name: 'Tundra', subtitle: 'Rüzgârın Süpürdüğü Kar', color: '#e8eef2', discoverable: true, island: 'ice' },
  i_forest: { name: 'Karlı Orman', subtitle: 'Kurtların Yurdu', color: '#3f6b55', discoverable: true, island: 'ice' },
  i_peak: { name: 'Buzul', subtitle: 'Donmuş Zirve', color: '#cde5f4', discoverable: true, island: 'ice' },
  i_lake: { name: 'Donmuş Göl', subtitle: 'Buzun Altındaki Su', color: '#9fd8ee', discoverable: true, island: 'ice' },
  // ── Volkan Adası ──
  v_beach: { name: 'Kara Kumsal', subtitle: 'Volkan Adası', color: '#3a383c', discoverable: true, island: 'volcano' },
  v_ash: { name: 'Kül Ovası', subtitle: 'Yanık Toprak', color: '#7a746e', discoverable: true, island: 'volcano' },
  v_slope: { name: 'Volkan Yamacı', subtitle: 'Lav Nehirleri', color: '#4a4442', discoverable: true, island: 'volcano' },
  v_crater: { name: 'Krater', subtitle: 'Dağın Ateşten Kalbi', color: '#c2451e', discoverable: true, island: 'volcano' },
};
