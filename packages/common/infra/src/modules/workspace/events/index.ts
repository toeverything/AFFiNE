import { createEvent } from '../../../framework';
import type { WorkspaceEngine } from '../entities/engine';
import type { Workspace } from '../entities/workspace';

export const WorkspaceEngineBeforeStart = createEvent<WorkspaceEngine>(
  'WorkspaceEngineBeforeStart'
);

export const WorkspaceInitialized = createEvent<Workspace>(
  'WorkspaceInitialized'
);
