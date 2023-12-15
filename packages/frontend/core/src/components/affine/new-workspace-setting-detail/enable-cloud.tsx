import { SettingRow } from '@affine/component/setting-components';
import { Button } from '@affine/component/ui/button';
import { UNTITLED_WORKSPACE_NAME } from '@affine/env/constant';
import { WorkspaceFlavour, WorkspaceSubPath } from '@affine/env/workspace';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import type { Workspace } from '@affine/workspace';
import { workspaceManagerAtom } from '@affine/workspace/atom';
import { useAsyncCallback } from '@toeverything/hooks/affine-async-hooks';
import { useWorkspaceInfo } from '@toeverything/hooks/use-workspace-info';
import { useAtomValue, useSetAtom } from 'jotai';
import { useState } from 'react';

import { openSettingModalAtom } from '../../../atoms';
import { useNavigateHelper } from '../../../hooks/use-navigate-helper';
import { EnableAffineCloudModal } from '../enable-affine-cloud-modal';
import { TmpDisableAffineCloudModal } from '../tmp-disable-affine-cloud-modal';
import type { WorkspaceSettingDetailProps } from './types';

export interface PublishPanelProps extends WorkspaceSettingDetailProps {
  workspace: Workspace | null;
}

export const EnableCloudPanel = ({
  workspaceMetadata,
  workspace,
}: PublishPanelProps) => {
  const t = useAFFiNEI18N();

  const { openPage } = useNavigateHelper();

  const workspaceManager = useAtomValue(workspaceManagerAtom);
  const workspaceInfo = useWorkspaceInfo(workspaceMetadata);
  const setSettingModal = useSetAtom(openSettingModalAtom);

  const [open, setOpen] = useState(false);

  const handleEnableCloud = useAsyncCallback(async () => {
    if (!workspace) {
      return;
    }
    const { id: newId } =
      await workspaceManager.transformLocalToCloud(workspace);
    openPage(newId, WorkspaceSubPath.ALL);
    setOpen(false);
    setSettingModal(settings => ({
      ...settings,
      open: false,
    }));
  }, [openPage, setSettingModal, workspace, workspaceManager]);

  if (workspaceMetadata.flavour !== WorkspaceFlavour.LOCAL) {
    return null;
  }

  return (
    <>
      <SettingRow
        name={t['Workspace saved locally']({
          name: workspaceInfo?.name ?? UNTITLED_WORKSPACE_NAME,
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
          onClick={() => {
            setOpen(true);
          }}
          style={{ marginTop: '12px' }}
        >
          {t['Enable AFFiNE Cloud']()}
        </Button>
      </SettingRow>
      {runtimeConfig.enableCloud ? (
        <EnableAffineCloudModal
          open={open}
          onOpenChange={setOpen}
          onConfirm={handleEnableCloud}
        />
      ) : (
        <TmpDisableAffineCloudModal open={open} onOpenChange={setOpen} />
      )}
    </>
  );
};
