import type { WorkspaceAdapter } from '@affine/env/workspace';
import { WorkspaceFlavour, WorkspaceVersion } from '@affine/env/workspace';
import { createEmptyBlockSuiteWorkspace } from '@affine/workspace/utils';
import type { BlockHub } from '@blocksuite/blocks';
import { assertExists } from '@blocksuite/global/utils';
import { atom } from 'jotai';
import Router from 'next/router';
import { z } from 'zod';

const rootWorkspaceMetadataV1Schema = z.object({
  id: z.string(),
  flavour: z.nativeEnum(WorkspaceFlavour),
});

const rootWorkspaceMetadataV2Schema = rootWorkspaceMetadataV1Schema.extend({
  version: z.nativeEnum(WorkspaceVersion),
});

const rootWorkspaceMetadataArraySchema = z.array(
  z.union([rootWorkspaceMetadataV1Schema, rootWorkspaceMetadataV2Schema])
);

export type RootWorkspaceMetadataV2 = z.infer<
  typeof rootWorkspaceMetadataV2Schema
>;

export type RootWorkspaceMetadataV1 = z.infer<
  typeof rootWorkspaceMetadataV1Schema
>;

export type RootWorkspaceMetadata =
  | RootWorkspaceMetadataV1
  | RootWorkspaceMetadataV2;

export const workspaceAdaptersAtom = atom<
  Record<
    WorkspaceFlavour,
    Pick<
      WorkspaceAdapter<WorkspaceFlavour>,
      'CRUD' | 'Events' | 'flavour' | 'loadPriority'
    >
  >
>(
  null as unknown as Record<
    WorkspaceFlavour,
    Pick<
      WorkspaceAdapter<WorkspaceFlavour>,
      'CRUD' | 'Events' | 'flavour' | 'loadPriority'
    >
  >
);

// #region root atoms
// root primitive atom that stores the necessary data for the whole app
// be careful when you use this atom,
// it should be used only in the root component
/**
 * root workspaces atom
 * this atom stores the metadata of all workspaces,
 * which is `id` and `flavor`, that is enough to load the real workspace data
 */
const METADATA_STORAGE_KEY = 'jotai-workspaces';
const rootWorkspacesMetadataPrimitiveAtom = atom<
  RootWorkspaceMetadata[] | null
>(null);
const rootWorkspacesMetadataPromiseAtom = atom<
  Promise<RootWorkspaceMetadata[]>
>(async (get, { signal }) => {
  const WorkspaceAdapters = get(workspaceAdaptersAtom);
  assertExists(WorkspaceAdapters, 'workspace adapter should be defined');
  const maybeMetadata = get(rootWorkspacesMetadataPrimitiveAtom);
  if (maybeMetadata !== null) {
    return maybeMetadata;
  }
  const createFirst = (): RootWorkspaceMetadataV2[] => {
    if (signal.aborted) {
      return [];
    }

    const Plugins = Object.values(WorkspaceAdapters).sort(
      (a, b) => a.loadPriority - b.loadPriority
    );

    return Plugins.flatMap(Plugin => {
      return Plugin.Events['app:init']?.().map(
        id =>
          ({
            id,
            flavour: Plugin.flavour,
            // new workspace should all support sub-doc feature
            version: WorkspaceVersion.SubDoc,
          }) satisfies RootWorkspaceMetadataV2
      );
    }).filter((ids): ids is RootWorkspaceMetadataV2 => !!ids);
  };

  if (environment.isServer) {
    // return a promise in SSR to avoid the hydration mismatch
    return Promise.resolve([]);
  } else {
    const metadata: RootWorkspaceMetadata[] = [];

    // fixme(himself65): we might not need step 1
    // step 1: try load metadata from localStorage
    {
      // don't change this key,
      // otherwise it will cause the data loss in the production
      const primitiveMetadata = localStorage.getItem(METADATA_STORAGE_KEY);
      if (primitiveMetadata) {
        try {
          const items = JSON.parse(primitiveMetadata) as z.infer<
            typeof rootWorkspaceMetadataArraySchema
          >;
          rootWorkspaceMetadataArraySchema.parse(items);
          metadata.push(...items);
        } catch (e) {
          console.error('cannot parse worksapce', e);
        }
      }

      // migration step, only data in `METADATA_STORAGE_KEY` will be migrated
      if (
        metadata.some(meta => !('version' in meta)) &&
        !globalThis.$migrationDone
      ) {
        await new Promise<void>((resolve, reject) => {
          signal.addEventListener('abort', () => reject(), { once: true });
          window.addEventListener('migration-done', () => resolve(), {
            once: true,
          });
        });
      }
    }
    // step 2: fetch from adapters
    {
      const lists = Object.values(WorkspaceAdapters)
        .sort((a, b) => a.loadPriority - b.loadPriority)
        .map(({ CRUD }) => CRUD.list);

      for (const list of lists) {
        try {
          const item = await list();
          if (metadata.length) {
            item.sort((a, b) => {
              return (
                metadata.findIndex(x => x.id === a.id) -
                metadata.findIndex(x => x.id === b.id)
              );
            });
          }
          metadata.push(
            ...item.map(x => ({
              id: x.id,
              flavour: x.flavour,
              version: WorkspaceVersion.SubDoc,
            }))
          );
        } catch (e) {
          console.error('list data error:', e);
        }
      }
    }
    // step 3: create initial workspaces
    {
      if (
        metadata.length === 0 &&
        localStorage.getItem('is-first-open') === null
      ) {
        metadata.push(...createFirst());
        console.info('create first workspace', metadata);
        localStorage.setItem('is-first-open', 'false');
      }
    }
    const metadataMap = new Map(metadata.map(x => [x.id, x]));
    // init workspace data
    metadataMap.forEach((meta, id) => {
      if (meta.flavour === WorkspaceFlavour.AFFINE_CLOUD) {
        createEmptyBlockSuiteWorkspace(id, meta.flavour, {});
      } else if (meta.flavour === WorkspaceFlavour.LOCAL) {
        createEmptyBlockSuiteWorkspace(id, meta.flavour);
      }
    });
    return Array.from(metadataMap.values());
  }
});

type SetStateAction<Value> = Value | ((prev: Value) => Value);

export const rootWorkspacesMetadataAtom = atom<
  Promise<RootWorkspaceMetadata[]>,
  [SetStateAction<RootWorkspaceMetadata[]>],
  Promise<RootWorkspaceMetadata[]>
>(
  async get => {
    if (environment.isServer) {
      return Promise.resolve([]);
    }
    const maybeMetadata = get(rootWorkspacesMetadataPrimitiveAtom);
    if (maybeMetadata !== null) {
      return maybeMetadata;
    }
    return get(rootWorkspacesMetadataPromiseAtom);
  },
  async (get, set, action) => {
    // get metadata
    let metadata: RootWorkspaceMetadata[];
    const maybeMetadata = get(rootWorkspacesMetadataPrimitiveAtom);
    if (maybeMetadata !== null) {
      metadata = maybeMetadata;
    } else {
      metadata = await get(rootWorkspacesMetadataPromiseAtom);
    }

    // update metadata
    if (typeof action === 'function') {
      metadata = action(metadata);
    } else {
      metadata = action;
    }

    const metadataMap = new Map(metadata.map(x => [x.id, x]));
    metadata = Array.from(metadataMap.values());

    // write back to localStorage
    rootWorkspaceMetadataArraySchema.parse(metadata);
    localStorage.setItem(METADATA_STORAGE_KEY, JSON.stringify(metadata));
    set(rootWorkspacesMetadataPrimitiveAtom, metadata);
    return metadata;
  }
);

// two more atoms to store the current workspace and page
export const rootCurrentWorkspaceIdAtom = atom<string | null>(null);

rootCurrentWorkspaceIdAtom.onMount = set => {
  if (environment.isBrowser) {
    const callback = (url: string) => {
      const value = url.split('/')[2];
      if (value) {
        set(value);
        localStorage.setItem('last_workspace_id', value);
      } else {
        set(null);
      }
    };
    callback(window.location.pathname);
    Router.events.on('routeChangeStart', callback);
    return () => {
      Router.events.off('routeChangeStart', callback);
    };
  }
  return;
};

export const rootCurrentPageIdAtom = atom<string | null>(null);

rootCurrentPageIdAtom.onMount = set => {
  if (environment.isBrowser) {
    const callback = (url: string) => {
      const value = url.split('/')[3];
      if (value) {
        set(value);
      } else {
        set(null);
      }
    };
    callback(window.location.pathname);
    Router.events.on('routeChangeStart', callback);
    return () => {
      Router.events.off('routeChangeStart', callback);
    };
  }
  return;
};

// blocksuite atoms,
// each app should have only one block-hub in the same time
export const rootBlockHubAtom = atom<Readonly<BlockHub> | null>(null);
//#endregion
