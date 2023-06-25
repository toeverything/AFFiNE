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
        elements: [['App', {}]],
      },
    };
  },
  // getSsrConfig
  async pathStr => {
    switch (pathStr) {
      case '/':
        return { element: ['App', {}] };
      default:
        return null;
    }
  }
);
