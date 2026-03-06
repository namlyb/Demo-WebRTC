import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { nodePolyfills } from 'vite-plugin-node-polyfills';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    nodePolyfills({
      include: ['process', 'global', 'Buffer'],
      globals: {
        process: true,
        global: true,
        Buffer: true
      }
    }),
  ],
  define: {
    global: 'globalThis',
    'process.env': {},
    'process.nextTick': 'queueMicrotask'
  },
  optimizeDeps: {
    include: ['simple-peer', 'buffer', 'process']
  }
});