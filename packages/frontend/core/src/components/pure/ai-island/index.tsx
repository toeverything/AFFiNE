import { RightSidebarService } from '@affine/core/modules/right-sidebar';
import { useLiveData, useService } from '@toeverything/infra';
import { useEffect, useState } from 'react';

import { ToolContainer } from '../../workspace';
import { AIIcon } from './icons';
import {
  aiIslandAnimationBg,
  aiIslandBtn,
  aiIslandWrapper,
  borderAngle1,
  borderAngle2,
  borderAngle3,
} from './styles.css';

if (typeof window !== 'undefined' && window.CSS) {
  const getName = (nameWithVar: string) => nameWithVar.slice(4, -1);
  const registerAngle = (varName: string, initialValue: number) => {
    window.CSS.registerProperty({
      name: getName(varName),
      syntax: '<angle>',
      inherits: false,
      initialValue: `${initialValue}deg`,
    });
  };
  registerAngle(borderAngle1, 0);
  registerAngle(borderAngle2, 90);
  registerAngle(borderAngle3, 180);
}

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
        <div className={aiIslandAnimationBg} />
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
