import { defineEntries } from 'waku/server';

export default defineEntries(
  // getEntry
  async id => {
    switch (id) {
      case 'App':
        return import('./src/app.js') as any;
      default:
        return null;
    }
  },
  // getBuildConfig
  async () => {
    return {
      '/': {
        elements: [['App', {}]],
      },
    };
  }
);
