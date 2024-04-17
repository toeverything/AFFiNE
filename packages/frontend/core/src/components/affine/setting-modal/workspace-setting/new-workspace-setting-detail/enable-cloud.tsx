import { SettingRow } from '@affine/component/setting-components';
import { Button } from '@affine/component/ui/button';
import { useEnableCloud } from '@affine/core/hooks/affine/use-enable-cloud';
import { UNTITLED_WORKSPACE_NAME } from '@affine/env/constant';
import { WorkspaceFlavour } from '@affine/env/workspace';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import {
  useLiveData,
  useService,
  type Workspace,
  WorkspaceService,
} from '@toeverything/infra';
import { useSetAtom } from 'jotai';
import { useCallback, useState } from 'react';

import { openSettingModalAtom } from '../../../../../atoms';
import { TmpDisableAffineCloudModal } from '../../../tmp-disable-affine-cloud-modal';

export interface PublishPanelProps {
  workspace: Workspace | null;
}

export const EnableCloudPanel = () => {
  const t = useAFFiNEI18N();
  const confirmEnableCloud = useEnableCloud();

  const workspace = useService(WorkspaceService).workspace;
  const name = useLiveData(workspace.name$);
  const flavour = workspace.flavour;

  const setSettingModal = useSetAtom(openSettingModalAtom);

  const [open, setOpen] = useState(false);

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
    <>
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
          type="primary"
          onClick={confirmEnableCloudAndClose}
          style={{ marginTop: '12px' }}
        >
          {t['Enable AFFiNE Cloud']()}
        </Button>
      </SettingRow>
      {runtimeConfig.enableCloud ? null : (
        <TmpDisableAffineCloudModal open={open} onOpenChange={setOpen} />
      )}
    </>
  );
};
