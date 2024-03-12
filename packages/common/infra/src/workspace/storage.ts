import { createIdentifier } from '../di';
import type { Memento } from '../storage';

export interface WorkspaceLocalState extends Memento {}

export const WorkspaceLocalState = createIdentifier<WorkspaceLocalState>(
  'WorkspaceLocalState'
);
