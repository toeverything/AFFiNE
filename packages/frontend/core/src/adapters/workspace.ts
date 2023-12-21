import { Unreachable } from '@affine/env/constant';
import type {
  WorkspaceAdapter,
  WorkspaceUISchema,
} from '@affine/env/workspace';
import {
  LoadPriority,
  ReleaseType,
  WorkspaceFlavour,
} from '@affine/env/workspace';

import { UI as CloudUI } from './cloud/ui';
import { LocalAdapter } from './local';

export const WorkspaceAdapters = {
  [WorkspaceFlavour.LOCAL]: LocalAdapter,
  [WorkspaceFlavour.AFFINE_CLOUD]: {
    releaseType: ReleaseType.UNRELEASED,
    flavour: WorkspaceFlavour.AFFINE_CLOUD,
    loadPriority: LoadPriority.HIGH,
    UI: CloudUI,
  },
} satisfies {
  [Key in WorkspaceFlavour]: WorkspaceAdapter<Key>;
};

export function getUIAdapter<Flavour extends WorkspaceFlavour>(
  flavour: Flavour
): WorkspaceUISchema {
  const ui = WorkspaceAdapters[flavour].UI as WorkspaceUISchema;
  if (!ui) {
    throw new Unreachable();
  }
  return ui;
}
