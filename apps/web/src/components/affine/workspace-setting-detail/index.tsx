import { useTranslation } from '@affine/i18n';
import type { SettingPanel, WorkspaceRegistry } from '@affine/workspace/type';
import { settingPanel, WorkspaceFlavour } from '@affine/workspace/type';
import type { MouseEvent } from 'react';
import type React from 'react';
import { Suspense, useCallback, useEffect, useMemo, useRef } from 'react';
import { preload } from 'swr';

import { useIsWorkspaceOwner } from '../../../hooks/affine/use-is-workspace-owner';
import { fetcher, QueryKey } from '../../../plugins/affine/fetcher';
import type { AffineOfficialWorkspace } from '../../../shared';
import { CollaborationPanel } from './panel/collaboration';
import { ExportPanel } from './panel/export';
import { GeneralPanel } from './panel/general';
import { PublishPanel } from './panel/publish';
import { SyncPanel } from './panel/sync';
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
  onDeleteWorkspace: () => void;
  onTransferWorkspace: <
    From extends WorkspaceFlavour,
    To extends WorkspaceFlavour
  >(
    from: From,
    to: To,
    workspace: WorkspaceRegistry[From]
  ) => void;
};

export type PanelProps = WorkspaceSettingDetailProps;

const panelMap = {
  [settingPanel.General]: {
    name: 'General',
    ui: GeneralPanel,
  },
  [settingPanel.Sync]: {
    name: 'Sync',
    enable: (flavour: WorkspaceFlavour) => flavour === WorkspaceFlavour.AFFINE,
    ui: SyncPanel,
  },
  [settingPanel.Collaboration]: {
    name: 'Collaboration',
    ui: CollaborationPanel,
  },
  [settingPanel.Publish]: {
    name: 'Publish',
    ui: PublishPanel,
  },
  [settingPanel.Export]: {
    name: 'Export',
    ui: ExportPanel,
  },
} satisfies {
  [Key in SettingPanel]: {
    name: string;
    enable?: (flavour: WorkspaceFlavour) => boolean;
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

export const WorkspaceSettingDetail: React.FC<
  WorkspaceSettingDetailProps
> = props => {
  const {
    workspace,
    currentTab,
    onChangeTab,
    // onDeleteWorkspace,
    // onTransferWorkspace,
  } = props;
  const isAffine = workspace.flavour === 'affine';
  const isOwner = useIsWorkspaceOwner(workspace);
  if (!(workspace.flavour === 'affine' || workspace.flavour === 'local')) {
    throw new Error('Unsupported workspace flavour');
  }
  if (!(currentTab in panelMap)) {
    throw new Error('Invalid activeTab: ' + currentTab);
  }
  const { t } = useTranslation();
  const workspaceId = workspace.id;
  useEffect(() => {
    if (isAffine && isOwner) {
      preload([QueryKey.getMembers, workspaceId], fetcher);
    }
  }, [isAffine, isOwner, workspaceId]);
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
          if ('enable' in value && !value.enable(workspace.flavour)) {
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
        {/* todo: add skeleton */}
        <Suspense fallback="loading panel...">
          <Component {...props} key={currentTab} data-tab-ui={currentTab} />
        </Suspense>
      </StyledSettingContent>
    </StyledSettingContainer>
  );
};
