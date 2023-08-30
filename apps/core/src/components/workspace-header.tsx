import {
  CollectionList,
  FilterList,
  SaveCollectionButton,
  useCollectionManager,
} from '@affine/component/page-list';
import { Unreachable } from '@affine/env/constant';
import type { Collection } from '@affine/env/filter';
import type { PropertiesMeta } from '@affine/env/filter';
import {
  WorkspaceFlavour,
  type WorkspaceHeaderProps,
} from '@affine/env/workspace';
import { WorkspaceSubPath } from '@affine/env/workspace';
import { useSetAtom } from 'jotai/react';
import { useCallback } from 'react';

import { appHeaderAtom, mainContainerAtom } from '../atoms/element';
import { useGetPageInfoById } from '../hooks/use-get-page-info';
import { useWorkspace } from '../hooks/use-workspace';
import { SharePageModal } from './affine/share-page-modal';
import { BlockSuiteHeaderTitle } from './blocksuite/block-suite-header-title';
import { filterContainerStyle } from './filter-container.css';
import { Header } from './pure/header';
import { PluginHeader } from './pure/plugin-header';
import { WorkspaceModeFilterTab } from './pure/workspace-mode-filter-tab';

const FilterContainer = ({ workspaceId }: { workspaceId: string }) => {
  const currentWorkspace = useWorkspace(workspaceId);
  const setting = useCollectionManager(workspaceId);
  const saveToCollection = useCallback(
    async (collection: Collection) => {
      await setting.saveCollection(collection);
      setting.selectCollection(collection.id);
    },
    [setting]
  );
  const getPageInfoById = useGetPageInfoById(
    currentWorkspace.blockSuiteWorkspace
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
          <SaveCollectionButton
            propertiesMeta={
              currentWorkspace.blockSuiteWorkspace.meta
                .properties as PropertiesMeta
            }
            getPageInfo={getPageInfoById}
            onConfirm={saveToCollection}
            filterList={setting.currentCollection.filterList}
            workspaceId={workspaceId}
          ></SaveCollectionButton>
        ) : null}
      </div>
    </div>
  );
};

export function WorkspaceHeader({
  currentWorkspaceId,
  currentEntry,
}: WorkspaceHeaderProps<WorkspaceFlavour>) {
  const setting = useCollectionManager(currentWorkspaceId);
  const setAppHeader = useSetAtom(appHeaderAtom);

  const currentWorkspace = useWorkspace(currentWorkspaceId);
  const getPageInfoById = useGetPageInfoById(
    currentWorkspace.blockSuiteWorkspace
  );

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
              setting={setting}
              getPageInfo={getPageInfoById}
              propertiesMeta={
                currentWorkspace.blockSuiteWorkspace.meta.properties
              }
            />
          }
          center={<WorkspaceModeFilterTab />}
        />
        {<FilterContainer workspaceId={currentWorkspaceId} />}
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
    const isCloudWorkspace =
      currentWorkspace.flavour === WorkspaceFlavour.AFFINE_CLOUD;
    const currentPage = currentWorkspace.blockSuiteWorkspace.getPage(
      currentEntry.pageId
    );
    const sharePageModal =
      isCloudWorkspace && currentPage ? (
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
