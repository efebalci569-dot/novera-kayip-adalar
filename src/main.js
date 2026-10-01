import './styles/main.css';
import { Game } from './core/Game.js';

const loading = document.getElementById('loading-screen');
const loadingText = loading?.querySelector('.loading-text');

function hasWebGL2() {
  try {
    return !!document.createElement('canvas').getContext('webgl2');
  } catch {
    return false;
  }
}

function boot() {
  if (!hasWebGL2()) {
    loadingText.textContent = 'Tarayıcın WebGL 2 desteklemiyor. Lütfen güncel bir Chrome, Edge ya da Firefox kullan.';
    return;
  }
  try {
    const game = new Game(document.getElementById('game-canvas'));
    if (import.meta.env.DEV) window.__novera = game; // geliştirme sırasında konsoldan erişim
    game.showMainMenu();
    loading.classList.add('fade');
    setTimeout(() => loading.remove(), 900);
  } catch (err) {
    console.error(err);
    loadingText.textContent = `Oyun başlatılamadı: ${err.message}`;
  }
}

// yükleme ekranının çizilmesine fırsat ver, sonra dünyayı üret
// (sekme arka plandaysa requestAnimationFrame beklemeye alınır; setTimeout yedek olarak başlatır)
let started = false;
const start = () => {
  if (started) return;
  started = true;
  setTimeout(boot, 40);
};
requestAnimationFrame(start);
setTimeout(start, 300);
