import type {
  AppEvents,
  WorkspaceCRUD,
  WorkspaceUISchema,
} from '@affine/workspace/type';
import { LoadPriority, WorkspaceFlavour } from '@affine/workspace/type';

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

const unimplemented = () => {
  throw new Error('Not implemented');
};
export const WorkspacePlugins = {
  [WorkspaceFlavour.AFFINE]: AffinePlugin,
  [WorkspaceFlavour.LOCAL]: LocalPlugin,
  [WorkspaceFlavour.PUBLIC]: {
    flavour: WorkspaceFlavour.PUBLIC,
    loadPriority: LoadPriority.LOW,
    Events: {
      'app:first-init': async () => {},
    },
    // todo: implement this
    CRUD: {
      get: unimplemented,
      list: unimplemented,
      delete: unimplemented,
      create: unimplemented,
    },
    // todo: implement this
    UI: {
      Provider: unimplemented,
      PageDetail: unimplemented,
      PageList: unimplemented,
      SettingsDetail: unimplemented,
    },
  },
} satisfies {
  [Key in WorkspaceFlavour]: WorkspacePlugin<Key>;
};
