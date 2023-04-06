import type {
  AppEvents,
  LoadPriority,
  WorkspaceCRUD,
  WorkspaceUISchema,
} from '@affine/workspace/type';
import { WorkspaceFlavour } from '@affine/workspace/type';

import { AffinePlugin } from './affine';
import { LocalPlugin } from './local';

export interface WorkspacePlugin<Flavour extends WorkspaceFlavour> {
  flavour: Flavour;
  // Plugin will be loaded according to the priority
  loadPriority: LoadPriority;
  Events: Partial<AppEvents>;
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
