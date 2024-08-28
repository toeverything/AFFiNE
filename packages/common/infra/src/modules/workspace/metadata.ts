import type { WorkspaceFlavour } from '@affine/env/workspace';

export type WorkspaceMetadata = {
  id: string;
  flavour: WorkspaceFlavour;
  initialized?: boolean;
};
