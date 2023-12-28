import type {
  JobMiddleware,
  Page,
  PageMeta,
  PageSnapshot,
  Workspace,
  WorkspaceInfoSnapshot,
} from '@blocksuite/store';
import { Job } from '@blocksuite/store';
import type { createStore, WritableAtom } from 'jotai/vanilla';
import { Map as YMap } from 'yjs';

import { getLatestVersions } from '../migration/blocksuite';
import { replaceIdMiddleware } from './middleware';

export async function initEmptyPage(page: Page, title?: string) {
  await page.load(() => {
    const pageBlockId = page.addBlock('affine:page', {
      title: new page.Text(title ?? ''),
    });
    page.addBlock('affine:surface', {}, pageBlockId);
    const noteBlockId = page.addBlock('affine:note', {}, pageBlockId);
    page.addBlock('affine:paragraph', {}, noteBlockId);
  });
}

/**
 * FIXME: Use exported json data to instead of building data.
 */
export async function buildShowcaseWorkspace(
  workspace: Workspace,
  {
    store,
    atoms,
  }: {
    atoms: {
      pageMode: WritableAtom<
        undefined,
        [pageId: string, mode: 'page' | 'edgeless'],
        void
      >;
    };
    store: ReturnType<typeof createStore>;
  }
) {
  const { onboarding } = await import('@affine/templates');

  const info = onboarding['info.json'] as WorkspaceInfoSnapshot;

  const migrationMiddleware: JobMiddleware = ({ slots, workspace }) => {
    slots.afterImport.on(payload => {
      if (payload.type === 'page') {
        workspace.schema.upgradePage(
          info?.pageVersion ?? 0,
          info?.blockVersions ?? {},
          payload.page.spaceDoc
        );
      }
    });
  };

  const job = new Job({
    workspace,
    middlewares: [replaceIdMiddleware, migrationMiddleware],
  });

  job.snapshotToWorkspaceInfo(info);

  // for now all onboarding assets are considered served via CDN
  // hack assets so that every blob exists
  // @ts-expect-error - rethinking API
  job._assetsManager.writeToBlob = async () => {};

  const pageSnapshots: PageSnapshot[] = Object.entries(onboarding)
    .filter(([key]) => {
      return key.endsWith('snapshot.json');
    })
    .map(([_, value]) => value as unknown as PageSnapshot);

  await Promise.all(
    pageSnapshots.map(snapshot => {
      return job.snapshotToPage(snapshot);
    })
  );

  const newVersions = getLatestVersions(workspace.schema);
  workspace.doc
    .getMap('meta')
    .set('blockVersions', new YMap(Object.entries(newVersions)));

  // todo: find better way to do the following
  // perhaps put them into middleware?
  {
    // the "AFFiNE - not just a note-taking app" page should be set to edgeless mode
    const edgelessPage1 = (workspace.meta.pages as PageMeta[])?.find(
      p => p.title === 'AFFiNE - not just a note-taking app'
    )?.id;

    if (edgelessPage1) {
      store.set(atoms.pageMode, edgelessPage1, 'edgeless');
    }

    // should jump to "Getting Started" by default
    const gettingStartedPage = (workspace.meta.pages as PageMeta[])?.find(p =>
      p.title.startsWith('Getting Started')
    )?.id;

    if (gettingStartedPage) {
      workspace.setPageMeta(gettingStartedPage, {
        jumpOnce: true,
      });
    }
  }
}
