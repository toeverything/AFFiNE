import { RightSidebarService } from '@affine/core/modules/right-sidebar';
import { useLiveData, useService } from '@toeverything/infra';
import { useEffect, useState } from 'react';

import { ToolContainer } from '../../workspace';
import { AIIcon } from './icons';
import {
  aiIslandAnimationBg,
  aiIslandBtn,
  aiIslandWrapper,
  gradient,
} from './styles.css';

export const AIIsland = () => {
  // to make sure ai island is hidden first and animate in
  const [hide, setHide] = useState(true);

  const rightSidebar = useService(RightSidebarService).rightSidebar;
  const activeTabName = useLiveData(rightSidebar.activeTabName$);
  const rightSidebarOpen = useLiveData(rightSidebar.isOpen$);
  const aiChatHasEverOpened = useLiveData(rightSidebar.aiChatHasEverOpened$);

  useEffect(() => {
    setHide(rightSidebarOpen && activeTabName === 'chat');
  }, [activeTabName, rightSidebarOpen]);

  return (
    <ToolContainer>
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
            rightSidebar.open();
            rightSidebar.setActiveTabName('chat');
          }}
        >
          <AIIcon />
        </button>
      </div>
    </ToolContainer>
  );
};
