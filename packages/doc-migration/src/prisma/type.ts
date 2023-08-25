import type { Doc } from 'yjs';

export type DocUpdate = { workspaceId: string; doc: Doc; createdAt: Date };

export type DocSnapshot = {
  workspaceId: string;
  doc: Doc;
  createdAt: Date;
  updatedAt: Date;
};
