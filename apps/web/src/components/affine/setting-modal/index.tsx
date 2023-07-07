import {
  SettingModal as SettingModalBase,
  type SettingModalProps,
} from '@affine/component/setting-components';
import { WorkspaceFlavour } from '@affine/env/workspace';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { ContactWithUsIcon } from '@blocksuite/icons';
import type { PassiveDocProvider } from '@blocksuite/store';
import { noop } from 'foxact/noop';
import type React from 'react';
import { useCallback, useEffect, useMemo } from 'react';

import { useCurrentWorkspace } from '../../../hooks/current/use-current-workspace';
import { useWorkspaces } from '../../../hooks/use-workspaces';
import type { AllWorkspace } from '../../../shared';
import { AccountSetting } from './account-setting';
import {
  GeneralSetting,
  type GeneralSettingKeys,
  useGeneralSettingList,
} from './general-setting';
import { SettingSidebar } from './setting-sidebar';
import { settingContent } from './style.css';
import { WorkspaceSetting } from './workspace-setting';

type ActiveTab = GeneralSettingKeys | 'workspace' | 'account';
export type SettingProps = {
  activeTab: ActiveTab;
  workspace: AllWorkspace | null;
  onSettingClick: (params: {
    activeTab: ActiveTab;
    workspace: AllWorkspace | null;
  }) => void;
};
export const SettingModal: React.FC<SettingModalProps & SettingProps> = ({
  open,
  setOpen,
  activeTab = 'appearance',
  workspace = null,
  onSettingClick,
}) => {
  const t = useAFFiNEI18N();

  const workspaces = useWorkspaces();
  const [currentWorkspace] = useCurrentWorkspace();
  const generalSettingList = useGeneralSettingList();
  const workspaceList = useMemo(() => {
    return workspaces.filter(
      ({ flavour }) => flavour !== WorkspaceFlavour.PUBLIC
    ) as AllWorkspace[];
  }, [workspaces]);

  const onGeneralSettingClick = useCallback(
    (key: GeneralSettingKeys) => {
      onSettingClick({
        activeTab: key,
        workspace: null,
      });
    },
    [onSettingClick]
  );
  const onWorkspaceSettingClick = useCallback(
    (workspace: AllWorkspace) => {
      onSettingClick({
        activeTab: 'workspace',
        workspace,
      });
    },
    [onSettingClick]
  );
  const onAccountSettingClick = useCallback(() => {
    onSettingClick({ activeTab: 'account', workspace: null });
  }, [onSettingClick]);

  useEffect(() => {
    if (workspace && workspace !== currentWorkspace) {
      const providers = workspace.blockSuiteWorkspace.providers.filter(
        (provider): provider is PassiveDocProvider =>
          'passive' in provider && provider.passive
      );
      providers.forEach(provider => {
        provider.connect();
      });
      return () => {
        providers.forEach(provider => {
          provider.disconnect();
        });
      };
    }
    return noop;
  }, [currentWorkspace, workspace]);

  return (
    <SettingModalBase open={open} setOpen={setOpen}>
      <SettingSidebar
        generalSettingList={generalSettingList}
        onGeneralSettingClick={onGeneralSettingClick}
        currentWorkspace={currentWorkspace as AllWorkspace}
        workspaceList={workspaceList}
        onWorkspaceSettingClick={onWorkspaceSettingClick}
        selectedGeneralKey={activeTab}
        selectedWorkspace={workspace}
        onAccountSettingClick={onAccountSettingClick}
      />

      <div className={settingContent}>
        <div className="wrapper">
          <div className="content">
            {activeTab === 'workspace' && workspace ? (
              <WorkspaceSetting key={workspace.id} workspace={workspace} />
            ) : null}
            {generalSettingList.find(v => v.key === activeTab) ? (
              <GeneralSetting generalKey={activeTab as GeneralSettingKeys} />
            ) : null}
            {activeTab === 'account' ? <AccountSetting /> : null}
          </div>
          <div className="footer">
            <ContactWithUsIcon />
            <a href="https://community.affine.pro/home" target="_blank">
              {t[
                'Need more customization options? You can suggest them to us in the community.'
              ]()}
            </a>
          </div>
        </div>
      </div>
    </SettingModalBase>
  );
};
