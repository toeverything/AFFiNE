import { defineRouter } from 'waku/router/server';

export default defineRouter(
  async id => {
    switch (id) {
      case 'index': {
        const { default: AppCreator } = await import('./src/app.js');
        return AppCreator(id);
      }
      default:
        return null;
    }
  },
  async () => {
    return ['index'];
  }
);
