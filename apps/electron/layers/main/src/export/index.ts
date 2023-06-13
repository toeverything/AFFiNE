import type { NamespaceHandlers } from '../type';
import { saveFile, savePDFFileAs, savePngFileAs } from './pdf';

export const exportHandlers = {
  savePDFFileAs: async (
    _,
    workspaceId: string,
    pageId: string,
    title: string
  ) => {
    return savePDFFileAs(workspaceId, pageId, title);
  },
  savePngFileAs: async (
    _,
    workspaceId: string,
    pageId: string,
    title: string
  ) => {
    return savePngFileAs(workspaceId, pageId, title);
  },

  saveFile: async (
    _,
    filePath: string,
    data: string | NodeJS.ArrayBufferView
  ) => {
    return saveFile(filePath, data);
  },
} satisfies NamespaceHandlers;

export * from './pdf';
