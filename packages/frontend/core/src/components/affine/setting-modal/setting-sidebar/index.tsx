import {
  WorkspaceListItemSkeleton,
  WorkspaceListSkeleton,
} from '@affine/component/setting-components';
import { Avatar } from '@affine/component/ui/avatar';
import { Tooltip } from '@affine/component/ui/tooltip';
import { useIsWorkspaceOwner } from '@affine/core/hooks/affine/use-is-workspace-owner';
import { useWorkspaceBlobObjectUrl } from '@affine/core/hooks/use-workspace-blob';
import { useWorkspaceAvailableFeatures } from '@affine/core/hooks/use-workspace-features';
import { useWorkspaceInfo } from '@affine/core/hooks/use-workspace-info';
import { UNTITLED_WORKSPACE_NAME } from '@affine/env/constant';
import { WorkspaceFlavour } from '@affine/env/workspace';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { Logo1Icon } from '@blocksuite/icons';
import {
  Workspace,
  WorkspaceManager,
  type WorkspaceMetadata,
} from '@toeverything/infra';
import { useService } from '@toeverything/infra/di';
import { useLiveData } from '@toeverything/infra/livedata';
import clsx from 'clsx';
import { useAtom } from 'jotai/react';
import { type ReactElement, Suspense, useCallback, useMemo } from 'react';

import { authAtom } from '../../../../atoms';
import { useCurrentLoginStatus } from '../../../../hooks/affine/use-current-login-status';
import { useCurrentUser } from '../../../../hooks/affine/use-current-user';
import { UserPlanButton } from '../../auth/user-plan-button';
import { useGeneralSettingList } from '../general-setting';
import type { ActiveTab, WorkspaceSubTab } from '../types';
import * as style from './style.css';

export type UserInfoProps = {
  onAccountSettingClick: () => void;
  active?: boolean;
};

export const UserInfo = ({
  onAccountSettingClick,
  active,
}: UserInfoProps): ReactElement => {
  const user = useCurrentUser();
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
        name={user.name}
        url={user.avatarUrl}
        className="avatar"
      />

      <div className="content">
        <div className="name-container">
          <div className="name" title={user.name}>
            {user.name}
          </div>
          <UserPlanButton />
        </div>

        <div className="email" title={user.email}>
          {user.email}
        </div>
      </div>
    </div>
  );
};

export const SignInButton = () => {
  const t = useAFFiNEI18N();
  const [, setAuthModal] = useAtom(authAtom);

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
  const t = useAFFiNEI18N();
  const loginStatus = useCurrentLoginStatus();
  const generalList = useGeneralSettingList();
  const onAccountSettingClick = useCallback(() => {
    onTabChange('account', null);
  }, [onTabChange]);
  const onWorkspaceSettingClick = useCallback(
    (subTab: WorkspaceSubTab, workspaceMetadata: WorkspaceMetadata) => {
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
              onClick={() => {
                onTabChange(key, null);
              }}
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
        {runtimeConfig.enableCloud && loginStatus === 'unauthenticated' ? (
          <SignInButton />
        ) : null}

        {runtimeConfig.enableCloud && loginStatus === 'authenticated' ? (
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
    useService(WorkspaceManager).list.workspaceList
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
    key: 'experimental-features',
    title: 'com.affine.settings.workspace.experimental-features',
  },
  {
    key: 'properties',
    title: 'com.affine.settings.workspace.properties',
  },
] satisfies {
  key: WorkspaceSubTab;
  title: keyof ReturnType<typeof useAFFiNEI18N>;
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
  const information = useWorkspaceInfo(meta);
  const avatarUrl = useWorkspaceBlobObjectUrl(meta, information?.avatar);
  const name = information?.name ?? UNTITLED_WORKSPACE_NAME;
  const currentWorkspace = useService(Workspace);
  const isCurrent = currentWorkspace.id === meta.id;
  const t = useAFFiNEI18N();
  const isOwner = useIsWorkspaceOwner(meta);
  const availableFeatures = useWorkspaceAvailableFeatures(meta);

  const onClickPreference = useCallback(() => {
    onClick('preference');
  }, [onClick]);

  const subTabs = useMemo(() => {
    return subTabConfigs
      .filter(({ key }) => {
        if (key === 'experimental-features') {
          return (
            isOwner &&
            currentWorkspace.flavour === WorkspaceFlavour.AFFINE_CLOUD &&
            availableFeatures.length > 0
          );
        }
        return true;
      })
      .map(({ key, title }) => {
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
  }, [
    activeSubTab,
    availableFeatures.length,
    currentWorkspace.flavour,
    isOwner,
    onClick,
    t,
  ]);

  return (
    <>
      <div
        className={clsx(style.sidebarSelectItem, { active: !!activeSubTab })}
        title={name}
        onClick={onClickPreference}
        data-testid="workspace-list-item"
      >
        <Avatar
          size={14}
          url={avatarUrl}
          name={name}
          colorfulFallback
          style={{
            marginRight: '10px',
          }}
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
