import { toast } from '@affine/component';
import { usePageHelper } from '@affine/core/blocksuite/block-suite-page-list/utils';
import { useAsyncCallback } from '@affine/core/components/hooks/affine-async-hooks';
import { waitForRootDocReady } from '@affine/core/mobile/utils';
import { DocsService } from '@affine/core/modules/doc';
import { TemplateDocService } from '@affine/core/modules/template-doc';
import { WorkbenchService } from '@affine/core/modules/workbench';
import { WorkspaceService } from '@affine/core/modules/workspace';
import { useI18n } from '@affine/i18n';
import track from '@affine/track';
import { EditIcon } from '@blocksuite/icons/rc';
import { useLiveData, useService } from '@toeverything/infra';

import { TabItem } from './tab-item';
import type { AppTabCustomFCProps } from './type';

export const AppTabCreate = ({ tab }: AppTabCustomFCProps) => {
  const t = useI18n();
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
      await waitForRootDocReady(currentWorkspace);

      if (enablePageTemplate && pageTemplateDocId) {
        const docId =
          await docsService.duplicateFromTemplate(pageTemplateDocId);
        workbench.openDoc(docId);
      } else {
        const doc = pageHelper.createPage(undefined, { show: false });
        workbench.openDoc(doc.id);
      }
      track.$.navigationPanel.$.createDoc();
    } catch (error) {
      console.error('Failed to create mobile doc', error);
      toast(t['com.affine.mobile.create-doc.error.toast']());
    }
  }, [
    currentWorkspace,
    docsService,
    enablePageTemplate,
    pageHelper,
    pageTemplateDocId,
    t,
    workbench,
  ]);

  return (
    <TabItem id={tab.key} onClick={createPage} label={t['New Page']()}>
      <EditIcon />
    </TabItem>
  );
};
