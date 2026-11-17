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
          for (const file of ['saved.html', 'firebase-applet-config.json']) {
            const srcFile = path.resolve(__dirname, file);
            const destFile = path.resolve(distDir, file);
            if (fs.existsSync(distDir) && fs.existsSync(srcFile)) {
              fs.copyFileSync(srcFile, destFile);
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
