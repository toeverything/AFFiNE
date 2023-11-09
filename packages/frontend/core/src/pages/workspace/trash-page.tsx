import { toast } from '@affine/component';
import {
  TrashOperationCell,
  VirtualizedPageList,
} from '@affine/component/page-list';
import { WorkspaceSubPath } from '@affine/env/workspace';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { assertExists } from '@blocksuite/global/utils';
import type { PageMeta } from '@blocksuite/store';
import { useBlockSuitePageMeta } from '@toeverything/hooks/use-block-suite-page-meta';
import { useCallback } from 'react';

import { usePageHelper } from '../../components/blocksuite/block-suite-page-list/utils';
import { WorkspaceHeader } from '../../components/workspace-header';
import { useBlockSuiteMetaHelper } from '../../hooks/affine/use-block-suite-meta-helper';
import { useCurrentWorkspace } from '../../hooks/current/use-current-workspace';
import * as styles from './all-page.css';
import { EmptyPageList } from './page-list-empty';
import { useFilteredPageMetas } from './pages';

export const TrashPage = () => {
  const [currentWorkspace] = useCurrentWorkspace();
  // todo(himself65): refactor to plugin
  const blockSuiteWorkspace = currentWorkspace.blockSuiteWorkspace;
  assertExists(blockSuiteWorkspace);
  const pageMetas = useBlockSuitePageMeta(currentWorkspace.blockSuiteWorkspace);
  const filteredPageMetas = useFilteredPageMetas(
    'trash',
    pageMetas,
    currentWorkspace.blockSuiteWorkspace
  );
  const { restoreFromTrash, permanentlyDeletePage } =
    useBlockSuiteMetaHelper(blockSuiteWorkspace);
  const { isPreferredEdgeless } = usePageHelper(
    currentWorkspace.blockSuiteWorkspace
  );
  const t = useAFFiNEI18N();
  const pageOperationsRenderer = useCallback(
    (page: PageMeta) => {
      const onRestorePage = () => {
        restoreFromTrash(page.id);
        toast(
          t['com.affine.toastMessage.restored']({
            title: page.title || 'Untitled',
          })
        );
      };
      const onPermanentlyDeletePage = () => {
        permanentlyDeletePage(page.id);
        toast(t['com.affine.toastMessage.permanentlyDeleted']());
      };
      return (
        <TrashOperationCell
          onPermanentlyDeletePage={onPermanentlyDeletePage}
          onRestorePage={onRestorePage}
        />
      );
    },
    [permanentlyDeletePage, restoreFromTrash, t]
  );
  return (
    <div className={styles.root}>
      <WorkspaceHeader
        currentWorkspaceId={currentWorkspace.id}
        currentEntry={{
          subPath: WorkspaceSubPath.TRASH,
        }}
      />
      {filteredPageMetas.length > 0 ? (
        <VirtualizedPageList
          pages={filteredPageMetas}
          rowAsLink
          groupBy={false}
          isPreferredEdgeless={isPreferredEdgeless}
          blockSuiteWorkspace={currentWorkspace.blockSuiteWorkspace}
          pageOperationsRenderer={pageOperationsRenderer}
        />
      ) : (
        <EmptyPageList
          type="trash"
          blockSuiteWorkspace={currentWorkspace.blockSuiteWorkspace}
        />
      )}
    </div>
  );
};

export const Component = () => {
  return <TrashPage />;
};
