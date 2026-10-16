import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

// The live site is https://dazeyama.github.io/pug-pricing-tool/, so the build
// puts every asset under /pug-pricing-tool/. The dev server stays at the root
// (http://localhost:5180/). Routes live in the hash (HashRouter), so GitHub
// Pages never has to rewrite a deep link.
// The phone scanner's OCR (docs/SCAN_FUNCTION.md 10.3): Tesseract.js's worker,
// its LSTM engine (with and without SIMD) and the English model, copied from
// node_modules into public/tesseract/ when the dev server or a build starts,
// so the site serves them itself and asks no CDN (mtgscan's approach). Not
// committed (.gitignore): they come from the installed packages.
const TESSERACT_FILES = [
  ['tesseract.js/dist/worker.min.js', 'tesseract/worker.min.js'],
  ['tesseract.js-core/tesseract-core-lstm.wasm.js', 'tesseract/core/tesseract-core-lstm.wasm.js'],
  ['tesseract.js-core/tesseract-core-simd-lstm.wasm.js', 'tesseract/core/tesseract-core-simd-lstm.wasm.js'],
  ['@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz', 'tesseract/lang/eng.traineddata.gz'],
];
function vendorTesseract() {
  return {
    name: 'vendor-tesseract',
    buildStart() {
      for (const [from, to] of TESSERACT_FILES) {
        const src = resolve('node_modules', from);
        const dest = resolve('public', to);
        if (existsSync(dest) && statSync(dest).size === statSync(src).size) continue;
        mkdirSync(dirname(dest), { recursive: true });
        copyFileSync(src, dest);
      }
    },
  };
}

// `npm run dev:lan` (vite --host): the dev server on the shop's network over
// HTTPS with a self-signed certificate, since a phone's camera only works on
// HTTPS (docs/SCAN_FUNCTION.md 11.1; docs/SETUP.md). Plain `npm run dev` and
// start.bat stay http://localhost:5180.
const lan = process.argv.includes('--host');

export default defineConfig(({ command, isPreview }) => ({
  base: command === 'build' || isPreview ? '/pug-pricing-tool/' : '/',
  plugins: [react(), vendorTesseract(), ...(command === 'serve' && lan ? [basicSsl()] : [])],
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
