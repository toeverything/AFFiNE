import type {
  LoadPriority,
  WorkspaceCRUD,
  WorkspaceUISchema,
} from '@affine/workspace/type';
import { WorkspaceFlavour } from '@affine/workspace/type';

import type { AffineWorkspace, LocalWorkspace } from '../shared';
import { AffinePlugin } from './affine';
import { LocalPlugin } from './local';

declare module '@affine/workspace/type' {
  interface WorkspaceRegistry {
    [WorkspaceFlavour.AFFINE]: AffineWorkspace;
    [WorkspaceFlavour.LOCAL]: LocalWorkspace;
  }
}

export interface WorkspacePlugin<Flavour extends WorkspaceFlavour> {
  flavour: Flavour;
  // Plugin will be loaded according to the priority
  loadPriority: LoadPriority;
  // fixme: this is a hack
  cleanup?: () => void;
  // Fetch necessary data for the first render
  CRUD: WorkspaceCRUD<Flavour>;
  UI: WorkspaceUISchema<Flavour>;
}

export const WorkspacePlugins = {
  [WorkspaceFlavour.AFFINE]: AffinePlugin,
  [WorkspaceFlavour.LOCAL]: LocalPlugin,
} satisfies {
  [Key in WorkspaceFlavour]: WorkspacePlugin<Key>;
};
