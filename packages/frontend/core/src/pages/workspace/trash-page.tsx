import {
  useFilteredPageMetas,
  VirtualizedTrashList,
} from '@affine/core/components/page-list';
import { Header } from '@affine/core/components/pure/header';
import { useBlockSuiteDocMeta } from '@affine/core/hooks/use-block-suite-page-meta';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { assertExists } from '@blocksuite/global/utils';
import { DeleteIcon } from '@blocksuite/icons/rc';
import { useService, WorkspaceService } from '@toeverything/infra';

import { ViewBodyIsland, ViewHeaderIsland } from '../../modules/workbench';
import { EmptyPageList } from './page-list-empty';
import * as styles from './trash-page.css';

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
      <ViewHeaderIsland>
        <TrashHeader />
      </ViewHeaderIsland>
      <ViewBodyIsland>
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
      </ViewBodyIsland>
    </>
  );
};

export const Component = () => {
  return <TrashPage />;
};
