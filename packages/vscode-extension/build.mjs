import * as esbuild from 'esbuild';
import { cpSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// 1. Bundle extension host code
await esbuild.build({
  entryPoints: ['src/extension.ts'],
  bundle: true,
  outfile: 'dist/extension.js',
  external: ['vscode'],
  format: 'cjs',
  platform: 'node',
  target: 'node18',
  sourcemap: true,
  minify: false,
});

// 2. Copy webview-ui dist into media/webview
const webviewSrc = resolve(__dirname, '..', 'webview-ui', 'dist');
const webviewDest = resolve(__dirname, 'media', 'webview');
mkdirSync(webviewDest, { recursive: true });
cpSync(webviewSrc, webviewDest, { recursive: true });

console.log('Extension built successfully (extension + webview assets copied)');
