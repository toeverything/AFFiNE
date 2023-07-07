import {
  SettingModal as SettingModalBase,
  type SettingModalProps,
} from '@affine/component/setting-components';
import { WorkspaceFlavour } from '@affine/env/workspace';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { rootWorkspacesMetadataAtom } from '@affine/workspace/atom';
import { useStaticBlockSuiteWorkspace } from '@affine/workspace/utils';
import { ContactWithUsIcon } from '@blocksuite/icons';
import type { PassiveDocProvider } from '@blocksuite/store';
import { noop } from 'foxact/noop';
import { useAtomValue } from 'jotai';
import type React from 'react';
import { useCallback, useEffect, useMemo } from 'react';

import { useCurrentWorkspace } from '../../../hooks/current/use-current-workspace';
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
  workspaceId: string | null;
  onSettingClick: (params: {
    activeTab: ActiveTab;
    workspaceId: string | null;
  }) => void;
};
export const SettingModal: React.FC<SettingModalProps & SettingProps> = ({
  open,
  setOpen,
  activeTab = 'appearance',
  workspaceId = null,
  onSettingClick,
}) => {
  const t = useAFFiNEI18N();

  const workspaces = useAtomValue(rootWorkspacesMetadataAtom);
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
        workspaceId: null,
      });
    },
    [onSettingClick]
  );
  const onWorkspaceSettingClick = useCallback(
    (workspaceId: string) => {
      onSettingClick({
        activeTab: 'workspace',
        workspaceId,
      });
    },
    [onSettingClick]
  );
  const onAccountSettingClick = useCallback(() => {
    onSettingClick({ activeTab: 'account', workspaceId: null });
  }, [onSettingClick]);

  const workspace = useStaticBlockSuiteWorkspace(workspaceId);

  useEffect(() => {
    if (workspace && workspace !== currentWorkspace.blockSuiteWorkspace) {
      const providers = workspace.providers.filter(
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
        selectedWorkspaceId={workspace.id}
        onAccountSettingClick={onAccountSettingClick}
      />

      <div className={settingContent}>
        <div className="wrapper">
          <div className="content">
            {activeTab === 'workspace' && workspaceId ? (
              <WorkspaceSetting key={workspace.id} workspaceId={workspace.id} />
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
