import { WorkbenchService } from '@affine/core/modules/workbench';
import {
  GlobalStateService,
  LiveData,
  useLiveData,
  useService,
} from '@toeverything/infra';
import clsx from 'clsx';
import { useEffect, useState } from 'react';

import { ToolContainer } from '../../workspace';
import { AIIcon } from './icons';
import {
  aiIslandAnimationBg,
  aiIslandBtn,
  aiIslandWrapper,
  gradient,
  toolStyle,
} from './styles.css';

const RIGHT_SIDEBAR_AI_HAS_EVER_OPENED_KEY =
  'app:settings:rightsidebar:ai:has-ever-opened';

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
  const globalState = useService(GlobalStateService).globalState;
  const aiChatHasEverOpened = useLiveData(
    LiveData.from(
      globalState.watch<boolean>(RIGHT_SIDEBAR_AI_HAS_EVER_OPENED_KEY),
      false
    )
  );

  useEffect(() => {
    if (sidebarOpen && activeTab?.id === 'chat') {
      globalState.set(RIGHT_SIDEBAR_AI_HAS_EVER_OPENED_KEY, true);
    }
  }, [activeTab, globalState, sidebarOpen]);

  useEffect(() => {
    setHide((sidebarOpen && activeTab?.id === 'chat') || !haveChatTab);
  }, [activeTab, haveChatTab, sidebarOpen]);

  return (
    <ToolContainer className={clsx(toolStyle, { hide })}>
      <div
        className={aiIslandWrapper}
        data-hide={hide}
        data-animation={!aiChatHasEverOpened}
      >
        {aiChatHasEverOpened ? null : (
          <div className={aiIslandAnimationBg}>
            <div className={gradient} />
            <div className={gradient} />
            <div className={gradient} />
          </div>
        )}
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
    </ToolContainer>
  );
};
