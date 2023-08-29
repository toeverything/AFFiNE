import { resolve } from 'node:path';

import react from '@vitejs/plugin-react-swc';
import { defineConfig } from 'vite';

import { getRuntimeConfig } from '../core/.webpack/runtime-config';

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
  define: {
    'process.env': {},
    'process.env.COVERAGE': JSON.stringify(!!process.env.COVERAGE),
    'process.env.SHOULD_REPORT_TRACE': `${Boolean(
      process.env.SHOULD_REPORT_TRACE
    )}`,
    'process.env.TRACE_REPORT_ENDPOINT': `"${process.env.TRACE_REPORT_ENDPOINT}"`,
    runtimeConfig: getRuntimeConfig({
      distribution: 'browser',
      mode: 'development',
      channel: 'canary',
      coverage: false,
    }),
  },
  plugins: [react()],
});
