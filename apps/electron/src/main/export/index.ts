import type { NamespaceHandlers } from '../type';
import { savePDFFileAs } from './pdf';

export const exportHandlers = {
  savePDFFileAs: async (_, title: string) => {
    return savePDFFileAs(title);
  },
} satisfies NamespaceHandlers;

export * from './pdf';
