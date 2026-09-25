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
      // Two pages: the 2.5D diorama (index.html) and the full-3D build (3d.html).
      //
      // PAGE=main or PAGE=3d builds ONE page, so its bundle has no chunk shared
      // with the other and `tools/inline-build.mjs` can fold it into a single
      // self-contained file. Built together, Vite splits the code both pages
      // use into a shared chunk the page imports by path, and an inlined page
      // cannot import a file that is no longer there. `tools/publish-build.sh`
      // builds each page on its own.
      input:
        process.env.PAGE === 'main'
          ? { main: resolve(__dirname, 'index.html') }
          : process.env.PAGE === '3d'
            ? { play3d: resolve(__dirname, '3d.html') }
            : { main: resolve(__dirname, 'index.html'), play3d: resolve(__dirname, '3d.html') },
    },
  },
});
