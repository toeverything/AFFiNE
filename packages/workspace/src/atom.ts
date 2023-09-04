import type { WorkspaceAdapter } from '@affine/env/workspace';
import { WorkspaceFlavour } from '@affine/env/workspace';
import type { BlockHub } from '@blocksuite/blocks';
import { assertEquals, assertExists } from '@blocksuite/global/utils';
import {
  currentPageIdAtom,
  currentWorkspaceIdAtom,
} from '@toeverything/infra/atom';
import { WorkspaceVersion } from '@toeverything/infra/blocksuite';
import { type Atom, atom } from 'jotai/vanilla';
import { z } from 'zod';

import { getOrCreateWorkspace } from './manager';

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
 * which is `id` and `flavor,` that is enough to load the real workspace data
 */
const METADATA_STORAGE_KEY = 'jotai-workspaces';
const rootWorkspacesMetadataPrimitiveAtom = atom<Promise<
  RootWorkspaceMetadata[]
> | null>(null);

type Getter = <Value>(atom: Atom<Value>) => Value;

type FetchMetadata = (
  get: Getter,
  options: { signal: AbortSignal }
) => Promise<RootWorkspaceMetadata[]>;

/**
 * @internal
 */
const fetchMetadata: FetchMetadata = async (get, { signal }) => {
  const WorkspaceAdapters = get(workspaceAdaptersAtom);
  assertExists(WorkspaceAdapters, 'workspace adapter should be defined');
  const metadata: RootWorkspaceMetadata[] = [];

  // step 1: try load metadata from localStorage.
  //
  // we need this step because workspaces have the order.
  {
    const loadFromLocalStorage = (): RootWorkspaceMetadata[] => {
      // don't change this key,
      // otherwise it will cause the data loss in the production
      const primitiveMetadata = localStorage.getItem(METADATA_STORAGE_KEY);
      if (primitiveMetadata) {
        try {
          const items = JSON.parse(primitiveMetadata) as z.infer<
            typeof rootWorkspaceMetadataArraySchema
          >;
          rootWorkspaceMetadataArraySchema.parse(items);
          return [...items];
        } catch (e) {
          console.error('cannot parse worksapce', e);
        }
        return [];
      }
      return [];
    };

    const maybeMetadata = loadFromLocalStorage();

    // migration step, only data in `METADATA_STORAGE_KEY` will be migrated
    if (
      maybeMetadata.some(meta => !('version' in meta)) &&
      !globalThis.$migrationDone
    ) {
      await new Promise<void>((resolve, reject) => {
        signal.addEventListener('abort', () => reject(), { once: true });
        window.addEventListener('migration-done', () => resolve(), {
          once: true,
        });
      });
    }

    metadata.push(...loadFromLocalStorage());
  }
  // step 2: fetch from adapters
  {
    const Adapters = Object.values(WorkspaceAdapters).sort(
      (a, b) => a.loadPriority - b.loadPriority
    );

    for (const Adapter of Adapters) {
      const { CRUD, flavour: currentFlavour } = Adapter;
      if (
        Adapter.Events['app:access'] &&
        !(await Adapter.Events['app:access']())
      ) {
        // skip the adapter if the user doesn't have access to it
        const removed = metadata.filter(
          meta => meta.flavour === currentFlavour
        );
        removed.forEach(meta => {
          metadata.splice(metadata.indexOf(meta), 1);
        });
        Adapter.Events['service:stop']?.();
        continue;
      }
      try {
        const item = await CRUD.list();
        // remove the metadata that is not in the list
        //  because we treat the workspace adapter as the source of truth
        {
          const removed = metadata.filter(
            meta =>
              meta.flavour === currentFlavour &&
              !item.some(x => x.id === meta.id)
          );
          removed.forEach(meta => {
            metadata.splice(metadata.indexOf(meta), 1);
          });
        }
        // sort the metadata by the order of the list
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
            version: WorkspaceVersion.DatabaseV3,
          }))
        );
      } catch (e) {
        console.error('list data error:', e);
      }
      Adapter.Events['service:start']?.();
    }
  }
  const metadataMap = new Map(metadata.map(x => [x.id, x]));
  // init workspace data
  metadataMap.forEach((meta, id) => {
    if (
      meta.flavour === WorkspaceFlavour.AFFINE_CLOUD ||
      meta.flavour === WorkspaceFlavour.LOCAL
    ) {
      getOrCreateWorkspace(id, meta.flavour);
    } else {
      throw new Error(`unknown flavour ${meta.flavour}`);
    }
  });
  const result = Array.from(metadataMap.values());
  console.info('metadata', result);
  return result;
};

const rootWorkspacesMetadataPromiseAtom = atom<
  Promise<RootWorkspaceMetadata[]>
>(async (get, { signal }) => {
  const primitiveMetadata = get(rootWorkspacesMetadataPrimitiveAtom);
  assertEquals(
    primitiveMetadata,
    null,
    'rootWorkspacesMetadataPrimitiveAtom should be null'
  );
  return fetchMetadata(get, { signal });
});

type SetStateAction<Value> = Value | ((prev: Value) => Value);

export const rootWorkspacesMetadataAtom = atom<
  Promise<RootWorkspaceMetadata[]>,
  [
    setStateAction: SetStateAction<RootWorkspaceMetadata[]>,
    newWorkspaceId?: string,
  ],
  void
>(
  async get => {
    const maybeMetadata = get(rootWorkspacesMetadataPrimitiveAtom);
    if (maybeMetadata !== null) {
      return maybeMetadata;
    }
    return get(rootWorkspacesMetadataPromiseAtom);
  },
  async (get, set, action, newWorkspaceId) => {
    const metadataPromise = get(rootWorkspacesMetadataPromiseAtom);
    const oldWorkspaceId = get(currentWorkspaceIdAtom);
    const oldPageId = get(currentPageIdAtom);

    // get metadata
    set(rootWorkspacesMetadataPrimitiveAtom, async maybeMetadataPromise => {
      let metadata: RootWorkspaceMetadata[] =
        (await maybeMetadataPromise) ?? (await metadataPromise);

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

      // if the current workspace is deleted, reset the current workspace
      if (oldWorkspaceId && metadata.some(x => x.id === oldWorkspaceId)) {
        set(currentWorkspaceIdAtom, oldWorkspaceId);
        set(currentPageIdAtom, oldPageId);
      }

      if (newWorkspaceId) {
        set(currentPageIdAtom, null);
        set(currentWorkspaceIdAtom, newWorkspaceId);
      }
      return metadata;
    });
  }
);

export const refreshRootMetadataAtom = atom(null, (get, set) => {
  const abortController = new AbortController();
  set(
    rootWorkspacesMetadataPrimitiveAtom,
    fetchMetadata(get, { signal: abortController.signal })
  );
});

// blocksuite atoms,
// each app should have only one block-hub in the same time
export const rootBlockHubAtom = atom<Readonly<BlockHub> | null>(null);
//#endregion
