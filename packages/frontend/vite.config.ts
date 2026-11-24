/// <reference types="vitest" />

import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { Plugin } from 'vite';

const manualChunkGroups: Array<[chunkName: string, packageNames: string[]]> = [
  ['socket-io', ['socket.io-client']],
  ['sentry', ['@sentry/react']],
  ['clerk', ['@clerk/clerk-react']],
];

const commitSha = process.env.VERCEL_GIT_COMMIT_SHA ?? '';

const version = '5.128.3';
const digest =
  'N7F3Be4zy7C/KS5IvSNXl5BOwC+SNPMK0Z+SJbPWQ+EQPr1abCAGk93qxEc37GXjnM7OSd60ij6xl2ha3ERqSg==';
const assetDir = `assets/clerk/${version}`;
const entryFile = 'clerk.browser.js';
const clerkBrowserUrl = `/${assetDir}/${entryFile}`;

function clerkBrowserAssets(): Plugin {
  return {
    name: 'foliobuddy-clerk-assets',
    apply: 'build',
    generateBundle() {
      const stagingDir = mkdtempSync(path.join(tmpdir(), 'foliobuddy-clerk-'));
      try {
        // Use Clerk's prebuilt script without installing the SDK package's npm dependencies.
        const args = [
          'pack',
          `@clerk/clerk-js@${version}`,
          '--ignore-scripts',
          '--prefer-offline',
          '--loglevel=error',
        ];
        const npmCli = process.env.npm_execpath;
        const npm = npmCli ? process.execPath : 'npm';
        const npmArgs = npmCli ? [npmCli, ...args] : args;
        execFileSync(npm, npmArgs, {
          cwd: stagingDir,
        });
        const archive = path.join(stagingDir, `clerk-clerk-js-${version}.tgz`);
        const archiveDigest = createHash('sha512').update(readFileSync(archive)).digest('base64');
        if (archiveDigest !== digest) this.error('Clerk browser package integrity check failed.');

        execFileSync('tar', ['-xzf', archive, 'package/dist', 'package/LICENSE'], {
          cwd: stagingDir,
        });
        const sdk = path.join(stagingDir, 'package');
        const dist = path.join(sdk, 'dist');
        // Clerk requests its UI chunks relative to the entry script using the published filenames.
        const chunks = readdirSync(dist).filter((file) => /_clerk\.browser_.*\.js$/.test(file));
        for (const file of [entryFile, ...chunks]) {
          this.emitFile({
            type: 'asset',
            fileName: `${assetDir}/${file}`,
            source: readFileSync(path.join(dist, file)),
          });
        }
        this.emitFile({
          type: 'asset',
          fileName: `${assetDir}/LICENSE`,
          source: readFileSync(path.join(sdk, 'LICENSE')),
        });
      } finally {
        rmSync(stagingDir, { recursive: true, force: true });
      }
    },
  };
}

export default defineConfig(({ command }) => ({
  plugins: [react(), clerkBrowserAssets()],
  define: {
    __BUILD_SHA__: JSON.stringify(/^[a-f0-9]{40}$/i.test(commitSha) ? commitSha.slice(0, 7) : ''),
    __CLERK_JS_URL__: JSON.stringify(command === 'build' ? clerkBrowserUrl : ''),
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          const normalizedId = id.split(path.sep).join('/');
          const match = manualChunkGroups.find(([, packages]) =>
            packages.some((packageName) => normalizedId.includes(`/node_modules/${packageName}/`))
          );

          return match?.[0];
        },
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 4000,
    proxy: {
      '/api': {
        target: 'http://localhost:4001',
        changeOrigin: true,
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    exclude: ['node_modules', 'dist'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
    },
  },
}));
