import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

// The live site is https://dazeyama.github.io/pug-pricing-tool/, so the build
// puts every asset under /pug-pricing-tool/. The dev server stays at the root
// (http://localhost:5180/). Routes live in the hash (HashRouter), so GitHub
// Pages never has to rewrite a deep link.
// `npm run dev:lan` (vite --host): the dev server on the shop's network over
// HTTPS with a self-signed certificate, since a phone's camera only works on
// HTTPS (docs/SCAN_FUNCTION.md 11.1; docs/SETUP.md). Plain `npm run dev` and
// start.bat stay http://localhost:5180.
const lan = process.argv.includes('--host');

export default defineConfig(({ command, isPreview }) => ({
  base: command === 'build' || isPreview ? '/pug-pricing-tool/' : '/',
  plugins: [react(), ...(command === 'serve' && lan ? [basicSsl()] : [])],
  // Shown in the Settings footer (spec 11.7).
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __BUILD_DATE__: JSON.stringify(new Date().toISOString()),
  },
  server: {
    port: 5180,
    strictPort: true,
  },
}));
