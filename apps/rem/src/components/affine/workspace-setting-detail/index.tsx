import { useTranslation } from '@affine/i18n';
import React, {
  MouseEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
} from 'react';
import { preload } from 'swr';

import { fetcher, QueryKey } from '../../../plugins/affine/fetcher';
import {
  AffineOfficialWorkspace,
  SettingPanel,
  settingPanel,
} from '../../../shared';
import { CollaborationPanel } from './panel/collaboration';
import { GeneralPanel } from './panel/general';
import {
  StyledIndicator,
  StyledSettingContainer,
  StyledSettingContent,
  StyledTabButtonWrapper,
  WorkspaceSettingTagItem,
} from './style';

export type WorkspaceSettingDetailProps = {
  workspace: AffineOfficialWorkspace;
  currentTab: SettingPanel;
  onChangeTab: (tab: SettingPanel) => void;
};

export type PanelProps = {
  workspace: AffineOfficialWorkspace;
};

const panelMap = {
  [settingPanel.General]: {
    name: 'General',
    ui: GeneralPanel,
  },
  [settingPanel.Collaboration]: {
    name: 'Collaboration',
    ui: CollaborationPanel,
  },
  [settingPanel.Publish]: {
    name: 'Publish',
    ui: () => <>Publish</>,
  },
  [settingPanel.Export]: {
    name: 'Export',
    ui: () => <>Export</>,
  },
} satisfies {
  [Key in SettingPanel]: {
    name: string;
    ui: React.FC<PanelProps>;
  };
};

function assertInstanceOf<T, U extends T>(
  obj: T,
  type: new (...args: any[]) => U
): asserts obj is U {
  if (!(obj instanceof type)) {
    throw new Error('Object is not instance of type');
  }
}

export const WorkspaceSettingDetail: React.FC<WorkspaceSettingDetailProps> = ({
  workspace,
  currentTab,
  onChangeTab,
}) => {
  const isAffine = workspace.flavour === 'affine';
  if (!(workspace.flavour === 'affine' || workspace.flavour === 'local')) {
    throw new Error('Unsupported workspace flavour');
  }
  if (!(currentTab in panelMap)) {
    throw new Error('Invalid activeTab: ' + currentTab);
  }
  const { t } = useTranslation();
  const workspaceId = workspace.id;
  useEffect(() => {
    if (isAffine) {
      preload([QueryKey.getMembers, workspaceId], fetcher);
    }
  }, [isAffine, workspaceId]);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const indicatorRef = useRef<HTMLDivElement | null>(null);
  const startTransaction = useCallback(() => {
    if (indicatorRef.current && containerRef.current) {
      const indicator = indicatorRef.current;
      const activeTabElement = containerRef.current.querySelector(
        `[data-tab-key="${currentTab}"]`
      );
      assertInstanceOf(activeTabElement, HTMLElement);
      requestAnimationFrame(() => {
        indicator.style.left = `${activeTabElement.offsetLeft}px`;
        indicator.style.width = `${activeTabElement.offsetWidth}px`;
      });
    }
  }, [currentTab]);
  const handleTabClick = useCallback(
    (event: MouseEvent<HTMLElement>) => {
      assertInstanceOf(event.target, HTMLElement);
      const key = event.target.getAttribute('data-tab-key');
      if (!key || !(key in panelMap)) {
        throw new Error('data-tab-key is invalid: ' + key);
      }
      onChangeTab(key as SettingPanel);
      startTransaction();
    },
    [onChangeTab, startTransaction]
  );
  const Component = useMemo(() => panelMap[currentTab].ui, [currentTab]);
  return (
    <StyledSettingContainer
      aria-label="workspace-setting-detail"
      ref={containerRef}
    >
      <StyledTabButtonWrapper>
        {Object.entries(panelMap).map(([key, value]) => {
          if (!isAffine && key === 'Sync') {
            return null;
          }
          return (
            <WorkspaceSettingTagItem
              key={key}
              isActive={currentTab === key}
              data-tab-key={key}
              onClick={handleTabClick}
            >
              {t(value.name)}
            </WorkspaceSettingTagItem>
          );
        })}
        <StyledIndicator
          ref={ref => {
            indicatorRef.current = ref;
            startTransaction();
          }}
        />
      </StyledTabButtonWrapper>
      <StyledSettingContent>
        <Component
          key={currentTab}
          data-tab-ui={currentTab}
          workspace={workspace}
        />
      </StyledSettingContent>
    </StyledSettingContainer>
  );
};
