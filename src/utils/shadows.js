// Gölge düşürmeyi yalnızca yakındaki canlılarda açık tutar (uzaktakilerin gölgesi
// gölge haritasında birkaç piksel ama her biri ayrı çizim çağrısı demek).

/** root altındaki (başlangıçta gölge düşüren) parçaların gölgesini açar/kapatır. Değişiklik yoksa hiçbir şey yapmaz. */
export function setShadowCasting(root, on) {
  const ud = root.userData;
  if (ud.shadowOn === on) return;
  if (!ud.shadowMeshes) {
    const list = [];
    root.traverse((o) => {
      if (o.isMesh && o.castShadow) list.push(o);
    });
    ud.shadowMeshes = list;
  }
  ud.shadowOn = on;
  for (const m of ud.shadowMeshes) m.castShadow = on;
}

/** Canlıların gölge düşürdüğü en uzak mesafe (m). */
export const CREATURE_SHADOW_RANGE = 32;
