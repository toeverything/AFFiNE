import type { NamespaceHandlers } from '../type';
import { savePDFFileAs, savePngFileAs } from './export';

export const exportHandlers = {
  savePDFFileAs: async (
    _,
    workspaceId: string,
    pageId: string,
    title: string,
    mode: string
  ) => {
    return savePDFFileAs(workspaceId, pageId, title, mode);
  },

  savePngFileAs: async (
    _,
    workspaceId: string,
    pageId: string,
    title: string,
    mode: string
  ) => {
    return savePngFileAs(workspaceId, pageId, title, mode);
  },
} satisfies NamespaceHandlers;

export * from './export';
