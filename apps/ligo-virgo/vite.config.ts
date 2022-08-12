import { defineConfig } from 'vite';
import path from 'path';
import reactPlugin from '@vitejs/plugin-react';

export default defineConfig({
    plugins: [reactPlugin()],
    resolve: {
        alias: {
            '@toeverything': path.resolve(__dirname, '../../libs/'),
        },
    },
});
