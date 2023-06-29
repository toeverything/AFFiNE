import type { NamespaceHandlers } from '../type';
import { saveFileAs, savePDFFileAs, savePngFileAs } from './export';

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

  saveFileAs: async (
    _,
    imageDataUrl: string,
    width: number,
    height: number,
    filePath: string,
    fileType: string
  ) => {
    return saveFileAs(imageDataUrl, width, height, filePath, fileType);
  },
} satisfies NamespaceHandlers;

export * from './export';
