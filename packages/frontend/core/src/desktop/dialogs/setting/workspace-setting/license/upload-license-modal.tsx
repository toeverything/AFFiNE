import { Button, Modal, notify, useConfirmModal } from '@affine/component';
import { useAsyncCallback } from '@affine/core/components/hooks/affine-async-hooks';
import { Upload } from '@affine/core/components/pure/file-upload';
import {
  SelfhostLicenseService,
  WorkspaceSubscriptionService,
} from '@affine/core/modules/cloud';
import { WorkspacePermissionService } from '@affine/core/modules/permissions';
import { WorkspaceQuotaService } from '@affine/core/modules/quota';
import { WorkspaceService } from '@affine/core/modules/workspace';
import { copyTextToClipboard } from '@affine/core/utils/clipboard';
import { UserFriendlyError } from '@affine/error';
import { Trans, useI18n } from '@affine/i18n';
import { CopyIcon, FileIcon } from '@blocksuite/icons/rc';
import { useService } from '@toeverything/infra';
import { useCallback, useEffect, useState } from 'react';

import * as styles from './upload-license-modal.css';

export const UploadLicenseModal = ({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => {
  const t = useI18n();
  const workspaceService = useService(WorkspaceService);
  const workspace = workspaceService.workspace;
  const licenseService = useService(SelfhostLicenseService);
  const quotaService = useService(WorkspaceQuotaService);
  const workspaceSubscriptionService = useService(WorkspaceSubscriptionService);
  const permission = useService(WorkspacePermissionService).permission;
  const { openConfirmModal } = useConfirmModal();
  const [isInstalling, setIsInstalling] = useState(false);

  const revalidate = useCallback(() => {
    permission.revalidate();
    quotaService.quota.revalidate();
    workspaceSubscriptionService.subscription.revalidate();
    licenseService.revalidate();
  }, [licenseService, permission, quotaService, workspaceSubscriptionService]);

  const handleInstallLicense = useAsyncCallback(
    async (file: File) => {
      setIsInstalling(true);
      try {
        await licenseService.installLicense(workspace.id, file);
        revalidate();
        onOpenChange(false);
        openConfirmModal({
          title:
            t[
              'com.affine.settings.workspace.license.self-host-team.upload-license-file.success.title'
            ](),
          description:
            t[
              'com.affine.settings.workspace.license.self-host-team.upload-license-file.success.description'
            ](),
          confirmText: t['Confirm'](),
          cancelButtonOptions: {
            style: {
              display: 'none',
            },
          },
          confirmButtonOptions: {
            variant: 'primary',
          },
        });
      } catch (e) {
        const err = UserFriendlyError.fromAny(e);
        onOpenChange(false);
        console.error(err);
        openConfirmModal({
          title:
            t[
              'com.affine.settings.workspace.license.self-host-team.upload-license-file.failed'
            ](),
          description: err.message,
          confirmText: t['Confirm'](),
          cancelButtonOptions: {
            style: {
              display: 'none',
            },
          },
          confirmButtonOptions: {
            variant: 'primary',
          },
        });
      }
      setIsInstalling(false);
    },
    [
      licenseService,
      onOpenChange,
      openConfirmModal,
      revalidate,
      t,
      workspace.id,
    ]
  );

  const handleOpenChange = useCallback(
    (open: boolean) => {
      onOpenChange(open);
    },
    [onOpenChange]
  );

  const copyWorkspaceId = useCallback(() => {
    copyTextToClipboard(workspace.id)
      .then(success => {
        if (success) {
          notify.success({ title: t['Copied link to clipboard']() });
        }
      })
      .catch(err => {
        console.error(err);
      });
  }, [t, workspace.id]);

  useEffect(() => {
    revalidate();
  }, [revalidate]);

  return (
    <Modal
      width={480}
      open={open}
      onOpenChange={handleOpenChange}
      title={t[
        'com.affine.settings.workspace.license.self-host-team.upload-license-file'
      ]()}
      description={t[
        'com.affine.settings.workspace.license.self-host-team.upload-license-file.description'
      ]()}
    >
      <div className={styles.activateModalContent}>
        <div className={styles.tipsContainer}>
          <div className={styles.tipsTitle}>
            {t[
              'com.affine.settings.workspace.license.self-host-team.upload-license-file.tips.title'
            ]()}
          </div>
          <div className={styles.tipsContent}>
            <Trans
              i18nKey="com.affine.settings.workspace.license.self-host-team.upload-license-file.tips.content"
              components={{
                1: (
                  <a
                    href={`${BUILD_CONFIG.requestLicenseUrl}?usp=pp_url&entry.1000023=${workspace.id}`}
                    target="_blank"
                    rel="noreferrer"
                    className={styles.textLink}
                  />
                ),
              }}
            />
          </div>
          <div className={styles.workspaceIdContainer}>
            <div className={styles.workspaceIdLabel}>
              {t[
                'com.affine.settings.workspace.license.self-host-team.upload-license-file.tips.workspace-id'
              ]()}
            </div>
            <Button
              variant="secondary"
              onClick={copyWorkspaceId}
              className={styles.copyButton}
            >
              <span className={styles.copyButtonContent}>
                <span className={styles.copyButtonText} title={workspace.id}>
                  {workspace.id}
                </span>
                <CopyIcon className={styles.copyIcon} />
              </span>
            </Button>
          </div>
        </div>
        <Upload accept=".lic, .license" fileChange={handleInstallLicense}>
          <Button
            variant="primary"
            className={styles.uploadButton}
            loading={isInstalling}
            disabled={isInstalling}
          >
            <span className={styles.uploadButtonContent}>
              <FileIcon className={styles.uploadButtonIcon} />
              {t[
                'com.affine.settings.workspace.license.self-host-team.upload-license-file.click-to-upload'
              ]()}
            </span>
          </Button>
        </Upload>
        <div className={styles.footer}>
          {t[
            'com.affine.settings.workspace.license.self-host-team.upload-license-file.help'
          ]()}
        </div>
      </div>
    </Modal>
  );
};
