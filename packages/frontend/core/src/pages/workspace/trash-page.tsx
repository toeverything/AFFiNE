import { toast } from '@affine/component';
import {
  currentCollectionAtom,
  TrashOperationCell,
  VirtualizedPageList,
} from '@affine/core/components/page-list';
import { useBlockSuitePageMeta } from '@affine/core/hooks/use-block-suite-page-meta';
import { waitForCurrentWorkspaceAtom } from '@affine/core/modules/workspace';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { assertExists } from '@blocksuite/global/utils';
import { DeleteIcon } from '@blocksuite/icons';
import type { PageMeta } from '@blocksuite/store';
import { getCurrentStore } from '@toeverything/infra/atom';
import { useAtomValue } from 'jotai';
import { useCallback } from 'react';
import { type LoaderFunction } from 'react-router-dom';
import { NIL } from 'uuid';

import { usePageHelper } from '../../components/blocksuite/block-suite-page-list/utils';
import { Header } from '../../components/pure/header';
import { WindowsAppControls } from '../../components/pure/header/windows-app-controls';
import { useBlockSuiteMetaHelper } from '../../hooks/affine/use-block-suite-meta-helper';
import { EmptyPageList } from './page-list-empty';
import { useFilteredPageMetas } from './pages';
import * as styles from './trash-page.css';

const isWindowsDesktop = environment.isDesktop && environment.isWindows;
const TrashHeader = () => {
  const t = useAFFiNEI18N();
  return (
    <Header
      left={
        <div className={styles.trashTitle}>
          <DeleteIcon className={styles.trashIcon} />
          {t['com.affine.workspaceSubPath.trash']()}
        </div>
      }
      right={
        isWindowsDesktop ? (
          <div style={{ marginRight: -16 }}>
            <WindowsAppControls />
          </div>
        ) : null
      }
    />
  );
};

export const loader: LoaderFunction = async () => {
  // to fix the bug that the trash page list is not updated when route from collection to trash
  // but it's not a good solution, the page will jitter when collection and trash are switched between each other.
  // TODO: fix this bug

  const rootStore = getCurrentStore();
  rootStore.set(currentCollectionAtom, NIL);
  return null;
};

export const TrashPage = () => {
  const currentWorkspace = useAtomValue(waitForCurrentWorkspaceAtom);
  const blockSuiteWorkspace = currentWorkspace.blockSuiteWorkspace;
  assertExists(blockSuiteWorkspace);

  const pageMetas = useBlockSuitePageMeta(blockSuiteWorkspace);
  const filteredPageMetas = useFilteredPageMetas(
    'trash',
    pageMetas,
    blockSuiteWorkspace
  );

  const { restoreFromTrash, permanentlyDeletePage } =
    useBlockSuiteMetaHelper(blockSuiteWorkspace);
  const { isPreferredEdgeless } = usePageHelper(blockSuiteWorkspace);
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
      <TrashHeader />
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
