import {
  CollectionList,
  FilterList,
  SaveCollectionButton,
  useCollectionManager,
} from '@affine/component/page-list';
import type { Collection } from '@affine/env/filter';
import type { WorkspaceHeaderProps } from '@affine/env/workspace';
import { WorkspaceFlavour, WorkspaceSubPath } from '@affine/env/workspace';
import type { ReactElement } from 'react';
import { useCallback } from 'react';

import { useGetPageInfoById } from '../hooks/use-get-page-info';
import { useWorkspace } from '../hooks/use-workspace';
import { BlockSuiteEditorHeader } from './blocksuite/workspace-header';
import { filterContainerStyle } from './filter-container.css';
import { WorkspaceModeFilterTab } from './pure/workspace-title';

export function WorkspaceHeader({
  currentWorkspaceId,
  currentEntry,
}: WorkspaceHeaderProps<WorkspaceFlavour>): ReactElement {
  const setting = useCollectionManager(currentWorkspaceId);
  const saveToCollection = useCallback(
    async (collection: Collection) => {
      await setting.saveCollection(collection);
      setting.selectCollection(collection.id);
    },
    [setting]
  );

  const currentWorkspace = useWorkspace(currentWorkspaceId);

  const getPageInfoById = useGetPageInfoById(
    currentWorkspace.blockSuiteWorkspace
  );
  if ('subPath' in currentEntry) {
    if (currentEntry.subPath === WorkspaceSubPath.ALL) {
      const leftSlot = (
        <CollectionList
          setting={setting}
          getPageInfo={getPageInfoById}
          propertiesMeta={currentWorkspace.blockSuiteWorkspace.meta.properties}
        ></CollectionList>
      );
      const filterContainer =
        setting.isDefault && setting.currentCollection.filterList.length > 0 ? (
          <div className={filterContainerStyle}>
            <div style={{ flex: 1 }}>
              <FilterList
                propertiesMeta={
                  currentWorkspace.blockSuiteWorkspace.meta.properties
                }
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
                <SaveCollectionButton
                  propertiesMeta={
                    currentWorkspace.blockSuiteWorkspace.meta.properties
                  }
                  getPageInfo={getPageInfoById}
                  onConfirm={saveToCollection}
                  filterList={setting.currentCollection.filterList}
                  workspaceId={currentWorkspaceId}
                ></SaveCollectionButton>
              ) : null}
            </div>
          </div>
        ) : null;
      return (
        <>
          <WorkspaceModeFilterTab
            workspace={currentWorkspace}
            currentPage={null}
            isPublic={false}
            leftSlot={leftSlot}
          />
          {filterContainer}
        </>
      );
    } else if (
      currentEntry.subPath === WorkspaceSubPath.SHARED ||
      currentEntry.subPath === WorkspaceSubPath.TRASH
    ) {
      return (
        <WorkspaceModeFilterTab
          workspace={currentWorkspace}
          currentPage={null}
          isPublic={false}
        />
      );
    }
  } else if ('pageId' in currentEntry) {
    const pageId = currentEntry.pageId;
    const isPublic = currentWorkspace.flavour === WorkspaceFlavour.PUBLIC;
    return (
      <BlockSuiteEditorHeader
        isPublic={isPublic}
        workspace={currentWorkspace}
        currentPage={currentWorkspace.blockSuiteWorkspace.getPage(pageId)}
      />
    );
  }
  return <></>;
}
