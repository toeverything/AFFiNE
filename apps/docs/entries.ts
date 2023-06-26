import { defineRouter } from 'waku/router/server';

export default defineRouter(
  async id => {
    switch (id) {
      case 'index':
        return import('./src/app.js') as any;
      default:
        return null;
    }
  },
  async () => {
    return ['index'];
  }
);
