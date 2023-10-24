import {
  CollectionList,
  FilterList,
  SaveAsCollectionButton,
  useCollectionManager,
} from '@affine/component/page-list';
import { Unreachable } from '@affine/env/constant';
import type { Collection } from '@affine/env/filter';
import type {
  WorkspaceFlavour,
  WorkspaceHeaderProps,
} from '@affine/env/workspace';
import { WorkspaceSubPath } from '@affine/env/workspace';
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

const FilterContainer = ({ workspaceId }: { workspaceId: string }) => {
  const currentWorkspace = useWorkspace(workspaceId);
  const navigateHelper = useNavigateHelper();
  const setting = useCollectionManager(collectionsCRUDAtom);
  const saveToCollection = useCallback(
    async (collection: Collection) => {
      await setting.createCollection(collection);
      navigateHelper.jumpToCollection(workspaceId, collection.id);
    },
    [workspaceId, navigateHelper, setting]
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
          onChange={filterList => {
            return setting.updateCollection({
              ...setting.currentCollection,
              filterList,
            });
          }}
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
}: WorkspaceHeaderProps<WorkspaceFlavour>) {
  const setAppHeader = useSetAtom(appHeaderAtom);

  const currentWorkspace = useWorkspace(currentWorkspaceId);
  const workspace = currentWorkspace.blockSuiteWorkspace;
  const setting = useCollectionManager(collectionsCRUDAtom);
  const navigateHelper = useNavigateHelper();
  const backToAll = useCallback(() => {
    navigateHelper.jumpToSubPath(currentWorkspace.id, WorkspaceSubPath.ALL);
  }, [navigateHelper, currentWorkspace.id]);
  const jumpToCollection = useCallback(
    (id: string) => {
      navigateHelper.jumpToCollection(currentWorkspace.id, id);
    },
    [navigateHelper, currentWorkspace.id]
  );
  const config = useAllPageListConfig();
  const userInfo = useDeleteCollectionInfo();
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
              info={userInfo}
              allPageListConfig={config}
              jumpToCollection={jumpToCollection}
              backToAll={backToAll}
              setting={setting}
              propertiesMeta={workspace.meta.properties}
            />
          }
          center={<WorkspaceModeFilterTab />}
        />
        <FilterContainer workspaceId={currentWorkspaceId} />
      </>
    );
  }

  // route in shared or trash
  if (
    'subPath' in currentEntry &&
    (currentEntry.subPath === WorkspaceSubPath.SHARED ||
      currentEntry.subPath === WorkspaceSubPath.TRASH)
  ) {
    return (
      <Header
        mainContainerAtom={mainContainerAtom}
        ref={setAppHeader}
        center={<WorkspaceModeFilterTab />}
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
      />
    );
  }

  throw new Unreachable();
}
