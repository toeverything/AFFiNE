import type { SettingPanel, WorkspaceRegistry } from '@affine/env/workspace';
import { settingPanel, WorkspaceFlavour } from '@affine/env/workspace';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import type { MouseEvent } from 'react';
import type React from 'react';
import { Suspense, useCallback, useEffect, useMemo, useRef } from 'react';
import { preload } from 'swr';

import { fetcher, QueryKey } from '../../../adapters/affine/fetcher';
import { useIsWorkspaceOwner } from '../../../hooks/affine/use-is-workspace-owner';
import type { AffineOfficialWorkspace } from '../../../shared';
import * as style from './index.css';
import { CollaborationPanel } from './panel/collaboration';
import { ExportPanel } from './panel/export';
import { GeneralPanel } from './panel/general';
import { PublishPanel } from './panel/publish';
import { SyncPanel } from './panel/sync';

export type WorkspaceSettingDetailProps = {
  workspace: AffineOfficialWorkspace;
  currentTab: SettingPanel;
  onChangeTab: (tab: SettingPanel) => void;
  onDeleteWorkspace: () => Promise<void>;
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

type Name = 'General' | 'Sync' | 'Collaboration' | 'Publish' | 'Export';
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
    name: Name;
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
  const t = useAFFiNEI18N();
  const workspaceId = workspace.id;
  useEffect(() => {
    if (isAffine && isOwner) {
      preload([QueryKey.getMembers, workspaceId], fetcher).catch(console.error);
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
    <div
      className={style.container}
      aria-label="workspace-setting-detail"
      ref={containerRef}
    >
      <div className={style.tabButtonWrapper}>
        {Object.entries(panelMap).map(([key, value]) => {
          if ('enable' in value && !value.enable(workspace.flavour)) {
            return null;
          }
          return (
            <div
              className={
                style.tagItem[currentTab === key ? 'active' : 'inactive']
              }
              key={key}
              data-tab-key={key}
              onClick={handleTabClick}
            >
              {t[value.name]()}
            </div>
          );
        })}
        <div
          className={style.indicator}
          ref={ref => {
            indicatorRef.current = ref;
            startTransaction();
          }}
        />
      </div>
      <div className={style.content}>
        {/* todo: add skeleton */}
        <Suspense fallback="loading panel...">
          <Component {...props} key={currentTab} data-tab-ui={currentTab} />
        </Suspense>
      </div>
    </div>
  );
};
