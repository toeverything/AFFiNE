import type { WorkspaceAdapter } from '@affine/env/workspace';
import { WorkspaceFlavour, WorkspaceVersion } from '@affine/env/workspace';
import type { EditorContainer } from '@blocksuite/editor';
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
  Record<WorkspaceFlavour, WorkspaceAdapter<WorkspaceFlavour>>
>(
  null as unknown as Record<
    WorkspaceFlavour,
    WorkspaceAdapter<WorkspaceFlavour>
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
  assertExists(WorkspaceAdapters);
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
          } satisfies RootWorkspaceMetadataV2)
      );
    }).filter((ids): ids is RootWorkspaceMetadataV2 => !!ids);
  };

  if (environment.isServer) {
    return [];
  } else {
    const metadata: RootWorkspaceMetadata[] = [];
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
    return metadata;
  }
});

type SetStateAction<Value> = Value | ((prev: Value) => Value);

export const rootWorkspacesMetadataAtom = atom<
  Promise<RootWorkspaceMetadata[]>,
  [SetStateAction<RootWorkspaceMetadata[]>],
  Promise<RootWorkspaceMetadata[]>
>(
  async get => {
    const maybeMetadata = get(rootWorkspacesMetadataPrimitiveAtom);
    if (maybeMetadata !== null) {
      return maybeMetadata;
    }
    return get(rootWorkspacesMetadataPromiseAtom);
  },
  async (get, set, action) => {
    let metadata: RootWorkspaceMetadata[];
    const maybeMetadata = get(rootWorkspacesMetadataPrimitiveAtom);
    if (maybeMetadata !== null) {
      metadata = maybeMetadata;
    } else {
      metadata = await get(rootWorkspacesMetadataPromiseAtom);
    }
    if (typeof action === 'function') {
      metadata = action(metadata);
    }
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
  if (typeof window !== 'undefined') {
    const callback = (url: string) => {
      const value = url.split('/')[2];
      if (value) {
        set(value);
        if (typeof window !== 'undefined') {
          localStorage.setItem('last_workspace_id', value);
        }
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
  if (typeof window !== 'undefined') {
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

// current editor atom, each app should have only one editor in the same time
export const rootCurrentEditorAtom = atom<Readonly<EditorContainer> | null>(
  null
);
//#endregion
