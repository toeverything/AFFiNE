import { Button } from '@affine/component';
import {
  FilterList,
  SaveViewButton,
  useAllPageSetting,
  ViewList,
} from '@affine/component/page-list';
import { config } from '@affine/env';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import type { WorkspaceHeaderProps } from '@affine/workspace/type';
import { WorkspaceFlavour, WorkspaceSubPath } from '@affine/workspace/type';
import {
  DeleteTemporarilyIcon,
  FolderIcon,
  SettingsIcon,
  ShareIcon,
} from '@blocksuite/icons';
import { RESET } from 'jotai/utils';
import type { ReactElement } from 'react';
import React from 'react';
import { NIL } from 'uuid';

import { BlockSuiteEditorHeader } from './blocksuite/workspace-header';
import { WorkspaceTitle } from './pure/workspace-title';

export function WorkspaceHeader({
  currentWorkspace,
  currentEntry,
}: WorkspaceHeaderProps<WorkspaceFlavour>): ReactElement {
  const setting = useAllPageSetting();
  const t = useAFFiNEI18N();
  if ('subPath' in currentEntry) {
    if (currentEntry.subPath === WorkspaceSubPath.ALL) {
      const leftSlot = config.enableAllPageFilter && (
        <ViewList setting={setting}></ViewList>
      );
      const filterContainer = config.enableAllPageFilter &&
        setting.currentView.filterList.length > 0 && (
          <div style={{ padding: 12, display: 'flex' }}>
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
          </div>
        );

      return (
        <>
          <WorkspaceTitle
            workspace={currentWorkspace}
            currentPage={null}
            isPublic={false}
            icon={<FolderIcon />}
            leftSlot={leftSlot}
          >
            {t['All pages']()}
          </WorkspaceTitle>
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
    } else if (currentEntry.subPath === WorkspaceSubPath.SHARED) {
      return (
        <WorkspaceTitle
          workspace={currentWorkspace}
          currentPage={null}
          isPublic={false}
          icon={<ShareIcon />}
        >
          {t['Shared Pages']()}
        </WorkspaceTitle>
      );
    } else if (currentEntry.subPath === WorkspaceSubPath.TRASH) {
      return (
        <WorkspaceTitle
          workspace={currentWorkspace}
          currentPage={null}
          isPublic={false}
          icon={<DeleteTemporarilyIcon />}
        >
          {t['Trash']()}
        </WorkspaceTitle>
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
