import { UserAvatar } from '@affine/component/user-avatar';
import { WorkspaceAvatar } from '@affine/component/workspace-avatar';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import type { RootWorkspaceMetadata } from '@affine/workspace/atom';
import { useStaticBlockSuiteWorkspace } from '@toeverything/hooks/use-block-suite-workspace';
import { useBlockSuiteWorkspaceName } from '@toeverything/hooks/use-block-suite-workspace-name';
import clsx from 'clsx';
import { signIn } from 'next-auth/react';
import type { ReactElement } from 'react';
import { useCallback } from 'react';

import { useCurrenLoginStatus } from '../../../../hooks/affine/use-curren-login-status';
import { useCurrentUser } from '../../../../hooks/affine/use-current-user';
import type { AllWorkspace } from '../../../../shared';
import type {
  GeneralSettingKeys,
  GeneralSettingList,
} from '../general-setting';
import {
  accountButton,
  settingSlideBar,
  sidebarItemsWrapper,
  sidebarSelectItem,
  sidebarSubtitle,
  sidebarTitle,
} from './style.css';

export type UserInfoProps = {
  onAccountSettingClick: () => void;
};

export const UserInfo = ({
  onAccountSettingClick,
}: UserInfoProps): ReactElement => {
  const user = useCurrentUser();
  return (
    <div className={accountButton} onClick={onAccountSettingClick}>
      <UserAvatar
        size={28}
        name={user.name}
        url={user.avatarUrl}
        className="avatar"
      />

      <div className="content">
        <div className="name" title="xxx">
          {user.name}
        </div>
        <div className="email" title="xxx">
          {user.email}
        </div>
      </div>
    </div>
  );
};

export const SignInButton = () => {
  const t = useAFFiNEI18N();
  return (
    <div
      className={accountButton}
      onClick={useCallback(() => {
        signIn().catch(console.error);
      }, [])}
    >
      <UserAvatar size={28} name="AFFiNE" className="avatar" />

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
  currentWorkspace,
  workspaceList,
  onWorkspaceSettingClick,
  selectedWorkspaceId,
  selectedGeneralKey,
  onAccountSettingClick,
}: {
  generalSettingList: GeneralSettingList;
  onGeneralSettingClick: (key: GeneralSettingKeys) => void;
  currentWorkspace: AllWorkspace;
  workspaceList: RootWorkspaceMetadata[];
  onWorkspaceSettingClick: (workspaceId: string) => void;

  selectedWorkspaceId: string | null;
  selectedGeneralKey: string | null;
  onAccountSettingClick: () => void;
}) => {
  const t = useAFFiNEI18N();
  const loginStatus = useCurrenLoginStatus();
  return (
    <div className={settingSlideBar} data-testid="settings-sidebar">
      <div className={sidebarTitle}>{t['Settings']()}</div>
      <div className={sidebarSubtitle}>{t['General']()}</div>
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
        {t['com.affine.settings.workspace']()}
      </div>
      <div className={clsx(sidebarItemsWrapper, 'scroll')}>
        {workspaceList.map(workspace => {
          return (
            <WorkspaceListItem
              key={workspace.id}
              meta={workspace}
              onClick={() => {
                onWorkspaceSettingClick(workspace.id);
              }}
              isCurrent={workspace.id === currentWorkspace.id}
              isActive={workspace.id === selectedWorkspaceId}
            />
          );
        })}
      </div>

      {runtimeConfig.enableCloud && loginStatus === 'unauthenticated' ? (
        <SignInButton />
      ) : null}

      {runtimeConfig.enableCloud && loginStatus === 'authenticated' ? (
        <UserInfo onAccountSettingClick={onAccountSettingClick} />
      ) : null}
    </div>
  );
};

const WorkspaceListItem = ({
  meta,
  onClick,
  isCurrent,
  isActive,
}: {
  meta: RootWorkspaceMetadata;
  onClick: () => void;
  isCurrent: boolean;
  isActive: boolean;
}) => {
  const workspace = useStaticBlockSuiteWorkspace(meta.id);
  const [workspaceName] = useBlockSuiteWorkspaceName(workspace);
  return (
    <div
      className={clsx(sidebarSelectItem, { active: isActive })}
      title={workspaceName}
      onClick={onClick}
      data-testid="workspace-list-item"
    >
      <WorkspaceAvatar size={14} workspace={workspace} className="icon" />
      <span className="setting-name">{workspaceName}</span>
      {isCurrent ? (
        <div className="current-label" data-testid="current-workspace-label">
          Current
        </div>
      ) : null}
    </div>
  );
};
