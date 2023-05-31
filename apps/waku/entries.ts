import { defineEntries } from 'waku/server';

export default defineEntries(
  // getEntry
  async id => {
    switch (id) {
      case 'App':
        return import('./src/app.js');
      default:
        return null;
    }
  },
  // getBuilder
  async () => {
    return {
      '/': {
        elements: [['App', {}]],
      },
    };
  }
);
