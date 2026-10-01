import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// `npm run dev`   → geliştirme sunucusu (http://localhost:5173)
// `npm run build` → dist/index.html: tek dosya, internet/kurulum gerektirmeden çift tıkla açılır
export default defineConfig(({ command }) => ({
  base: './',
  plugins: command === 'build' ? [viteSingleFile()] : [],
  server: { port: 5173, open: false },
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 2000,
  },
}));
