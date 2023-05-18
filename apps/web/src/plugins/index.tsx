import type {
  AppEvents,
  WorkspaceCRUD,
  WorkspaceUISchema,
} from '@affine/workspace/type';
import {
  LoadPriority,
  ReleaseType,
  WorkspaceFlavour,
} from '@affine/workspace/type';

import { AffinePlugin } from './affine';
import { LocalPlugin } from './local';

export interface WorkspaceAdapter<Flavour extends WorkspaceFlavour> {
  releaseType: ReleaseType;
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

export const WorkspaceAdapters = {
  [WorkspaceFlavour.AFFINE]: AffinePlugin,
  [WorkspaceFlavour.LOCAL]: LocalPlugin,
  [WorkspaceFlavour.AFFINE_CLOUD]: {
    releaseType: ReleaseType.UNRELEASED,
    flavour: WorkspaceFlavour.AFFINE_CLOUD,
    loadPriority: LoadPriority.HIGH,
    Events: {} as Partial<AppEvents>,
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
  [WorkspaceFlavour.PUBLIC]: {
    releaseType: ReleaseType.UNRELEASED,
    flavour: WorkspaceFlavour.PUBLIC,
    loadPriority: LoadPriority.LOW,
    Events: {} as Partial<AppEvents>,
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
  [Key in WorkspaceFlavour]: WorkspaceAdapter<Key>;
};
