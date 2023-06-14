import type { NamespaceHandlers } from '../type';
import { saveFile, savePDFFileAs, savePngFileAs } from './export';

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

  saveFile: async (
    _,
    filePath: string,
    data: string | NodeJS.ArrayBufferView
  ) => {
    return saveFile(filePath, data);
  },
} satisfies NamespaceHandlers;

export * from './export';
