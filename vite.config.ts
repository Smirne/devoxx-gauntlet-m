import { resolve } from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: { port: 5173, host: true },
  build: {
    target: 'es2022',
    outDir: 'dist',
    sourcemap: true,
    rollupOptions: {
      // Two pages: the 2.5D diorama (index.html) and the full-3D proof of concept (3d.html).
      input: {
        main: resolve(__dirname, 'index.html'),
        play3d: resolve(__dirname, '3d.html'),
      },
    },
  },
});
