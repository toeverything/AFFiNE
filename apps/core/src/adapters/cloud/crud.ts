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
import { fetcher } from '@affine/workspace/affine/gql';
import { getOrCreateWorkspace } from '@affine/workspace/manager';
import {
  deleteLocalBlobStorage,
  moveLocalBlobStorage,
} from '@affine/workspace/migration';
import { Workspace } from '@blocksuite/store';
import {
  createIndexedDBProvider,
  DEFAULT_DB_NAME,
} from '@toeverything/y-indexeddb';
import { getSession } from 'next-auth/react';
import { proxy } from 'valtio/vanilla';

const Y = Workspace.Y;

// we don't need to persistence the state into local storage
//  because if a user clicks create multiple time and nothing happened
//  because of the server delay or something, he/she will wait.
// and also the user journey of creating workspace is long.
const createdWorkspaces = proxy<string[]>([]);

export const CRUD: WorkspaceCRUD<WorkspaceFlavour.AFFINE_CLOUD> = {
  create: async blockSuiteWorkspace => {
    if (createdWorkspaces.some(id => id === blockSuiteWorkspace.id)) {
      throw new Error('workspace already created');
    }
    const { createWorkspace } = await fetcher({
      query: createWorkspaceMutation,
      variables: {
        init: new File(
          [Y.encodeStateAsUpdate(blockSuiteWorkspace.doc)],
          'initBinary.yDoc'
        ),
      },
    });
    createdWorkspaces.push(blockSuiteWorkspace.id);
    const newBLockSuiteWorkspace = getOrCreateWorkspace(
      createWorkspace.id,
      WorkspaceFlavour.AFFINE_CLOUD
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
      DEFAULT_DB_NAME
    );
    provider.connect();
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
    if (!environment.isServer && !navigator.onLine) {
      // no network
      return null;
    }
    if (
      !(await getSession()
        .then(() => true)
        .catch(() => false))
    ) {
      return null;
    }
    try {
      await fetcher({
        query: getWorkspaceQuery,
        variables: {
          id,
        },
      });
      return {
        id,
        flavour: WorkspaceFlavour.AFFINE_CLOUD,
        blockSuiteWorkspace: getOrCreateWorkspace(
          id,
          WorkspaceFlavour.AFFINE_CLOUD
        ),
      } satisfies AffineCloudWorkspace;
    } catch (e) {
      console.error('error when fetching cloud workspace:', e);
      return null;
    }
  },
  list: async () => {
    if (!environment.isServer && !navigator.onLine) {
      // no network
      return [];
    }
    if (
      !(await getSession()
        .then(() => true)
        .catch(() => false))
    ) {
      return [];
    }
    try {
      const { workspaces } = await fetcher({
        query: getWorkspacesQuery,
      });
      const ids = workspaces.map(({ id }) => id);

      return ids.map(
        id =>
          ({
            id,
            flavour: WorkspaceFlavour.AFFINE_CLOUD,
            blockSuiteWorkspace: getOrCreateWorkspace(
              id,
              WorkspaceFlavour.AFFINE_CLOUD
            ),
          }) satisfies AffineCloudWorkspace
      );
    } catch (e) {
      console.error('error when fetching cloud workspaces:', e);
      return [];
    }
  },
};
