import * as THREE from 'three';
import { itemIconSpec } from '../world/ItemModels.js';
import { buildBuildingGeometry } from '../world/Models.js';

// 3B modellerden envanter/arayüz ikonları üretir. Küçük, ayrı bir WebGL tuvaline
// (şeffaf arka plan) bir kez çizilir, resme (data URL) çevrilip önbelleğe alınır.
// Böylece envanterde emoji yerine eldeki modelin aynısı görünür.

const SIZE = 112;
const cache = new Map();
const extraBuilders = new Map(); // tür → (id) => { object, rotation }
let renderer = null;
let failed = false;
let scene;
let camera;
let holder;
let material;
let glowMaterial;

function setup() {
  if (renderer || failed) return !!renderer;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = SIZE;
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(1);
    renderer.setSize(SIZE, SIZE, false);
    renderer.setClearColor(0x000000, 0);
  } catch {
    failed = true;
    renderer = null;
    return false;
  }
  scene = new THREE.Scene();
  const hemi = new THREE.HemisphereLight('#ffffff', '#4a4038', 1.9);
  const key = new THREE.DirectionalLight('#fff4e0', 2.4);
  key.position.set(-2.5, 4, 3);
  const rim = new THREE.DirectionalLight('#a9d8ff', 1.1);
  rim.position.set(3, 1.5, -3);
  scene.add(hemi, key, rim);
  camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 100);
  holder = new THREE.Group();
  scene.add(holder);
  material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  glowMaterial = new THREE.MeshBasicMaterial({ color: '#ffb347' });
  return true;
}

const _box = new THREE.Box3();
const _size = new THREE.Vector3();
const _center = new THREE.Vector3();

function renderObject(obj, rotation) {
  holder.rotation.set(rotation[0], rotation[1], rotation[2], 'YXZ');
  holder.add(obj);
  holder.updateMatrixWorld(true);
  _box.setFromObject(obj);
  _box.getSize(_size);
  _box.getCenter(_center);
  const half = (Math.max(_size.x, _size.y) / 2) * 1.1 + 1e-3;
  camera.left = _center.x - half;
  camera.right = _center.x + half;
  camera.top = _center.y + half;
  camera.bottom = _center.y - half;
  camera.position.set(_center.x, _center.y, _box.max.z + 2);
  camera.near = 0.01;
  camera.far = _size.z + 4;
  camera.updateProjectionMatrix();
  renderer.clear();
  renderer.render(scene, camera);
  holder.remove(obj);
  return renderer.domElement.toDataURL('image/png');
}

function buildFor(kind, id) {
  if (kind === 'item') {
    const spec = itemIconSpec(id);
    if (!spec) return null;
    const mesh = new THREE.Mesh(spec.geometry, material);
    if (spec.glow) {
      // meşalenin alevi
      const flame = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.26, 6), glowMaterial);
      flame.position.y = 0.72;
      mesh.add(flame);
    }
    return { object: mesh, rotation: spec.rotation };
  }
  if (kind === 'building') {
    const geo = buildBuildingGeometry(id);
    return { object: new THREE.Mesh(geo, material), rotation: [0.5, -0.75, 0] };
  }
  const fn = extraBuilders.get(kind);
  return fn ? fn(id) : null;
}

/** Hayvan/düşman/boss gibi ek ikon türleri (modeli üreten fonksiyonla). */
export function registerIconKind(kind, fn) {
  extraBuilders.set(kind, fn);
}

/** İkonun resim adresi (yoksa null). kind: 'item' | 'building' | kayıtlı türler. */
export function iconURL(kind, id) {
  const key = `${kind}:${id}`;
  if (cache.has(key)) return cache.get(key);
  let url = null;
  if (setup()) {
    try {
      const spec = buildFor(kind, id);
      if (spec) url = renderObject(spec.object, spec.rotation);
    } catch (err) {
      console.warn('İkon çizilemedi:', key, err);
    }
  }
  cache.set(key, url);
  return url;
}

/** <img> ikon öğesi. */
export function iconImg(kind, id, cls = '') {
  const url = iconURL(kind, id);
  if (!url) return null;
  const img = document.createElement('img');
  img.className = `ri img ${cls}`.trim();
  img.src = url;
  img.alt = '';
  img.draggable = false;
  return img;
}

const imageCache = new Map();
/** Tuvale çizmek için yüklenmiş Image nesnesi (ilk seferde yüklenir; hazır değilse null). */
export function iconImage(url) {
  if (!url) return null;
  let im = imageCache.get(url);
  if (!im) {
    im = new Image();
    im.src = url;
    imageCache.set(url, im);
  }
  return im.complete && im.naturalWidth ? im : null;
}
