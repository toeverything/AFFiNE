import { notify } from '@affine/component';
import { SettingRow } from '@affine/component/setting-components';
import { Button } from '@affine/component/ui/button';
import { useAsyncCallback } from '@affine/core/hooks/affine-async-hooks';
import { useSystemOnline } from '@affine/core/hooks/use-system-online';
import { apis } from '@affine/electron-api';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import type { Workspace, WorkspaceMetadata } from '@toeverything/infra';
import { useState } from 'react';

interface ExportPanelProps {
  workspaceMetadata: WorkspaceMetadata;
  workspace: Workspace | null;
}

export const ExportPanel = ({
  workspaceMetadata,
  workspace,
}: ExportPanelProps) => {
  const workspaceId = workspaceMetadata.id;
  const t = useAFFiNEI18N();
  const [saving, setSaving] = useState(false);
  const isOnline = useSystemOnline();

  const onExport = useAsyncCallback(async () => {
    if (saving || !workspace) {
      return;
    }
    setSaving(true);
    try {
      if (isOnline) {
        await workspace.engine.waitForSynced();
        await workspace.engine.blob.sync();
      }

      const result = await apis?.dialog.saveDBFileAs(workspaceId);
      if (result?.error) {
        throw new Error(result.error);
      } else if (!result?.canceled) {
        notify.success({ title: t['Export success']() });
      }
    } catch (e: any) {
      notify.error({ title: t['Export failed'](), message: e.message });
    } finally {
      setSaving(false);
    }
  }, [isOnline, saving, t, workspace, workspaceId]);

  return (
    <SettingRow name={t['Export']()} desc={t['Export Description']()}>
      <Button
        data-testid="export-affine-backup"
        onClick={onExport}
        disabled={saving}
      >
        {t['Export']()}
      </Button>
    </SettingRow>
  );
};
