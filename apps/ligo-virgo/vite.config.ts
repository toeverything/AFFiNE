import { defineConfig } from 'vite';
import path from 'path';
import reactPlugin from '@vitejs/plugin-react';

export default defineConfig({
    plugins: [reactPlugin()],
    define: {
        'process.env': {
            NODE_ENV: '"development"',
        },
        JWT_DEV: false,
    },
    resolve: {
        alias: {
            '@toeverything': path.resolve(__dirname, '../../libs/'),
        },
    },
});
