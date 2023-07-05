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
import {
  deleteLocalBlobStorage,
  moveLocalBlobStorage,
} from '@affine/workspace/migration';
import { createEmptyBlockSuiteWorkspace } from '@affine/workspace/utils';
import { Workspace } from '@blocksuite/store';
import {
  createIndexedDBProvider,
  DEFAULT_DB_NAME,
} from '@toeverything/y-indexeddb';

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
          'initBinary.yDoc'
        ),
      },
    });
    const newBLockSuiteWorkspace = createEmptyBlockSuiteWorkspace(
      createWorkspace.id,
      WorkspaceFlavour.AFFINE_CLOUD,
      {}
    );
    Y.applyUpdate(
      newBLockSuiteWorkspace.doc,
      Y.encodeStateAsUpdate(newBLockSuiteWorkspace.doc)
    );
    blockSuiteWorkspace.doc.subdocs.forEach(subdoc => {
      newBLockSuiteWorkspace.doc.subdocs.forEach(newSubdoc => {
        Y.applyUpdate(newSubdoc, Y.encodeStateAsUpdate(subdoc));
      });
    });

    const provider = createIndexedDBProvider(
      newBLockSuiteWorkspace.doc,
      DEFAULT_DB_NAME,
      false
    );
    provider.connect();
    await provider.whenSynced;
    moveLocalBlobStorage(blockSuiteWorkspace.id, createWorkspace.id)
      .then(() => deleteLocalBlobStorage(blockSuiteWorkspace.id))
      .catch(e => {
        console.error('error when moving blob storage:', e);
      });
    // todo(himself65): delete old workspace in the future
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
