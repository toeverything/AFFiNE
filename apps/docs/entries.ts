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
  // getBuildConfig
  async () => {
    return {
      '/': {
        elements: [['App', { name: 'Waku' }]],
      },
    };
  },
  // getSsrConfig
  async pathStr => {
    switch (pathStr) {
      case '/':
        return { element: ['App', { name: 'Waku' }] };
      default:
        return null;
    }
  }
);
