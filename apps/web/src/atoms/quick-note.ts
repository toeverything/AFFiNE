// quick note page shall only be added to current workspace after it is saved

import { WorkspaceFlavour } from '@affine/env/workspace';
import { createEmptyBlockSuiteWorkspace } from '@affine/workspace/utils';
import type { Page } from '@blocksuite/store';
import { Generator } from '@blocksuite/store';
import { atom } from 'jotai';

// before that, we need to keep it in a separate workspace
const blockSuiteWorkspace = createEmptyBlockSuiteWorkspace(
  'quick-note',
  WorkspaceFlavour.LOCAL,
  {
    idGenerator: Generator.AutoIncrement,
  }
);

export const quickNotePageAtom = atom<Page>(blockSuiteWorkspace.createPage());
