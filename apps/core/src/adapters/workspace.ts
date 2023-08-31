import { Unreachable } from '@affine/env/constant';
import type {
  AppEvents,
  WorkspaceAdapter,
  WorkspaceUISchema,
} from '@affine/env/workspace';
import {
  LoadPriority,
  ReleaseType,
  WorkspaceFlavour,
} from '@affine/env/workspace';
import { CRUD as CloudCRUD } from '@affine/workspace/affine/crud';
import { startSync, stopSync } from '@affine/workspace/affine/sync';

import { UI as CloudUI } from './cloud/ui';
import { LocalAdapter } from './local';
import { UI as PublicCloudUI } from './public-cloud/ui';

const unimplemented = () => {
  throw new Error('Not implemented');
};

const bypassList = async () => {
  return [];
};

export const WorkspaceAdapters = {
  [WorkspaceFlavour.LOCAL]: LocalAdapter,
  [WorkspaceFlavour.AFFINE_CLOUD]: {
    releaseType: ReleaseType.UNRELEASED,
    flavour: WorkspaceFlavour.AFFINE_CLOUD,
    loadPriority: LoadPriority.HIGH,
    Events: {
      'app:access': async () => {
        try {
          const { getSession } = await import('next-auth/react');
          const session = await getSession();
          return !!session;
        } catch (e) {
          console.error('failed to get session', e);
          return false;
        }
      },
      'service:start': startSync,
      'service:stop': stopSync,
    } as Partial<AppEvents>,
    CRUD: CloudCRUD,
    UI: CloudUI,
  },
  [WorkspaceFlavour.AFFINE_PUBLIC]: {
    releaseType: ReleaseType.UNRELEASED,
    flavour: WorkspaceFlavour.AFFINE_PUBLIC,
    loadPriority: LoadPriority.LOW,
    Events: {} as Partial<AppEvents>,
    // todo: implement this
    CRUD: {
      get: unimplemented,
      list: bypassList,
      delete: unimplemented,
      create: unimplemented,
    },
    UI: PublicCloudUI,
  },
} satisfies {
  [Key in WorkspaceFlavour]: WorkspaceAdapter<Key>;
};

export function getUIAdapter<Flavour extends WorkspaceFlavour>(
  flavour: Flavour
): WorkspaceUISchema<Flavour> {
  const ui = WorkspaceAdapters[flavour].UI as WorkspaceUISchema<Flavour>;
  if (!ui) {
    throw new Unreachable();
  }
  return ui;
}
