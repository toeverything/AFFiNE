import {
  WorkspaceListItemSkeleton,
  WorkspaceListSkeleton,
} from '@affine/component/setting-components';
import { Avatar } from '@affine/component/ui/avatar';
import { Tooltip } from '@affine/component/ui/tooltip';
import { UNTITLED_WORKSPACE_NAME } from '@affine/env/constant';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import type { WorkspaceMetadata } from '@affine/workspace';
import {
  waitForCurrentWorkspaceAtom,
  workspaceListAtom,
} from '@affine/workspace/atom';
import { Logo1Icon } from '@blocksuite/icons';
import { useWorkspaceBlobObjectUrl } from '@toeverything/hooks/use-workspace-blob';
import { useWorkspaceInfo } from '@toeverything/hooks/use-workspace-info';
import clsx from 'clsx';
import { useAtom, useAtomValue } from 'jotai/react';
import { type ReactElement, Suspense, useCallback } from 'react';

import { authAtom } from '../../../../atoms';
import { useCurrentLoginStatus } from '../../../../hooks/affine/use-current-login-status';
import { useCurrentUser } from '../../../../hooks/affine/use-current-user';
import { UserPlanButton } from '../../auth/user-plan-button';
import type {
  GeneralSettingKeys,
  GeneralSettingList,
} from '../general-setting';
import {
  accountButton,
  currentWorkspaceLabel,
  settingSlideBar,
  sidebarFooter,
  sidebarItemsWrapper,
  sidebarSelectItem,
  sidebarSubtitle,
  sidebarTitle,
} from './style.css';

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
      className={clsx(accountButton, {
        active: active,
      })}
      onClick={onAccountSettingClick}
    >
      <Avatar size={28} name={user.name} url={user.image} className="avatar" />

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
      className={accountButton}
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
  generalSettingList,
  onGeneralSettingClick,
  onWorkspaceSettingClick,
  selectedWorkspaceId,
  selectedGeneralKey,
  onAccountSettingClick,
}: {
  generalSettingList: GeneralSettingList;
  onGeneralSettingClick: (key: GeneralSettingKeys) => void;
  onWorkspaceSettingClick: (workspaceMetadata: WorkspaceMetadata) => void;
  selectedWorkspaceId: string | null;
  selectedGeneralKey: string | null;
  onAccountSettingClick: () => void;
}) => {
  const t = useAFFiNEI18N();
  const loginStatus = useCurrentLoginStatus();
  return (
    <div className={settingSlideBar} data-testid="settings-sidebar">
      <div className={sidebarTitle}>
        {t['com.affine.settingSidebar.title']()}
      </div>
      <div className={sidebarSubtitle}>
        {t['com.affine.settingSidebar.settings.general']()}
      </div>
      <div className={sidebarItemsWrapper}>
        {generalSettingList.map(({ title, icon, key, testId }) => {
          return (
            <div
              className={clsx(sidebarSelectItem, {
                active: key === selectedGeneralKey,
              })}
              key={key}
              title={title}
              onClick={() => {
                onGeneralSettingClick(key);
              }}
              data-testid={testId}
            >
              {icon({ className: 'icon' })}
              <span className="setting-name">{title}</span>
            </div>
          );
        })}
      </div>

      <div className={sidebarSubtitle}>
        {t['com.affine.settingSidebar.settings.workspace']()}
      </div>
      <div className={clsx(sidebarItemsWrapper, 'scroll')}>
        <Suspense fallback={<WorkspaceListSkeleton />}>
          <WorkspaceList
            onWorkspaceSettingClick={onWorkspaceSettingClick}
            selectedWorkspaceId={selectedWorkspaceId}
          />
        </Suspense>
      </div>

      <div className={sidebarFooter}>
        {runtimeConfig.enableCloud && loginStatus === 'unauthenticated' ? (
          <SignInButton />
        ) : null}

        {runtimeConfig.enableCloud && loginStatus === 'authenticated' ? (
          <Suspense>
            <UserInfo
              onAccountSettingClick={onAccountSettingClick}
              active={selectedGeneralKey === 'account'}
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
}: {
  onWorkspaceSettingClick: (workspaceMetadata: WorkspaceMetadata) => void;
  selectedWorkspaceId: string | null;
}) => {
  const workspaces = useAtomValue(workspaceListAtom);
  const currentWorkspace = useAtomValue(waitForCurrentWorkspaceAtom);
  return (
    <>
      {workspaces.map(workspace => {
        return (
          <Suspense key={workspace.id} fallback={<WorkspaceListItemSkeleton />}>
            <WorkspaceListItem
              meta={workspace}
              onClick={() => {
                onWorkspaceSettingClick(workspace);
              }}
              isCurrent={workspace.id === currentWorkspace.id}
              isActive={workspace.id === selectedWorkspaceId}
            />
          </Suspense>
        );
      })}
    </>
  );
};

const WorkspaceListItem = ({
  meta,
  onClick,
  isCurrent,
  isActive,
}: {
  meta: WorkspaceMetadata;
  onClick: () => void;
  isCurrent: boolean;
  isActive: boolean;
}) => {
  const information = useWorkspaceInfo(meta);

  const avatarUrl = useWorkspaceBlobObjectUrl(meta, information?.avatar);

  const name = information?.name ?? UNTITLED_WORKSPACE_NAME;

  return (
    <div
      className={clsx(sidebarSelectItem, { active: isActive })}
      title={name}
      onClick={onClick}
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
            className={currentWorkspaceLabel}
            data-testid="current-workspace-label"
          ></div>
        </Tooltip>
      ) : null}
    </div>
  );
};
