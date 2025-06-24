/**
 * Workspace metadata type
 */
export interface WorkspaceMeta {
  id: string;
  name: string;
  avatar?: string;
  createDate: string;
  [key: string]: any;
}

export type YOrigin = 'self' | 'external' | 'upstream' | 'renderer';
