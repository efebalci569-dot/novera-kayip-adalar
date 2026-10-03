// Dokunmatik cihazlarda ipucu/bildirim metinlerindeki klavye-fare tuşlarını
// ekrandaki düğmelerin adlarıyla değiştirir ("[E] ile pişir" → "Eylem düğmesiyle pişir").

const RULES = [
  ['WASD ile yürü, fareyle etrafına bak. Shift ile koşabilirsin.', 'Ekranın solunu sürükleyerek yürü, sağını kaydırarak etrafına bak. Koş düğmesiyle koşabilirsin.'],
  [/\[(\d)\] tuşuna bas/g, '$1. slota dokun'],
  [/\[E\] tuşuna bas/g, 'Eylem düğmesine bas'],
  [/\[E\] \/ sol tık ile/gi, 'Eylem düğmesiyle'],
  [/\[Sol tık\] ile indir/gi, 'Yerleştir düğmesiyle indir'],
  [/Sol tık yerleştirir, \[R\] döndürür\./g, 'Yerleştir ve Döndür düğmelerini kullan.'],
  [/\[R\] döndürür\./g, 'Döndür düğmesi çevirir.'],
  [/\[(E|Sol tık)\] ile/gi, 'Eylem düğmesiyle'],
  [/\[Sağ tık\] ile/gi, 'Kullan düğmesiyle'],
  [/\(sol tık\)/gi, '(Eylem)'],
  [/\(sağ tık\)/gi, '(Kullan)'],
  [/\(1–5 ya da fare tekerleği\)/g, '(alttaki slota dokun)'],
  [/hızlı slota \(1–5\) sürükle/g, '“Taşı” ile hızlı slota koy'],
  [/\(I\)/g, '(🎒)'],
  [/\[C\]/g, '🔨'],
  [/\[B\]/g, '🏗️'],
  [/\[M\]/g, '🗺️'],
  [/\[T\]/g, '🌳'],
  [/\[K\]/g, '✨'],
  [/\[J\]/g, '📖'],
  [/\[I\]/g, '🎒'],
  [/\[E\]/g, '(Eylem)'],
];

export function touchText(text) {
  if (typeof text !== 'string') return text;
  let out = text;
  for (const [from, to] of RULES) out = out.replaceAll(from, to);
  return out;
}

/** Ayar açıksa metni dokunmatiğe uyarlar, değilse olduğu gibi bırakır. */
export function forInput(game, text) {
  return game.settings.touchEnabled ? touchText(text) : text;
}
