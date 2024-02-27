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
    async blockSuiteWorkspace => {
      blockSuiteWorkspace.meta.setName(workspaceName);
      const { onboarding } = await import('@affine/templates');

      const info = onboarding['info.json'] as WorkspaceInfoSnapshot;

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
    }
  );

  const { workspace, release } = workspaceManager.open(meta);

  await workspace.engine.sync.waitForLoadedRootDoc();

  const pageRecordList = workspace.services.get(PageRecordList);

  // todo: find better way to do the following
  // perhaps put them into middleware?
  {
    // the "AFFiNE - not just a note-taking app" page should be set to edgeless mode
    const edgelessPage1 = pageRecordList.records.value.find(
      p => p.title.value === 'AFFiNE - not just a note-taking app'
    );

    if (edgelessPage1) {
      edgelessPage1.setMode('edgeless');
    }

    // should jump to "AFFiNE - not just a note-taking app" by default
    const defaultPage = pageRecordList.records.value.find(p =>
      p.title.value.startsWith('AFFiNE - not just a note-taking app')
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
