import { ConfirmModal } from '@affine/component/ui/modal';
import { openQuotaModalAtom } from '@affine/core/components/atoms';
import { WorkspaceDialogService } from '@affine/core/modules/dialogs';
import { WorkspacePermissionService } from '@affine/core/modules/permissions';
import { WorkspaceQuotaService } from '@affine/core/modules/quota';
import { WorkspaceService } from '@affine/core/modules/workspace';
import { type I18nString, useI18n } from '@affine/i18n';
import { track } from '@affine/track';
import { useLiveData, useService } from '@toeverything/infra';
import { useAtom } from 'jotai';
import { useCallback, useEffect, useMemo } from 'react';

import { useAsyncCallback } from '../../hooks/affine-async-hooks';
import * as styles from './cloud-quota-modal.css';

export const CloudQuotaModal = () => {
  const t = useI18n();
  const currentWorkspace = useService(WorkspaceService).workspace;
  const [open, setOpen] = useAtom(openQuotaModalAtom);
  const workspaceQuotaService = useService(WorkspaceQuotaService);
  useEffect(() => {
    workspaceQuotaService.quota.revalidate();
  }, [workspaceQuotaService]);
  const workspaceQuota = useLiveData(workspaceQuotaService.quota.quota$);
  const permissionService = useService(WorkspacePermissionService);
  const isOwner = useLiveData(permissionService.permission.isOwner$);
  useEffect(() => {
    // revalidate permission
    permissionService.permission.revalidate();
  }, [permissionService]);

  const workspaceDialogService = useService(WorkspaceDialogService);
  const handleUpgradeConfirm = useCallback(() => {
    workspaceDialogService.open('setting', {
      activeTab: 'plans',
      scrollAnchor: 'cloudPricingPlan',
    });

    track.$.paywall.storage.viewPlans();
    setOpen(false);
  }, [workspaceDialogService, setOpen]);

  const description = useMemo(() => {
    if (!workspaceQuota) {
      return null;
    }
    if (isOwner) {
      return (
        <OwnerDescription quota={workspaceQuota.humanReadable.blobLimit} />
      );
    }

    return t['com.affine.payment.blob-limit.description.member']({
      quota: workspaceQuota.humanReadable.blobLimit,
    });
  }, [isOwner, workspaceQuota, t]);

  const onAbortLargeBlob = useAsyncCallback(
    async (byteSize: number) => {
      // wait for quota revalidation
      await workspaceQuotaService.quota.waitForRevalidation();
      if (
        byteSize > (workspaceQuotaService.quota.quota$.value?.blobLimit ?? 0)
      ) {
        setOpen(true);
      }
    },
    [setOpen, workspaceQuotaService]
  );

  useEffect(() => {
    if (!workspaceQuota) {
      return;
    }

    currentWorkspace.engine.blob.setMaxBlobSize(workspaceQuota.blobLimit);

    const disposable =
      currentWorkspace.engine.blob.onReachedMaxBlobSize(onAbortLargeBlob);
    return () => {
      disposable();
    };
  }, [currentWorkspace.engine.blob, onAbortLargeBlob, workspaceQuota]);

  return (
    <ConfirmModal
      open={open}
      title={t['com.affine.payment.blob-limit.title']()}
      onOpenChange={setOpen}
      description={description}
      onConfirm={handleUpgradeConfirm}
      confirmText={t['com.affine.payment.upgrade']()}
      confirmButtonOptions={{
        variant: 'primary',
      }}
    />
  );
};

const tips: I18nString[] = [
  'com.affine.payment.blob-limit.description.owner.tips-1',
  'com.affine.payment.blob-limit.description.owner.tips-2',
  'com.affine.payment.blob-limit.description.owner.tips-3',
];

const OwnerDescription = ({ quota }: { quota: string }) => {
  const t = useI18n();
  return (
    <div>
      {t['com.affine.payment.blob-limit.description.owner']({
        quota: quota,
      })}
      <ul className={styles.ulStyle}>
        {tips.map((tip, index) => (
          <li className={styles.liStyle} key={index}>
            <div className={styles.prefixDot} />
            {t.t(tip)}
          </li>
        ))}
      </ul>
    </div>
  );
};
