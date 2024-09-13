import {
  WorkspaceListItemSkeleton,
  WorkspaceListSkeleton,
} from '@affine/component/setting-components';
import { Avatar } from '@affine/component/ui/avatar';
import { Tooltip } from '@affine/component/ui/tooltip';
import { WorkspaceAvatar } from '@affine/component/workspace-avatar';
import { useWorkspaceInfo } from '@affine/core/components/hooks/use-workspace-info';
import { AuthService } from '@affine/core/modules/cloud';
import { UserFeatureService } from '@affine/core/modules/cloud/services/user-feature';
import { UNTITLED_WORKSPACE_NAME } from '@affine/env/constant';
import { useI18n } from '@affine/i18n';
import { track } from '@affine/track';
import { Logo1Icon } from '@blocksuite/icons/rc';
import type { WorkspaceMetadata } from '@toeverything/infra';
import {
  useLiveData,
  useService,
  useServices,
  WorkspaceService,
  WorkspacesService,
} from '@toeverything/infra';
import clsx from 'clsx';
import { useSetAtom } from 'jotai/react';
import {
  type MouseEvent,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
} from 'react';

import { authAtom } from '../../../atoms';
import { UserPlanButton } from '../../auth/user-plan-button';
import { useGeneralSettingList } from '../general-setting';
import type { ActiveTab, WorkspaceSubTab } from '../types';
import * as style from './style.css';

export type UserInfoProps = {
  onAccountSettingClick: () => void;
  active?: boolean;
};

export const UserInfo = ({ onAccountSettingClick, active }: UserInfoProps) => {
  const account = useLiveData(useService(AuthService).session.account$);
  if (!account) {
    // TODO(@eyhn): loading ui
    return;
  }
  return (
    <div
      data-testid="user-info-card"
      className={clsx(style.accountButton, {
        active: active,
      })}
      onClick={onAccountSettingClick}
    >
      <Avatar
        size={28}
        rounded={2}
        name={account.label}
        url={account.avatar}
        className="avatar"
      />

      <div className="content">
        <div className="name-container">
          <div className="name" title={account.label}>
            {account.label}
          </div>
          <UserPlanButton />
        </div>

        <div className="email" title={account.email}>
          {account.email}
        </div>
      </div>
    </div>
  );
};

export const SignInButton = () => {
  const t = useI18n();
  const setAuthModal = useSetAtom(authAtom);

  return (
    <div
      className={style.accountButton}
      onClick={useCallback(() => {
        setAuthModal({ openModal: true, state: 'signIn' });
      }, [setAuthModal])}
    >
      <div className="avatar not-sign">
        <Logo1Icon />
      </div>

      <div className="content">
        <div className="name" title={t['com.affine.settings.sign']()}>
          {t['com.affine.settings.sign']()}
        </div>
        <div className="email" title={t['com.affine.setting.sign.message']()}>
          {t['com.affine.setting.sign.message']()}
        </div>
      </div>
    </div>
  );
};

export const SettingSidebar = ({
  activeTab,
  onTabChange,
  selectedWorkspaceId,
}: {
  activeTab: ActiveTab;
  onTabChange: (
    key: ActiveTab,
    workspaceMetadata: WorkspaceMetadata | null
  ) => void;
  selectedWorkspaceId: string | null;
}) => {
  const t = useI18n();
  const loginStatus = useLiveData(useService(AuthService).session.status$);
  const generalList = useGeneralSettingList();
  const gotoTab = useCallback(
    (e: MouseEvent<HTMLDivElement>) => {
      const tab = e.currentTarget.dataset.eventArg;
      if (!tab) return;
      track.$.settingsPanel.menu.openSettings({ to: tab });
      onTabChange(tab as ActiveTab, null);
    },
    [onTabChange]
  );
  const onAccountSettingClick = useCallback(() => {
    track.$.settingsPanel.menu.openSettings({ to: 'account' });
    onTabChange('account', null);
  }, [onTabChange]);
  const onWorkspaceSettingClick = useCallback(
    (subTab: WorkspaceSubTab, workspaceMetadata: WorkspaceMetadata) => {
      track.$.settingsPanel.menu.openSettings({
        to: 'workspace',
        control: subTab,
      });
      onTabChange(`workspace:${subTab}`, workspaceMetadata);
    },
    [onTabChange]
  );

  return (
    <div className={style.settingSlideBar} data-testid="settings-sidebar">
      <div className={style.sidebarTitle}>
        {t['com.affine.settingSidebar.title']()}
      </div>
      <div className={style.sidebarSubtitle}>
        {t['com.affine.settingSidebar.settings.general']()}
      </div>
      <div className={style.sidebarItemsWrapper}>
        {generalList.map(({ title, icon, key, testId }) => {
          return (
            <div
              className={clsx(style.sidebarSelectItem, {
                active: key === activeTab,
              })}
              key={key}
              title={title}
              data-event-arg={key}
              onClick={gotoTab}
              data-testid={testId}
            >
              {icon({ className: 'icon' })}
              <span className="setting-name">{title}</span>
            </div>
          );
        })}
      </div>

      <div className={style.sidebarSubtitle}>
        {t['com.affine.settingSidebar.settings.workspace']()}
      </div>
      <div className={clsx(style.sidebarItemsWrapper, 'scroll')}>
        <Suspense fallback={<WorkspaceListSkeleton />}>
          <WorkspaceList
            onWorkspaceSettingClick={onWorkspaceSettingClick}
            selectedWorkspaceId={selectedWorkspaceId}
            activeSubTab={activeTab.split(':')[1] as WorkspaceSubTab}
          />
        </Suspense>
      </div>

      <div className={style.sidebarFooter}>
        {loginStatus === 'unauthenticated' ? <SignInButton /> : null}
        {loginStatus === 'authenticated' ? (
          <Suspense>
            <UserInfo
              onAccountSettingClick={onAccountSettingClick}
              active={activeTab === 'account'}
            />
          </Suspense>
        ) : null}
      </div>
    </div>
  );
};

export const WorkspaceList = ({
  onWorkspaceSettingClick,
  selectedWorkspaceId,
  activeSubTab,
}: {
  onWorkspaceSettingClick: (
    subTab: WorkspaceSubTab,
    workspaceMetadata: WorkspaceMetadata
  ) => void;
  selectedWorkspaceId: string | null;
  activeSubTab: WorkspaceSubTab;
}) => {
  const workspaces = useLiveData(
    useService(WorkspacesService).list.workspaces$
  );
  return (
    <>
      {workspaces.map(workspace => {
        return (
          <Suspense key={workspace.id} fallback={<WorkspaceListItemSkeleton />}>
            <WorkspaceListItem
              meta={workspace}
              onClick={subTab => {
                onWorkspaceSettingClick(subTab, workspace);
              }}
              activeSubTab={
                workspace.id === selectedWorkspaceId ? activeSubTab : undefined
              }
            />
          </Suspense>
        );
      })}
    </>
  );
};

const subTabConfigs = [
  {
    key: 'preference',
    title: 'com.affine.settings.workspace.preferences',
  },
  {
    key: 'properties',
    title: 'com.affine.settings.workspace.properties',
  },
] satisfies {
  key: WorkspaceSubTab;
  title: keyof ReturnType<typeof useI18n>;
}[];

const WorkspaceListItem = ({
  activeSubTab,
  meta,
  onClick,
}: {
  meta: WorkspaceMetadata;
  activeSubTab?: WorkspaceSubTab;
  onClick: (subTab: WorkspaceSubTab) => void;
}) => {
  const { workspaceService, userFeatureService } = useServices({
    WorkspaceService,
    UserFeatureService,
  });
  const information = useWorkspaceInfo(meta);
  const name = information?.name ?? UNTITLED_WORKSPACE_NAME;
  const currentWorkspace = workspaceService.workspace;
  const isCurrent = currentWorkspace.id === meta.id;
  const t = useI18n();

  useEffect(() => {
    userFeatureService.userFeature.revalidate();
  }, [userFeatureService]);

  const onClickPreference = useCallback(() => {
    onClick('preference');
  }, [onClick]);

  const subTabs = useMemo(() => {
    return subTabConfigs.map(({ key, title }) => {
      return (
        <div
          data-testid={`workspace-list-item-${key}`}
          onClick={() => {
            onClick(key);
          }}
          className={clsx(style.sidebarSelectSubItem, {
            active: activeSubTab === key,
          })}
          key={key}
        >
          {t[title]()}
        </div>
      );
    });
  }, [activeSubTab, onClick, t]);

  return (
    <>
      <div
        className={clsx(style.sidebarSelectItem, { active: !!activeSubTab })}
        title={name}
        onClick={onClickPreference}
        data-testid="workspace-list-item"
      >
        <WorkspaceAvatar
          key={meta.id}
          meta={meta}
          size={16}
          name={name}
          colorfulFallback
          style={{
            marginRight: '10px',
          }}
          rounded={2}
        />
        <span className="setting-name">{name}</span>
        {isCurrent ? (
          <Tooltip content="Current" side="top">
            <div
              className={style.currentWorkspaceLabel}
              data-testid="current-workspace-label"
            ></div>
          </Tooltip>
        ) : null}
      </div>
      {activeSubTab && subTabs.length > 1 ? subTabs : null}
    </>
  );
};
