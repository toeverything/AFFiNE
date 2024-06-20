import type { SidebarTabName } from '@affine/core/modules/multi-tab-sidebar';
import { RightSidebarService } from '@affine/core/modules/right-sidebar';
import {
  DocsService,
  GlobalContextService,
  GlobalStateService,
  LiveData,
  useLiveData,
  useService,
} from '@toeverything/infra';
import { useCallback } from 'react';

import { ToolContainer } from '../../workspace';
import { AIIcon } from './icons';
import { StyledIsland, StyledTriggerWrapper } from './style';

export const RIGHT_SIDEBAR_TABS_ACTIVE_KEY =
  'app:settings:rightsidebar:tabs:active';

export const AIIsland = () => {
  const docId = useLiveData(
    useService(GlobalContextService).globalContext.docId.$
  );
  const docRecordList = useService(DocsService).list;
  const doc = useLiveData(docId ? docRecordList.doc$(docId) : undefined);
  const mode = useLiveData(doc?.mode$);

  const globalState = useService(GlobalStateService).globalState;
  const activeTabName = useLiveData(
    LiveData.from(
      globalState.watch<SidebarTabName>(RIGHT_SIDEBAR_TABS_ACTIVE_KEY),
      'journal'
    )
  );
  const setActiveTabName = useCallback(
    (name: string) => {
      globalState.set(RIGHT_SIDEBAR_TABS_ACTIVE_KEY, name);
    },
    [globalState]
  );
  const rightSidebar = useService(RightSidebarService).rightSidebar;
  const rightSidebarOpen = useLiveData(rightSidebar.isOpen$);

  return (
    <ToolContainer>
      <StyledIsland
        spread={true}
        data-testid="ai-island"
        onClick={() => {
          if (rightSidebarOpen) return;
          rightSidebar.isOpen$;
          rightSidebar.open();
          if (activeTabName !== 'chat') {
            setActiveTabName('chat');
          }
        }}
        inEdgelessPage={!!docId && mode === 'edgeless'}
      >
        <StyledTriggerWrapper data-testid="faq-icon">
          <AIIcon />
        </StyledTriggerWrapper>
      </StyledIsland>
    </ToolContainer>
  );
};
