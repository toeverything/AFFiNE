import { BlockSuiteEditor } from '@affine/component/block-suite-editor';
import type {
  LocalIndexedDBDownloadProvider,
  LocalWorkspace,
} from '@affine/env/workspace';
import { WorkspaceFlavour } from '@affine/env/workspace';
import type { RootWorkspaceMetadataV1 } from '@affine/workspace/atom';
import { rootWorkspacesMetadataAtom } from '@affine/workspace/atom';
import {
  migrateLocalBlobStorage,
  upgradeV1ToV2,
} from '@affine/workspace/migration';
import { createIndexedDBDownloadProvider } from '@affine/workspace/providers';
import { __unstableSchemas, AffineSchemas } from '@blocksuite/blocks/models';
import { assertExists, Workspace } from '@blocksuite/store';
import { NoSsr } from '@mui/material';
import { rootStore } from '@toeverything/plugin-infra/manager';
import {
  atom,
  createStore,
  Provider,
  useAtom,
  useAtomValue,
  useSetAtom,
} from 'jotai';
import { useRouter } from 'next/router';
import type { ReactElement } from 'react';
import { Suspense, use, useCallback } from 'react';

const store = createStore();

const workspaceIdsAtom = atom<Promise<string[]>>(async () => {
  if (typeof window === 'undefined') {
    return [];
  } else {
    const idb = await import('idb');
    const db = await idb.openDB('affine-local', 1);
    return (await db
      .transaction('workspace')
      .objectStore('workspace')
      .getAllKeys()) as string[];
  }
});

const targetIdAtom = atom<string | null>(null);

const workspaceAtom = atom<Promise<Workspace>>(async get => {
  const id = get(targetIdAtom);
  if (!id) {
    throw new Error('no id');
  }
  const workspace = new Workspace({
    id,
    isSSR: typeof window === 'undefined',
  });

  workspace.register(AffineSchemas).register(__unstableSchemas);
  const provider = createIndexedDBDownloadProvider(
    workspace.id,
    workspace.doc,
    {
      awareness: workspace.awarenessStore.awareness,
    }
  ) as LocalIndexedDBDownloadProvider;
  provider.sync();
  await provider.whenReady;
  const localWorkspace = {
    id: workspace.id,
    blockSuiteWorkspace: workspace,
    flavour: WorkspaceFlavour.LOCAL,
  } satisfies LocalWorkspace;
  const newWorkspace = upgradeV1ToV2(localWorkspace);
  await migrateLocalBlobStorage(localWorkspace.id, newWorkspace.id);
  newWorkspace.blockSuiteWorkspace;
  return newWorkspace.blockSuiteWorkspace;
});

const pageIdAtom = atom('hello-world');

const PageListSelect = () => {
  const workspace = useAtomValue(workspaceAtom);
  const setPageId = useSetAtom(pageIdAtom);
  return (
    <ul>
      {workspace.meta.pageMetas.map(meta => (
        <li
          key={meta.id}
          onClick={() => {
            setPageId(meta.id);
          }}
        >
          {meta.id}
        </li>
      ))}
    </ul>
  );
};

const WorkspaceInner = () => {
  const workspace = useAtomValue(workspaceAtom);
  const pageId = useAtomValue(pageIdAtom);
  const page = workspace.getPage(pageId);
  const onInit = useCallback(() => {}, []);
  if (!page) {
    return <PageListSelect />;
  }
  if (!page.loaded) {
    use(page.waitForLoaded());
  }
  return (
    <>
      <PageListSelect />
      <BlockSuiteEditor page={page} mode="page" onInit={onInit} />;
    </>
  );
};

const MigrationInner = () => {
  const ids = useAtomValue(workspaceIdsAtom);
  const [id, setId] = useAtom(targetIdAtom);
  const router = useRouter();
  const onWriteIntoProduction = useCallback(() => {
    assertExists(id);
    const metadata: RootWorkspaceMetadataV1 = {
      id,
      flavour: WorkspaceFlavour.LOCAL,
      version: undefined,
    };
    rootStore.set(rootWorkspacesMetadataAtom, [metadata]);
    router.push('/').catch(console.error);
  }, [id, router]);
  const writeIntoProductionNode = id && (
    <button
      data-test-id="write into production"
      onClick={onWriteIntoProduction}
    >
      write into production
    </button>
  );
  return (
    <div
      style={{
        overflow: 'auto',
        height: '100vh',
      }}
    >
      <ul>
        {ids.map(id => (
          <li
            onClick={() => {
              setId(id);
            }}
            key={id}
          >
            {id}
          </li>
        ))}
      </ul>
      {writeIntoProductionNode}
      <Suspense fallback="loading...">{id && <WorkspaceInner />}</Suspense>
    </div>
  );
};

export default function MigrationPage(): ReactElement {
  return (
    <Provider store={store}>
      <NoSsr>
        <Suspense>
          <MigrationInner />
        </Suspense>
      </NoSsr>
    </Provider>
  );
}
