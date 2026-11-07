import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { ipv6LoopbackAlias } from './scripts/vite-loopback.mjs';

export default defineConfig({
  root: 'web',
  plugins: [react(), ipv6LoopbackAlias()],
  server: {
    host: '127.0.0.1',
    port: Number(process.env.VITE_PORT ?? 5180),
    strictPort: true,
    proxy: { '/api': `http://127.0.0.1:${process.env.PORT ?? 3301}` },
  },
  build: { outDir: '../dist', emptyOutDir: true },
});
