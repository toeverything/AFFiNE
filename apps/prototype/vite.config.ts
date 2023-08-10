import { resolve } from 'node:path';

import react from '@vitejs/plugin-react-swc';
import { defineConfig } from 'vite';

// https://vitejs.dev/config/
export default defineConfig({
  build: {
    target: 'ES2022',
    sourcemap: true,
    rollupOptions: {
      input: {
        'suite/provider-status': resolve(
          __dirname,
          'suite',
          'provider-status.html'
        ),
      },
    },
  },
  plugins: [react()],
});
