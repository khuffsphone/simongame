import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// The shipped artifact is ONE self-contained index.html: JS and CSS inlined,
// zero network requests, zero external assets. `scripts/assert-selfcontained.mjs`
// runs after every build and fails the build if that stops being true.
export default defineConfig({
  base: './',
  plugins: [viteSingleFile({ removeViteModuleLoader: true })],
  build: {
    target: 'es2022',
    cssCodeSplit: false,
    assetsInlineLimit: 100_000_000,
    modulePreload: { polyfill: false },
    reportCompressedSize: false,
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
      },
    },
  },
});
