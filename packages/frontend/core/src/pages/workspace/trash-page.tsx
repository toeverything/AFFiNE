import { toast } from '@affine/component';
import { usePageHelper } from '@affine/core/components/blocksuite/block-suite-page-list/utils';
import {
  currentCollectionAtom,
  type ListItem,
  ListTableHeader,
  PageListItemRenderer,
  TrashOperationCell,
  useFilteredPageMetas,
  VirtualizedList,
} from '@affine/core/components/page-list';
import { pageHeaderColsDef } from '@affine/core/components/page-list/header-col-def';
import { Header } from '@affine/core/components/pure/header';
import { WindowsAppControls } from '@affine/core/components/pure/header/windows-app-controls';
import { useBlockSuiteMetaHelper } from '@affine/core/hooks/affine/use-block-suite-meta-helper';
import { useBlockSuitePageMeta } from '@affine/core/hooks/use-block-suite-page-meta';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { assertExists } from '@blocksuite/global/utils';
import { DeleteIcon } from '@blocksuite/icons';
import type { PageMeta } from '@blocksuite/store';
import { Workspace } from '@toeverything/infra';
import { getCurrentStore } from '@toeverything/infra/atom';
import { useService } from '@toeverything/infra/di';
import { useCallback } from 'react';
import { type LoaderFunction } from 'react-router-dom';
import { NIL } from 'uuid';

import { EmptyPageList } from './page-list-empty';
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
  const currentWorkspace = useService(Workspace);
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
    (item: ListItem) => {
      const page = item as PageMeta;
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
  const pageItemRenderer = useCallback((item: ListItem) => {
    return <PageListItemRenderer {...item} />;
  }, []);
  const pageHeaderRenderer = useCallback(() => {
    return <ListTableHeader headerCols={pageHeaderColsDef} />;
  }, []);
  return (
    <div className={styles.root}>
      <TrashHeader />
      {filteredPageMetas.length > 0 ? (
        <VirtualizedList
          items={filteredPageMetas}
          rowAsLink
          groupBy={false}
          isPreferredEdgeless={isPreferredEdgeless}
          blockSuiteWorkspace={currentWorkspace.blockSuiteWorkspace}
          operationsRenderer={pageOperationsRenderer}
          itemRenderer={pageItemRenderer}
          headerRenderer={pageHeaderRenderer}
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
