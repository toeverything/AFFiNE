import { useBlockSuiteDocMeta } from '@affine/core/components/hooks/use-block-suite-page-meta';
import {
  useFilteredPageMetas,
  VirtualizedTrashList,
} from '@affine/core/components/page-list';
import { Header } from '@affine/core/components/pure/header';
import { useI18n } from '@affine/i18n';
import { assertExists } from '@blocksuite/affine/global/utils';
import { DeleteIcon } from '@blocksuite/icons/rc';
import {
  GlobalContextService,
  useService,
  WorkspaceService,
} from '@toeverything/infra';
import { useEffect } from 'react';

import {
  useIsActiveView,
  ViewBody,
  ViewHeader,
  ViewIcon,
  ViewTitle,
} from '../../../modules/workbench';
import { EmptyPageList } from './page-list-empty';
import * as styles from './trash-page.css';

const TrashHeader = () => {
  const t = useI18n();
  return (
    <Header
      left={
        <div className={styles.trashTitle}>
          <DeleteIcon className={styles.trashIcon} />
          {t['com.affine.workspaceSubPath.trash']()}
        </div>
      }
    />
  );
};

export const TrashPage = () => {
  const globalContextService = useService(GlobalContextService);
  const currentWorkspace = useService(WorkspaceService).workspace;
  const docCollection = currentWorkspace.docCollection;
  assertExists(docCollection);

  const pageMetas = useBlockSuiteDocMeta(docCollection);
  const filteredPageMetas = useFilteredPageMetas(pageMetas, {
    trash: true,
  });

  const isActiveView = useIsActiveView();

  useEffect(() => {
    if (isActiveView) {
      globalContextService.globalContext.isTrash.set(true);

      return () => {
        globalContextService.globalContext.isTrash.set(false);
      };
    }
    return;
  }, [globalContextService.globalContext.isTrash, isActiveView]);

  const t = useI18n();
  return (
    <>
      <ViewTitle title={t['Trash']()} />
      <ViewIcon icon={'trash'} />
      <ViewHeader>
        <TrashHeader />
      </ViewHeader>
      <ViewBody>
        <div className={styles.body}>
          {filteredPageMetas.length > 0 ? (
            <VirtualizedTrashList />
          ) : (
            <EmptyPageList type="trash" />
          )}
        </div>
      </ViewBody>
    </>
  );
};

export const Component = () => {
  return <TrashPage />;
};
