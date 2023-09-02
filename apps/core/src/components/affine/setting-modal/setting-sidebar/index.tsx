import {
  WorkspaceListItemSkeleton,
  WorkspaceListSkeleton,
} from '@affine/component/setting-components';
import { UserAvatar } from '@affine/component/user-avatar';
import { WorkspaceAvatar } from '@affine/component/workspace-avatar';
import { WorkspaceFlavour } from '@affine/env/workspace';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import type { RootWorkspaceMetadata } from '@affine/workspace/atom';
import { rootWorkspacesMetadataAtom } from '@affine/workspace/atom';
import { Logo1Icon } from '@blocksuite/icons';
import { Tooltip } from '@toeverything/components/tooltip';
import { useBlockSuiteWorkspaceName } from '@toeverything/hooks/use-block-suite-workspace-name';
import { useStaticBlockSuiteWorkspace } from '@toeverything/infra/__internal__/react';
import clsx from 'clsx';
import { useAtom, useAtomValue } from 'jotai/react';
import {
  type ReactElement,
  Suspense,
  useCallback,
  useMemo,
  useRef,
} from 'react';

import { authAtom } from '../../../../atoms';
import { useCurrentLoginStatus } from '../../../../hooks/affine/use-current-login-status';
import { useCurrentUser } from '../../../../hooks/affine/use-current-user';
import { useCurrentWorkspace } from '../../../../hooks/current/use-current-workspace';
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
};

export const UserInfo = ({
  onAccountSettingClick,
}: UserInfoProps): ReactElement => {
  const user = useCurrentUser();
  return (
    <div
      data-testid="user-info-card"
      className={accountButton}
      onClick={onAccountSettingClick}
    >
      <UserAvatar
        size={28}
        name={user.name}
        url={user.image}
        className="avatar"
      />

      <div className="content">
        <div className="name" title={user.name}>
          {user.name}
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
  onWorkspaceSettingClick: (workspaceId: string) => void;
  selectedWorkspaceId: string | null;
  selectedGeneralKey: string | null;
  onAccountSettingClick: () => void;
}) => {
  const t = useAFFiNEI18N();
  const loginStatus = useCurrentLoginStatus();
  return (
    <div className={settingSlideBar} data-testid="settings-sidebar">
      <div className={sidebarTitle}>{t['Settings']()}</div>
      <div className={sidebarSubtitle}>{t['General']()}</div>
      <div className={sidebarItemsWrapper}>
        {generalSettingList.map(({ title, icon, key, testId }) => {
          if (!runtimeConfig.enablePlugin && key === 'plugins') {
            return null;
          }
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
          <UserInfo onAccountSettingClick={onAccountSettingClick} />
        ) : null}
      </div>
    </div>
  );
};

export const WorkspaceList = ({
  onWorkspaceSettingClick,
  selectedWorkspaceId,
}: {
  onWorkspaceSettingClick: (workspaceId: string) => void;
  selectedWorkspaceId: string | null;
}) => {
  const workspaces = useAtomValue(rootWorkspacesMetadataAtom);
  const [currentWorkspace] = useCurrentWorkspace();
  const workspaceList = useMemo(() => {
    return workspaces.filter(
      ({ flavour }) => flavour !== WorkspaceFlavour.AFFINE_PUBLIC
    );
  }, [workspaces]);
  return (
    <>
      {workspaceList.map(workspace => {
        return (
          <Suspense key={workspace.id} fallback={<WorkspaceListItemSkeleton />}>
            <WorkspaceListItem
              meta={workspace}
              onClick={() => {
                onWorkspaceSettingClick(workspace.id);
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
  meta: RootWorkspaceMetadata;
  onClick: () => void;
  isCurrent: boolean;
  isActive: boolean;
}) => {
  const workspace = useStaticBlockSuiteWorkspace(meta.id);
  const [workspaceName] = useBlockSuiteWorkspaceName(workspace);
  const ref = useRef(null);

  return (
    <div
      className={clsx(sidebarSelectItem, { active: isActive })}
      title={workspaceName}
      onClick={onClick}
      data-testid="workspace-list-item"
      ref={ref}
    >
      <WorkspaceAvatar size={14} workspace={workspace} className="icon" />
      <span className="setting-name">{workspaceName}</span>
      {isCurrent ? (
        <Tooltip
          content="Current"
          side="top"
          portalOptions={{
            container: ref.current,
          }}
        >
          <div
            className={currentWorkspaceLabel}
            data-testid="current-workspace-label"
          ></div>
        </Tooltip>
      ) : null}
    </div>
  );
};
