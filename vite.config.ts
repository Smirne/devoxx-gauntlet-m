import { resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';

// Vercel Web Analytics, only in a build Vercel runs (it sets VERCEL=1). The
// script is served by Vercel itself, so anywhere else — `pnpm dev`, a clone,
// the claude.ai builds from `tools/publish-build.sh` — it would be a 404.
const vercelAnalytics = (): Plugin => ({
  name: 'vercel-analytics',
  apply: 'build',
  transformIndexHtml: () =>
    process.env.VERCEL === '1'
      ? [{ tag: 'script', attrs: { defer: true, src: '/_vercel/insights/script.js' }, injectTo: 'head' }]
      : [],
});

// The bare `/` opens the entry, the 3D build, in `pnpm dev` and `pnpm preview`
// as it does on Vercel (`vercel.json`). The 2.5D build stays at /index.html.
const entryRedirect = (): Plugin => {
  const redirect = (req: { url?: string }, res: { statusCode: number; setHeader(k: string, v: string): void; end(): void }, next: () => void): void => {
    const url = req.url ?? '';
    if (url === '/' || url.startsWith('/?')) {
      res.statusCode = 302;
      res.setHeader('Location', '/3d.html' + url.slice(1));
      res.end();
      return;
    }
    next();
  };
  return {
    name: 'entry-redirect',
    configureServer: (server) => void server.middlewares.use(redirect),
    configurePreviewServer: (server) => void server.middlewares.use(redirect),
  };
};

export default defineConfig({
  base: './',
  plugins: [vercelAnalytics(), entryRedirect()],
  // The published Vercel build keeps the error count out of the tab title (see
  // `titleFor` in main.ts / main3d.ts); every other build shows it.
  define: { 'import.meta.env.VITE_VERCEL': JSON.stringify(process.env.VERCEL === '1') },
  // Bound to localhost only (Vite's default), so a port another app already
  // holds on localhost is noticed and Vite moves to the next free one, printing
  // it. `host: true` bound every interface, which the OS allows beside an app
  // on 127.0.0.1, and the browser's localhost then reached that app instead.
  // `pnpm dev --host` still serves the LAN, for a phone.
  server: { port: 5173 },
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
