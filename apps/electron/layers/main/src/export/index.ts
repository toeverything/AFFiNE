import type { NamespaceHandlers } from '../type';
import { savePDFFileAs } from './pdf';

export const exportHandlers = {
  savePDFFileAs: async (
    _,
    workspaceId: string,
    pageId: string,
    title: string
  ) => {
    return savePDFFileAs(workspaceId, pageId, title);
  },
} satisfies NamespaceHandlers;

export * from './pdf';
