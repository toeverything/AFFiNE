import {
  CollectionList,
  FilterList,
  SaveCollectionButton,
  useCollectionManager,
} from '@affine/component/page-list';
import type { Collection } from '@affine/env/filter';
import type { WorkspaceHeaderProps } from '@affine/env/workspace';
import { WorkspaceFlavour, WorkspaceSubPath } from '@affine/env/workspace';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { SettingsIcon } from '@blocksuite/icons';
import { uuidv4 } from '@blocksuite/store';
import type { ReactElement } from 'react';
import { useCallback } from 'react';

import { useGetPageInfoById } from '../hooks/use-get-page-info';
import { BlockSuiteEditorHeader } from './blocksuite/workspace-header';
import { filterContainerStyle } from './filter-container.css';
import { WorkspaceModeFilterTab, WorkspaceTitle } from './pure/workspace-title';

export function WorkspaceHeader({
  currentWorkspace,
  currentEntry,
}: WorkspaceHeaderProps<WorkspaceFlavour>): ReactElement {
  const setting = useCollectionManager();
  const t = useAFFiNEI18N();
  const saveToCollection = useCallback(
    async (collection: Collection) => {
      await setting.saveCollection(collection);
      setting.selectCollection(collection.id);
    },
    [setting]
  );
  const getPageInfoById = useGetPageInfoById();
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
                  init={{
                    id: uuidv4(),
                    name: '',
                    filterList: setting.currentCollection.filterList,
                  }}
                  onConfirm={saveToCollection}
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
    } else if (currentEntry.subPath === WorkspaceSubPath.SETTING) {
      return (
        <WorkspaceTitle
          workspace={currentWorkspace}
          currentPage={null}
          isPublic={false}
          icon={<SettingsIcon />}
        >
          {t['Workspace Settings']()}
        </WorkspaceTitle>
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
