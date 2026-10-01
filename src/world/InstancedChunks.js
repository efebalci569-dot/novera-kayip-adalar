import * as THREE from 'three';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);

/**
 * Çok sayıda aynı nesneyi (ağaç, kaya, çalı…) dünyayı ızgara parçalarına bölerek
 * InstancedMesh'lerle çizer. Her parçanın kendi sınır küresi olduğundan kameranın
 * görmediği parçalar (ve gölge kamerası dışındakiler) hiç çizilmez.
 *
 * items: [{ variant, x, y, z, yaw, scale, sx?, sy?, sz? }]
 * Her item'a `mesh` ve `instanceIndex` atanır (sonradan matris güncellemek için);
 * assign: 'lod' verilirse `lodMesh` ve `lodIndex` atanır (aynı nesnenin düşük detaylı ikizi).
 */
export function buildChunkedInstances(group, geometries, items, material, opts = {}) {
  const { chunkSize = 120, castShadow = false, receiveShadow = false, padding = 0, name = 'inst', assign = null } = opts;
  const buckets = new Map();
  for (const it of items) {
    const key = chunkSize > 0 ? `${it.variant}|${Math.floor(it.x / chunkSize)}|${Math.floor(it.z / chunkSize)}` : `${it.variant}`;
    let b = buckets.get(key);
    if (!b) buckets.set(key, (b = { variant: it.variant, list: [] }));
    b.list.push(it);
  }
  const meshes = [];
  for (const [key, b] of buckets) {
    const mesh = new THREE.InstancedMesh(geometries[b.variant], material, b.list.length);
    mesh.name = `${name}:${key}`;
    mesh.castShadow = castShadow;
    mesh.receiveShadow = receiveShadow;
    b.list.forEach((it, i) => {
      if (assign === 'lod') {
        it.lodMesh = mesh;
        it.lodIndex = i;
      } else {
        it.mesh = mesh;
        it.instanceIndex = i;
      }
      mesh.setMatrixAt(i, composeItem(it));
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    mesh.boundingSphere.radius += padding;
    group.add(mesh);
    meshes.push(mesh);
  }
  return meshes;
}

/**
 * Küçük nesneleri (eğrelti, mantar, dal…) belli bir mesafeden sonra hiç çizmez.
 * Parça merkezine olan uzaklığa bakar; sis zaten uzağı gizlediği için fark edilmez.
 */
export class DistanceCuller {
  constructor() {
    this.entries = [];
  }

  add(meshes, maxDist) {
    for (const mesh of meshes) this.entries.push({ mesh, maxDist });
  }

  update(cameraPos) {
    for (const e of this.entries) {
      const bs = e.mesh.boundingSphere;
      e.mesh.visible = cameraPos.distanceTo(bs.center) - bs.radius < e.maxDist;
    }
  }
}

export function composeItem(it) {
  _q.setFromAxisAngle(_up, it.yaw ?? 0);
  const s = it.scale ?? 1;
  _s.set(s * (it.sx ?? 1), s * (it.sy ?? 1), s * (it.sz ?? 1));
  return _m.compose(_p.set(it.x, it.y, it.z), _q, _s);
}
