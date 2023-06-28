import { Button } from '@affine/component';
import {
  FilterList,
  SaveViewButton,
  useAllPageSetting,
  ViewList,
} from '@affine/component/page-list';
import type { WorkspaceHeaderProps } from '@affine/env/workspace';
import { WorkspaceFlavour, WorkspaceSubPath } from '@affine/env/workspace';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { SettingsIcon } from '@blocksuite/icons';
import { RESET } from 'jotai/utils';
import type { ReactElement } from 'react';
import { NIL } from 'uuid';

import { BlockSuiteEditorHeader } from './blocksuite/workspace-header';
import { filterContainerStyle } from './filter-container.css';
import { WorkspaceModeFilterTab, WorkspaceTitle } from './pure/workspace-title';

export function WorkspaceHeader({
  currentWorkspace,
  currentEntry,
}: WorkspaceHeaderProps<WorkspaceFlavour>): ReactElement {
  const setting = useAllPageSetting();
  const t = useAFFiNEI18N();
  if ('subPath' in currentEntry) {
    if (currentEntry.subPath === WorkspaceSubPath.ALL) {
      const leftSlot = <ViewList setting={setting}></ViewList>;
      const filterContainer = setting.currentView.filterList.length > 0 && (
        <div className={filterContainerStyle}>
          <div style={{ flex: 1 }}>
            <FilterList
              value={setting.currentView.filterList}
              onChange={filterList => {
                setting.setCurrentView(view => ({
                  ...view,
                  filterList,
                }));
              }}
            />
          </div>
          {runtimeConfig.enableAllPageFilter && (
            <div>
              {setting.currentView.id !== NIL ||
              (setting.currentView.id === NIL &&
                setting.currentView.filterList.length > 0) ? (
                <SaveViewButton
                  init={setting.currentView.filterList}
                  onConfirm={setting.createView}
                ></SaveViewButton>
              ) : (
                <Button onClick={() => setting.setCurrentView(RESET)}>
                  Back to all
                </Button>
              )}
            </div>
          )}
        </div>
      );
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
