import { WorkbenchService } from '@affine/core/modules/workbench';
import { useLiveData, useService } from '@toeverything/infra';
import clsx from 'clsx';
import { useEffect, useState } from 'react';

import { IslandContainer } from './container';
import { AIIcon } from './icons';
import { aiIslandBtn, aiIslandWrapper, toolStyle } from './styles.css';

export const AIIsland = () => {
  // to make sure ai island is hidden first and animate in
  const [hide, setHide] = useState(true);

  const workbench = useService(WorkbenchService).workbench;
  const activeView = useLiveData(workbench.activeView$);
  const haveChatTab = useLiveData(
    activeView.sidebarTabs$.map(tabs => tabs.some(t => t.id === 'chat'))
  );
  const activeTab = useLiveData(activeView.activeSidebarTab$);
  const sidebarOpen = useLiveData(workbench.sidebarOpen$);

  useEffect(() => {
    setHide((sidebarOpen && activeTab?.id === 'chat') || !haveChatTab);
  }, [activeTab, haveChatTab, sidebarOpen]);

  return (
    <IslandContainer className={clsx(toolStyle, { hide })}>
      <div className={aiIslandWrapper} data-hide={hide}>
        <button
          className={aiIslandBtn}
          data-testid="ai-island"
          onClick={() => {
            if (hide) return;
            workbench.openSidebar();
            activeView.activeSidebarTab('chat');
          }}
        >
          <AIIcon />
        </button>
      </div>
    </IslandContainer>
  );
};
