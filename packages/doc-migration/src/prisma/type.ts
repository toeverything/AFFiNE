import type { Doc } from 'yjs';

export type DocSnapshot = {
  workspaceId: string;
  doc: Doc;
  createdAt: Date;
  updatedAt: Date;
};
