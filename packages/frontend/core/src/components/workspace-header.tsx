import {
  CollectionList,
  FilterList,
  SaveAsCollectionButton,
  useCollectionManager,
} from '@affine/component/page-list';
import { Unreachable } from '@affine/env/constant';
import type { Collection, Filter } from '@affine/env/filter';
import type {
  WorkspaceFlavour,
  WorkspaceHeaderProps,
} from '@affine/env/workspace';
import { WorkspaceSubPath } from '@affine/env/workspace';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { DeleteIcon } from '@blocksuite/icons';
import { useAsyncCallback } from '@toeverything/hooks/affine-async-hooks';
import { useSetAtom } from 'jotai/react';
import { useCallback } from 'react';

import { collectionsCRUDAtom } from '../atoms/collections';
import { appHeaderAtom, mainContainerAtom } from '../atoms/element';
import { useAllPageListConfig } from '../hooks/affine/use-all-page-list-config';
import { useDeleteCollectionInfo } from '../hooks/affine/use-delete-collection-info';
import { useNavigateHelper } from '../hooks/use-navigate-helper';
import { useWorkspace } from '../hooks/use-workspace';
import { SharePageModal } from './affine/share-page-modal';
import { BlockSuiteHeaderTitle } from './blocksuite/block-suite-header-title';
import { filterContainerStyle } from './filter-container.css';
import { Header } from './pure/header';
import { PluginHeader } from './pure/plugin-header';
import { WorkspaceModeFilterTab } from './pure/workspace-mode-filter-tab';
import * as styles from './workspace-header.css';

const FilterContainer = ({ workspaceId }: { workspaceId: string }) => {
  const currentWorkspace = useWorkspace(workspaceId);
  const navigateHelper = useNavigateHelper();
  const setting = useCollectionManager(collectionsCRUDAtom);
  const saveToCollection = useCallback(
    async (collection: Collection) => {
      await setting.createCollection({
        ...collection,
        filterList: setting.currentCollection.filterList,
      });
      navigateHelper.jumpToCollection(workspaceId, collection.id);
    },
    [setting, navigateHelper, workspaceId]
  );

  const onFilterChange = useAsyncCallback(
    async (filterList: Filter[]) => {
      await setting.updateCollection({
        ...setting.currentCollection,
        filterList,
      });
    },
    [setting]
  );

  if (!setting.isDefault || !setting.currentCollection.filterList.length) {
    return null;
  }

  return (
    <div className={filterContainerStyle}>
      <div style={{ flex: 1 }}>
        <FilterList
          propertiesMeta={currentWorkspace.blockSuiteWorkspace.meta.properties}
          value={setting.currentCollection.filterList}
          onChange={onFilterChange}
        />
      </div>
      <div>
        {setting.currentCollection.filterList.length > 0 ? (
          <SaveAsCollectionButton
            onConfirm={saveToCollection}
          ></SaveAsCollectionButton>
        ) : null}
      </div>
    </div>
  );
};

export function WorkspaceHeader({
  currentWorkspaceId,
  currentEntry,
  rightSlot,
}: WorkspaceHeaderProps<WorkspaceFlavour>) {
  const setAppHeader = useSetAtom(appHeaderAtom);

  const currentWorkspace = useWorkspace(currentWorkspaceId);
  const workspace = currentWorkspace.blockSuiteWorkspace;
  const setting = useCollectionManager(collectionsCRUDAtom);
  const config = useAllPageListConfig();
  const userInfo = useDeleteCollectionInfo();

  const t = useAFFiNEI18N();

  // route in all page
  if (
    'subPath' in currentEntry &&
    currentEntry.subPath === WorkspaceSubPath.ALL
  ) {
    return (
      <>
        <Header
          mainContainerAtom={mainContainerAtom}
          ref={setAppHeader}
          left={
            <CollectionList
              userInfo={userInfo}
              allPageListConfig={config}
              setting={setting}
              propertiesMeta={workspace.meta.properties}
            />
          }
          right={rightSlot}
          center={<WorkspaceModeFilterTab />}
        />
        <FilterContainer workspaceId={currentWorkspaceId} />
      </>
    );
  }

  // route in shared
  if (
    'subPath' in currentEntry &&
    currentEntry.subPath === WorkspaceSubPath.SHARED
  ) {
    return (
      <Header
        mainContainerAtom={mainContainerAtom}
        ref={setAppHeader}
        center={<WorkspaceModeFilterTab />}
      />
    );
  }

  // route in trash
  if (
    'subPath' in currentEntry &&
    currentEntry.subPath === WorkspaceSubPath.TRASH
  ) {
    return (
      <Header
        mainContainerAtom={mainContainerAtom}
        ref={setAppHeader}
        left={
          <div className={styles.trashTitle}>
            <DeleteIcon className={styles.trashIcon} />
            {t['com.affine.workspaceSubPath.trash']()}
          </div>
        }
      />
    );
  }

  // route in edit page
  if ('pageId' in currentEntry) {
    const currentPage = workspace.getPage(currentEntry.pageId);
    const sharePageModal = currentPage ? (
      <SharePageModal workspace={currentWorkspace} page={currentPage} />
    ) : null;
    return (
      <Header
        mainContainerAtom={mainContainerAtom}
        ref={setAppHeader}
        center={
          <BlockSuiteHeaderTitle
            workspace={currentWorkspace}
            pageId={currentEntry.pageId}
          />
        }
        right={
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {sharePageModal}
            <PluginHeader />
          </div>
        }
        bottomBorder
      />
    );
  }

  throw new Unreachable();
}
