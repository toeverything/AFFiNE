import {
  useFilteredPageMetas,
  VirtualizedTrashList,
} from '@affine/core/components/page-list';
import { Header } from '@affine/core/components/pure/header';
import { useBlockSuiteDocMeta } from '@affine/core/hooks/use-block-suite-page-meta';
import { useI18n } from '@affine/i18n';
import { assertExists } from '@blocksuite/global/utils';
import { DeleteIcon } from '@blocksuite/icons/rc';
import { useService, WorkspaceService } from '@toeverything/infra';

import { ViewBody, ViewHeader } from '../../modules/workbench';
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
  const currentWorkspace = useService(WorkspaceService).workspace;
  const docCollection = currentWorkspace.docCollection;
  assertExists(docCollection);

  const pageMetas = useBlockSuiteDocMeta(docCollection);
  const filteredPageMetas = useFilteredPageMetas(pageMetas, {
    trash: true,
  });

  return (
    <>
      <ViewHeader>
        <TrashHeader />
      </ViewHeader>
      <ViewBody>
        <div className={styles.body}>
          {filteredPageMetas.length > 0 ? (
            <VirtualizedTrashList />
          ) : (
            <EmptyPageList
              type="trash"
              docCollection={currentWorkspace.docCollection}
            />
          )}
        </div>
      </ViewBody>
    </>
  );
};

export const Component = () => {
  return <TrashPage />;
};
