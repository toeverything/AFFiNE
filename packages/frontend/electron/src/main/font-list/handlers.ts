import { getFonts } from 'font-list';

import type { NamespaceHandlers } from '../type';

export const fontListHandlers = {
  getSystemFonts: async () => {
    try {
      const fonts = await getFonts();
      return fonts;
    } catch (error) {
      console.error('Failed to get system fonts:', error);
      return [];
    }
  },
} satisfies NamespaceHandlers;
