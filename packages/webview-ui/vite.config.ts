import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    // Single JS bundle for VS Code webview
    cssCodeSplit: false,
    rollupOptions: {
      output: {
        // Deterministic file names (no hash) so the extension can reference them
        entryFileNames: 'assets/index.js',
        chunkFileNames: 'assets/[name].js',
        assetFileNames: 'assets/[name].[ext]',
        // Wrap in IIFE — webview has no ES module support
        format: 'iife',
      },
    },
  },
});
