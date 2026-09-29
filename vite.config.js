import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The live site is https://dazeyama.github.io/pug-pricing-tool/, so the build
// puts every asset under /pug-pricing-tool/. The dev server stays at the root
// (http://localhost:5180/). Routes live in the hash (HashRouter), so GitHub
// Pages never has to rewrite a deep link.
export default defineConfig(({ command, isPreview }) => ({
  base: command === 'build' || isPreview ? '/pug-pricing-tool/' : '/',
  plugins: [react()],
  server: {
    port: 5180,
    strictPort: true,
  },
}));
