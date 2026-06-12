/// <reference types="vitest" />

import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

const manualChunkGroups: Array<[chunkName: string, packageNames: string[]]> = [
  ['recharts', ['recharts']],
  ['socket-io', ['socket.io-client']],
  ['sentry', ['@sentry/react']],
  ['clerk', ['@clerk/clerk-react']],
];

export default defineConfig({
  plugins: [react()],
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
});
