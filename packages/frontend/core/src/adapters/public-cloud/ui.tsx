import type { WorkspaceFlavour } from '@affine/env/workspace';
import { type WorkspaceUISchema } from '@affine/env/workspace';

import { Provider } from '../shared';

export const UI = {
  Provider,
  NewSettingsDetail: () => {
    throw new Error('Not implemented');
  },
} satisfies WorkspaceUISchema<WorkspaceFlavour.AFFINE_PUBLIC>;
