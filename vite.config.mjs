import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(() => {
  return {
    base: './',
    plugins: [
      {
        name: 'copy-static-js-css',
        apply: 'build',
        closeBundle(error) {
          if (error) return;
          const distDir = path.resolve(__dirname, 'dist');
          for (const folder of ['css', 'js']) {
            const srcDir = path.resolve(__dirname, folder);
            const destDir = path.resolve(distDir, folder);
            if (fs.existsSync(distDir) && fs.existsSync(srcDir)) {
              fs.cpSync(srcDir, destDir, { recursive: true, force: true });
            }
          }
        },
      },
    ],
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
