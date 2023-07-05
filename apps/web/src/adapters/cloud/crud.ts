import type {
  AffineCloudWorkspace,
  WorkspaceCRUD,
} from '@affine/env/workspace';
import { WorkspaceFlavour } from '@affine/env/workspace';
import {
  createWorkspaceMutation,
  deleteWorkspaceMutation,
  getWorkspaceQuery,
  getWorkspacesQuery,
} from '@affine/graphql';
import { createEmptyBlockSuiteWorkspace } from '@affine/workspace/utils';
import { Workspace } from '@blocksuite/store';

import { fetcher } from '../../shared/gql';

const Y = Workspace.Y;

export const CRUD: WorkspaceCRUD<WorkspaceFlavour.AFFINE_CLOUD> = {
  create: async blockSuiteWorkspace => {
    // wrong implementation
    const { createWorkspace } = await fetcher({
      query: createWorkspaceMutation,
      variables: {
        init: new File(
          [Y.encodeStateAsUpdate(blockSuiteWorkspace.doc)],
          'binary.yDoc'
        ),
      },
    });
    return createWorkspace.id;
  },
  delete: async workspace => {
    await fetcher({
      query: deleteWorkspaceMutation,
      variables: {
        id: workspace.id,
      },
    });
  },
  get: async id => {
    await fetcher({
      query: getWorkspaceQuery,
      variables: {
        id,
      },
    });
    return {
      id,
      flavour: WorkspaceFlavour.AFFINE_CLOUD,
      blockSuiteWorkspace: createEmptyBlockSuiteWorkspace(
        id,
        WorkspaceFlavour.AFFINE_CLOUD,
        {}
      ),
    } satisfies AffineCloudWorkspace;
  },
  list: async () => {
    const { workspaces } = await fetcher({
      query: getWorkspacesQuery,
    });
    const ids = workspaces.map(({ id }) => id);

    return ids.map(
      id =>
        ({
          id,
          flavour: WorkspaceFlavour.AFFINE_CLOUD,
          blockSuiteWorkspace: createEmptyBlockSuiteWorkspace(
            id,
            WorkspaceFlavour.AFFINE_CLOUD,
            {}
          ),
        } satisfies AffineCloudWorkspace)
    );
  },
};
