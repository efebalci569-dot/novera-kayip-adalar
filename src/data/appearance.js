// Karakter görünümü seçenekleri. Karakter düzenleyici (menü) ve PlayerModel buradan okur.
// Yeni bir saç/sakal modeli eklemek için buraya bir kayıt, PlayerModel.js içindeki
// HAIR_BUILDERS / BEARD_BUILDERS'a da aynı anahtarla bir şekil fonksiyonu eklemek yeterli.

export const GENDERS = {
  male: { name: 'Erkek', icon: '♂' },
  female: { name: 'Kadın', icon: '♀' },
};

export const SKIN_TONES = ['#f7d7bd', '#efc39f', '#e2ad85', '#cf9a6e', '#b07a52', '#8d5b3a', '#6a4129', '#4a2c1c'];

export const HAIR_COLORS = [
  '#16110e', '#3b2a1d', '#5c3b22', '#8a5a32', '#b07d48', '#d9b26c', '#efd89a',
  '#a3412a', '#d0652f', '#8f8c88', '#e9e6df', '#3a5fc0', '#c2477f', '#3f8f5a',
];

export const EYE_COLORS = ['#3d2516', '#6b4428', '#8a6a35', '#3f8048', '#3b78c4', '#79a7d6', '#6f7b84', '#7a3fb0'];

export const SHIRT_COLORS = ['#ece5d2', '#c9553f', '#4d7fb5', '#5b8f4a', '#e0b54a', '#7a5aa0', '#3d3d42', '#e28fae', '#3fa3a0', '#d77a2f'];

export const PANTS_COLORS = ['#4d6c8c', '#6b5a43', '#3b3f48', '#8a7a5a', '#7a2f2f', '#e8e2d2', '#3e5a3a', '#2b3550'];

// Saç modelleri (gender: o cinsiyette varsayılan listede öne çıkar; hepsi iki cinsiyet için de seçilebilir)
export const HAIR_STYLES = {
  short: { name: 'Kısa' },
  side: { name: 'Yana Taralı' },
  spiky: { name: 'Kirpi' },
  curly: { name: 'Kıvırcık' },
  mohawk: { name: 'İbik' },
  afro: { name: 'Afro' },
  long: { name: 'Uzun' },
  ponytail: { name: 'At Kuyruğu' },
  bun: { name: 'Topuz' },
  braid: { name: 'Örgü' },
  bob: { name: 'Küt' },
  bald: { name: 'Kel' },
};

export const BEARD_STYLES = {
  none: { name: 'Yok' },
  stubble: { name: 'Kirli Sakal' },
  mustache: { name: 'Bıyık' },
  goatee: { name: 'Keçi Sakalı' },
  full: { name: 'Tam Sakal' },
  long: { name: 'Uzun Sakal' },
};

export function defaultAppearance(gender = 'male') {
  return gender === 'female'
    ? { gender: 'female', skin: SKIN_TONES[2], hairStyle: 'ponytail', hairColor: HAIR_COLORS[2], eyeColor: EYE_COLORS[3], beard: 'none', shirt: SHIRT_COLORS[0], pants: PANTS_COLORS[0] }
    : { gender: 'male', skin: SKIN_TONES[2], hairStyle: 'short', hairColor: HAIR_COLORS[1], eyeColor: EYE_COLORS[1], beard: 'stubble', shirt: SHIRT_COLORS[0], pants: PANTS_COLORS[0] };
}

const pick = (list) => list[Math.floor(Math.random() * list.length)];

export function randomAppearance(gender = Math.random() < 0.5 ? 'male' : 'female') {
  const femaleHair = ['long', 'ponytail', 'bun', 'braid', 'bob', 'curly', 'afro', 'short'];
  const maleHair = ['short', 'side', 'spiky', 'curly', 'mohawk', 'afro', 'long', 'bald', 'bun'];
  const natural = HAIR_COLORS.slice(0, 11);
  return {
    gender,
    skin: pick(SKIN_TONES),
    hairStyle: pick(gender === 'female' ? femaleHair : maleHair),
    hairColor: Math.random() < 0.9 ? pick(natural) : pick(HAIR_COLORS),
    eyeColor: pick(EYE_COLORS),
    beard: gender === 'female' ? 'none' : pick(Object.keys(BEARD_STYLES)),
    shirt: pick(SHIRT_COLORS),
    pants: pick(PANTS_COLORS),
  };
}

/** Eksik/bozuk alanları varsayılanlarla tamamlar (ağdan ya da eski kayıttan gelen veriler için). */
export function sanitizeAppearance(a) {
  const base = defaultAppearance(a?.gender === 'female' ? 'female' : 'male');
  const out = { ...base };
  if (!a || typeof a !== 'object') return out;
  const color = (v, fallback) => (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? v : fallback);
  out.skin = color(a.skin, base.skin);
  out.hairColor = color(a.hairColor, base.hairColor);
  out.eyeColor = color(a.eyeColor, base.eyeColor);
  out.shirt = color(a.shirt, base.shirt);
  out.pants = color(a.pants, base.pants);
  out.hairStyle = HAIR_STYLES[a.hairStyle] ? a.hairStyle : base.hairStyle;
  out.beard = BEARD_STYLES[a.beard] ? a.beard : base.beard;
  return out;
}
