import { createEvent } from '../../../framework';
import type { WorkspaceEngine } from '../entities/engine';

export const WorkspaceEngineBeforeStart = createEvent<WorkspaceEngine>(
  'WorkspaceEngineBeforeStart'
);
