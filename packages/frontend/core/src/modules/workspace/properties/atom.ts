import type { Workspace } from '@affine/workspace/workspace';
import { atomWithObservable } from 'jotai/utils';
import { filter, map, of } from 'rxjs';

import { currentWorkspaceAtom } from '../atoms';
import { WorkspacePropertiesAdapter } from './adapter';

export const currentWorkspacePropertiesAdapterAtom =
  atomWithObservable<WorkspacePropertiesAdapter>(get => {
    return of(get(currentWorkspaceAtom)).pipe(
      filter((workspace): workspace is Workspace => !!workspace),
      map(workspace => {
        return new WorkspacePropertiesAdapter(workspace.blockSuiteWorkspace);
      })
    );
  });
