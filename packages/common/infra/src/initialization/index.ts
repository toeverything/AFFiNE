import type { WorkspaceFlavour } from '@affine/env/workspace';
import type {
  JobMiddleware,
  Page,
  PageSnapshot,
  WorkspaceInfoSnapshot,
} from '@blocksuite/store';
import { Job } from '@blocksuite/store';
import { Map as YMap } from 'yjs';

import { getLatestVersions } from '../blocksuite/migration/blocksuite';
import { PageRecordList } from '../page';
import type { WorkspaceManager } from '../workspace';
import { replaceIdMiddleware } from './middleware';

export function initEmptyPage(page: Page, title?: string) {
  page.load(() => {
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
  workspaceManager: WorkspaceManager,
  flavour: WorkspaceFlavour,
  workspaceName: string
) {
  const meta = await workspaceManager.createWorkspace(
    flavour,
    async (blockSuiteWorkspace, blobStorage) => {
      blockSuiteWorkspace.meta.setName(workspaceName);
      const { onboarding } = await import('@affine/templates');

      const info = onboarding['info.json'] as WorkspaceInfoSnapshot;
      const blob = onboarding['blob.json'] as { [key: string]: string };

      const migrationMiddleware: JobMiddleware = ({ slots, workspace }) => {
        slots.afterImport.on(payload => {
          if (payload.type === 'page') {
            workspace.schema.upgradePage(
              info?.pageVersion ?? 0,
              {},
              payload.page.spaceDoc
            );
          }
        });
      };

      const job = new Job({
        workspace: blockSuiteWorkspace,
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

      const newVersions = getLatestVersions(blockSuiteWorkspace.schema);
      blockSuiteWorkspace.doc
        .getMap('meta')
        .set('blockVersions', new YMap(Object.entries(newVersions)));

      for (const [key, base64] of Object.entries(blob)) {
        await blobStorage.set(key, new Blob([base64ToUint8Array(base64)]));
      }
    }
  );

  const { workspace, release } = workspaceManager.open(meta);

  await workspace.engine.sync.waitForLoadedRootDoc();

  const pageRecordList = workspace.services.get(PageRecordList);

  // todo: find better way to do the following
  // perhaps put them into middleware?
  {
    // the "Write, Draw, Plan all at Once." page should be set to edgeless mode
    const edgelessPage1 = pageRecordList.records.value.find(
      p => p.title.value === 'Write, Draw, Plan all at Once.'
    );

    if (edgelessPage1) {
      edgelessPage1.setMode('edgeless');
    }

    // should jump to "Write, Draw, Plan all at Once." by default
    const defaultPage = pageRecordList.records.value.find(p =>
      p.title.value.startsWith('Write, Draw, Plan all at Once.')
    );

    if (defaultPage) {
      defaultPage.setMeta({
        jumpOnce: true,
      });
    }
  }
  release();
  return meta;
}

function base64ToUint8Array(base64: string) {
  const binaryString = atob(base64);
  const binaryArray = binaryString.split('').map(function (char) {
    return char.charCodeAt(0);
  });
  return new Uint8Array(binaryArray);
}
