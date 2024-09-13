import { SettingRow } from '@affine/component/setting-components';
import { Button } from '@affine/component/ui/button';
import { useEnableCloud } from '@affine/core/components/hooks/affine/use-enable-cloud';
import { UNTITLED_WORKSPACE_NAME } from '@affine/env/constant';
import { WorkspaceFlavour } from '@affine/env/workspace';
import { useI18n } from '@affine/i18n';
import {
  useLiveData,
  useService,
  type Workspace,
  WorkspaceService,
} from '@toeverything/infra';
import { useSetAtom } from 'jotai';
import { useCallback } from 'react';

import { openSettingModalAtom } from '../../../../atoms';

export interface PublishPanelProps {
  workspace: Workspace | null;
}

export const EnableCloudPanel = () => {
  const t = useI18n();
  const confirmEnableCloud = useEnableCloud();

  const workspace = useService(WorkspaceService).workspace;
  const name = useLiveData(workspace.name$);
  const flavour = workspace.flavour;

  const setSettingModal = useSetAtom(openSettingModalAtom);

  const confirmEnableCloudAndClose = useCallback(() => {
    if (!workspace) return;
    confirmEnableCloud(workspace, {
      onSuccess: () => {
        setSettingModal(settings => ({ ...settings, open: false }));
      },
    });
  }, [confirmEnableCloud, setSettingModal, workspace]);

  if (flavour !== WorkspaceFlavour.LOCAL) {
    return null;
  }

  return (
    <SettingRow
      name={t['Workspace saved locally']({
        name: name ?? UNTITLED_WORKSPACE_NAME,
      })}
      desc={t['Enable cloud hint']()}
      spreadCol={false}
      style={{
        padding: '10px',
        background: 'var(--affine-background-secondary-color)',
      }}
    >
      <Button
        data-testid="publish-enable-affine-cloud-button"
        variant="primary"
        onClick={confirmEnableCloudAndClose}
        style={{ marginTop: '12px' }}
      >
        {t['Enable AFFiNE Cloud']()}
      </Button>
    </SettingRow>
  );
};
