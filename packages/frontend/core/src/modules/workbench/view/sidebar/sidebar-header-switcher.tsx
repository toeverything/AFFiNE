import { RadioGroup } from '@affine/component';
import { CommentPanelService } from '@affine/core/modules/comment/services/comment-panel-service';
import { useLiveData, useService } from '@toeverything/infra';
import { useCallback } from 'react';

import { ViewService } from '../../services/view';
import { ViewSidebarTabIconTarget } from '../view-islands';
import * as styles from './sidebar-header-switcher.css';

// provide a switcher for active extensions
// will be used in global top header (MacOS) or sidebar (Windows)
export const SidebarHeaderSwitcher = () => {
  const view = useService(ViewService).view;
  const commentPanelService = useService(CommentPanelService);
  const tabs = useLiveData(view.sidebarTabs$);
  const activeTab = useLiveData(view.activeSidebarTab$);

  const handleCommentTabClick = useCallback(
    (tabId: string) => {
      if (tabId === 'comment') {
        commentPanelService.showAllComments();
      }
    },
    [commentPanelService]
  );

  const tabItems = tabs.map(tab => ({
    value: tab.id,
    label: (
      <div onClick={() => handleCommentTabClick(tab.id)}>
        <ViewSidebarTabIconTarget
          className={styles.iconContainer}
          viewId={view.id}
          tabId={tab.id}
        />
      </div>
    ),
    testId: `sidebar-tab-${tab.id}`,
    style: { padding: 0, fontSize: 20, width: 24 },
  }));

  const handleActiveTabChange = useCallback(
    (tabId: string) => {
      handleCommentTabClick(tabId);
      view.activeSidebarTab(tabId);
    },
    [handleCommentTabClick, view]
  );

  return tabItems.length ? (
    <RadioGroup
      iconMode
      borderRadius={8}
      itemHeight={24}
      padding={4}
      gap={8}
      items={tabItems}
      value={activeTab?.id}
      onChange={handleActiveTabChange}
    />
  ) : null;
};
