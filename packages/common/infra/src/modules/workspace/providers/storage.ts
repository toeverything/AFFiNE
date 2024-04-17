import { createIdentifier } from '../../../framework';
import type { Memento } from '../../../storage';

export interface WorkspaceLocalState extends Memento {}
export interface WorkspaceLocalCache extends Memento {}

export const WorkspaceLocalState = createIdentifier<WorkspaceLocalState>(
  'WorkspaceLocalState'
);

export const WorkspaceLocalCache = createIdentifier<WorkspaceLocalCache>(
  'WorkspaceLocalCache'
);
