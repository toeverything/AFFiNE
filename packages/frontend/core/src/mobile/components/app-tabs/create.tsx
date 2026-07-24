import { toast } from '@affine/component';
import { usePageHelper } from '@affine/core/blocksuite/block-suite-page-list/utils';
import { useAsyncCallback } from '@affine/core/components/hooks/affine-async-hooks';
import { DocsService } from '@affine/core/modules/doc';
import { TemplateDocService } from '@affine/core/modules/template-doc';
import { WorkbenchService } from '@affine/core/modules/workbench';
import { WorkspaceService } from '@affine/core/modules/workspace';
import track from '@affine/track';
import { EditIcon } from '@blocksuite/icons/rc';
import { useLiveData, useService } from '@toeverything/infra';

import { TabItem } from './tab-item';
import type { AppTabCustomFCProps } from './type';

const ROOT_DOC_READY_TIMEOUT_MS = 8_000;

export const AppTabCreate = ({ tab }: AppTabCustomFCProps) => {
  const workbench = useService(WorkbenchService).workbench;
  const workspaceService = useService(WorkspaceService);
  const templateDocService = useService(TemplateDocService);
  const docsService = useService(DocsService);

  const currentWorkspace = workspaceService.workspace;
  const pageHelper = usePageHelper(currentWorkspace.docCollection);
  const enablePageTemplate = useLiveData(
    templateDocService.setting.enablePageTemplate$
  );
  const pageTemplateDocId = useLiveData(
    templateDocService.setting.pageTemplateDocId$
  );

  const createPage = useAsyncCallback(async () => {
    try {
      await Promise.race([
        currentWorkspace.engine.doc.waitForDocLoaded(currentWorkspace.id),
        new Promise((_, reject) =>
          window.setTimeout(
            () => reject(new Error('Workspace root doc is not loaded')),
            ROOT_DOC_READY_TIMEOUT_MS
          )
        ),
      ]).catch(error => {
        console.warn(
          'Workspace root doc is not loaded before creating doc',
          error
        );
      });

      if (enablePageTemplate && pageTemplateDocId) {
        const docId =
          await docsService.duplicateFromTemplate(pageTemplateDocId);
        workbench.openDoc({ docId, fromTab: 'true' });
      } else {
        const doc = pageHelper.createPage(undefined, { show: false });
        workbench.openDoc({ docId: doc.id, fromTab: 'true' });
      }
      track.$.navigationPanel.$.createDoc();
    } catch (error) {
      console.error('Failed to create mobile doc', error);
      toast('Failed to create doc. Please try again.');
    }
  }, [
    currentWorkspace.engine.doc,
    currentWorkspace.id,
    docsService,
    enablePageTemplate,
    pageHelper,
    pageTemplateDocId,
    workbench,
  ]);

  return (
    <TabItem id={tab.key} onClick={createPage} label="New Page">
      <EditIcon />
    </TabItem>
  );
};
