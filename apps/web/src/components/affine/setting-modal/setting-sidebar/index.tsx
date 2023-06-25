import { WorkspaceAvatar } from '@affine/component/workspace-avatar';
import type {
  AffineLegacyCloudWorkspace,
  LocalWorkspace,
} from '@affine/env/workspace';
import { useBlockSuiteWorkspaceName } from '@toeverything/hooks/use-block-suite-workspace-name';
import clsx from 'clsx';

import type {
  GeneralSettingKeys,
  GeneralSettingList,
} from '../general-setting';
import type { Workspace } from '../type';
import {
  accountButton,
  settingSlideBar,
  sidebarItemsWrapper,
  sidebarSelectItem,
  sidebarSubtitle,
  sidebarTitle,
} from './style.css';

export const SettingSidebar = ({
  generalSettingList,
  onGeneralSettingClick,
  currentWorkspace,
  workspaceList,
  onWorkspaceSettingClick,
  selectedWorkspace,
  selectedGeneralKey,
  onAccountSettingClick,
}: {
  generalSettingList: GeneralSettingList;
  onGeneralSettingClick: (key: GeneralSettingKeys) => void;
  currentWorkspace: Workspace;
  workspaceList: Workspace[];
  onWorkspaceSettingClick: (
    workspace: AffineLegacyCloudWorkspace | LocalWorkspace
  ) => void;

  selectedWorkspace: Workspace | null;
  selectedGeneralKey: string | null;
  onAccountSettingClick: () => void;
}) => {
  return (
    <div className={settingSlideBar}>
      <div className={sidebarTitle}>Settings</div>
      <div className={sidebarSubtitle}>General</div>
      <div className={sidebarItemsWrapper}>
        {generalSettingList.map(({ title, icon, key }) => {
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
            >
              {icon({ className: 'icon' })}
              <span className="setting-name">{title}</span>
            </div>
          );
        })}
      </div>

      <div className={sidebarSubtitle}>Workspace</div>
      <div className={clsx(sidebarItemsWrapper, 'scroll')}>
        {workspaceList.map(workspace => {
          return (
            <WorkspaceListItem
              key={workspace.id}
              workspace={workspace}
              onClick={() => {
                onWorkspaceSettingClick(workspace);
              }}
              isCurrent={workspace.id === currentWorkspace.id}
              isActive={workspace.id === selectedWorkspace?.id}
            />
          );
        })}
      </div>

      <div className={accountButton} onClick={onAccountSettingClick}>
        <div className="avatar"></div>
        <div className="content">
          <div className="name" title="xxx">
            Account NameAccount Name
          </div>
          <div className="email" title="xxx">
            xxxxxxxx@gmail.comxxxxxxxx@gmail.com
          </div>
        </div>
      </div>
    </div>
  );
};

const WorkspaceListItem = ({
  workspace,
  onClick,
  isCurrent,
  isActive,
}: {
  workspace: AffineLegacyCloudWorkspace | LocalWorkspace;
  onClick: () => void;
  isCurrent: boolean;
  isActive: boolean;
}) => {
  const [workspaceName] = useBlockSuiteWorkspaceName(
    workspace.blockSuiteWorkspace ?? null
  );
  return (
    <div
      className={clsx(sidebarSelectItem, { active: isActive })}
      title={workspaceName}
      onClick={onClick}
    >
      <WorkspaceAvatar size={14} workspace={workspace} className="icon" />
      <span className="setting-name">{workspaceName}</span>
      {isCurrent ? <div className="current-label">Current</div> : null}
    </div>
  );
};
