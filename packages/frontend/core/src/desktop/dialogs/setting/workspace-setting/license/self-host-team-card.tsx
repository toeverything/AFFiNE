import { Button, ConfirmModal, Input, notify } from '@affine/component';
import { SettingRow } from '@affine/component/setting-components';
import { useEnableCloud } from '@affine/core/components/hooks/affine/use-enable-cloud';
import {
  SelfhostLicenseService,
  WorkspaceSubscriptionService,
} from '@affine/core/modules/cloud';
import { WorkspacePermissionService } from '@affine/core/modules/permissions';
import { WorkspaceQuotaService } from '@affine/core/modules/quota';
import { WorkspaceService } from '@affine/core/modules/workspace';
import { UserFriendlyError } from '@affine/error';
import { Trans, useI18n } from '@affine/i18n';
import { useLiveData, useService } from '@toeverything/infra';
import clsx from 'clsx';
import { useCallback, useEffect, useMemo, useState } from 'react';

import * as styles from './styles.css';

export const SelfHostTeamCard = () => {
  const t = useI18n();

  const workspace = useService(WorkspaceService).workspace;
  const workspaceQuotaService = useService(WorkspaceQuotaService);
  const workspaceSubscriptionService = useService(WorkspaceSubscriptionService);

  const permission = useService(WorkspacePermissionService).permission;
  const isTeam = useLiveData(permission.isTeam$);
  const workspaceQuota = useLiveData(workspaceQuotaService.quota.quota$);
  const confirmEnableCloud = useEnableCloud();
  const isLocalWorkspace = workspace.flavour === 'local';

  const [openModal, setOpenModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const selfhostLicenseService = useService(SelfhostLicenseService);
  const license = useLiveData(selfhostLicenseService.license$);

  useEffect(() => {
    permission.revalidate();
    workspaceQuotaService.quota.revalidate();
    workspaceSubscriptionService.subscription.revalidate();
    selfhostLicenseService.revalidate();
  }, [
    permission,
    selfhostLicenseService,
    workspaceQuotaService,
    workspaceSubscriptionService,
  ]);

  const description = useMemo(() => {
    if (isTeam) {
      return t[
        'com.affine.settings.workspace.license.self-host-team.team.description'
      ]({
        expirationDate: new Date(license?.expiredAt || 0).toLocaleDateString(),
        leftDays: Math.floor(
          (new Date(license?.expiredAt || 0).getTime() - Date.now()) /
            (1000 * 60 * 60 * 24)
        ).toLocaleString(),
      });
    }
    return t[
      'com.affine.settings.workspace.license.self-host-team.free.description'
    ]({
      memberCount: workspaceQuota?.humanReadable.memberLimit || '10',
    });
  }, [isTeam, license, t, workspaceQuota]);
  const handleClick = useCallback(() => {
    if (isLocalWorkspace) {
      confirmEnableCloud(workspace);
      return;
    }
    setOpenModal(true);
  }, [confirmEnableCloud, isLocalWorkspace, workspace]);

  const onActivate = useCallback(
    (license: string) => {
      setLoading(true);
      selfhostLicenseService
        .activateLicense(workspace.id, license)
        .then(() => {
          setLoading(false);
          setOpenModal(false);
          permission.revalidate();
          selfhostLicenseService.revalidate();
          notify.success({
            title:
              t['com.affine.settings.workspace.license.activate-success'](),
          });
        })
        .catch(e => {
          setLoading(false);

          console.error(e);
          const error = UserFriendlyError.fromAny(e);

          notify.error({
            title: error.name,
            message: error.message,
          });
        });
    },
    [permission, selfhostLicenseService, t, workspace.id]
  );

  const onDeactivate = useCallback(() => {
    setLoading(true);
    selfhostLicenseService
      .deactivateLicense(workspace.id)
      .then(() => {
        setLoading(false);
        setOpenModal(false);
        permission.revalidate();
        notify.success({
          title:
            t['com.affine.settings.workspace.license.deactivate-success'](),
        });
      })
      .catch(e => {
        setLoading(false);

        console.error(e);
        const error = UserFriendlyError.fromAny(e);

        notify.error({
          title: error.name,
          message: error.message,
        });
      });
  }, [permission, selfhostLicenseService, t, workspace.id]);

  const handleConfirm = useCallback(
    (license: string) => {
      if (isTeam) {
        onDeactivate();
      } else {
        onActivate(license);
      }
    },
    [isTeam, onActivate, onDeactivate]
  );

  return (
    <>
      <div className={styles.planCard}>
        <div className={styles.container}>
          <div className={styles.currentPlan}>
            <SettingRow
              spreadCol={false}
              name={t[
                `com.affine.settings.workspace.license.self-host${isTeam ? '-team' : ''}`
              ]()}
              desc={description}
            />
          </div>
          <div
            className={clsx(styles.planPrice, {
              hidden: isLocalWorkspace,
            })}
          >
            <span className={styles.seat}>
              {t[
                'com.affine.settings.workspace.license.self-host-team.seats'
              ]()}
            </span>
            <span>
              {isTeam
                ? license?.quantity || ''
                : `${workspaceQuota?.memberCount}/${workspaceQuota?.memberLimit}`}
            </span>
          </div>
        </div>
        <div
          className={clsx(styles.buttonContainer, {
            left: isTeam || isLocalWorkspace,
          })}
        >
          <Button
            variant="primary"
            className={styles.activeButton}
            onClick={handleClick}
          >
            {t[
              `com.affine.settings.workspace.license.self-host-team.${isTeam ? 'deactivate-license' : 'active-key'}`
            ]()}
          </Button>
        </div>
      </div>
      <ActionModal
        open={openModal}
        onOpenChange={setOpenModal}
        isTeam={!!isTeam}
        loading={loading}
        onConfirm={handleConfirm}
      />
    </>
  );
};

const ActionModal = ({
  open,
  onOpenChange,
  isTeam,
  onConfirm,
  loading,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isTeam: boolean;
  loading: boolean;
  onConfirm: (key: string) => void;
}) => {
  const t = useI18n();
  const [key, setKey] = useState('');

  const handleConfirm = useCallback(() => {
    onConfirm(key);
    setKey('');
  }, [key, onConfirm]);

  const handleOpenChange = useCallback(
    (open: boolean) => {
      setKey('');
      onOpenChange(open);
    },
    [onOpenChange]
  );

  return (
    <ConfirmModal
      width={480}
      open={open}
      onOpenChange={handleOpenChange}
      title={t[
        `com.affine.settings.workspace.license.${isTeam ? 'deactivate' : 'activate'}-modal.title`
      ]()}
      description={t[
        `com.affine.settings.workspace.license.${isTeam ? 'deactivate' : 'activate'}-modal.description`
      ]()}
      cancelText={t['Cancel']()}
      cancelButtonOptions={{
        variant: 'secondary',
      }}
      contentOptions={{
        ['data-testid' as string]: 'invite-modal',
        style: {
          padding: '20px 24px',
        },
      }}
      confirmText={t['Confirm']()}
      confirmButtonOptions={{
        loading: loading,
        variant: isTeam ? 'error' : 'primary',
        disabled: loading || (!isTeam && !key),
      }}
      onConfirm={handleConfirm}
      childrenContentClassName={styles.activateModalContent}
    >
      {isTeam ? null : (
        <>
          <Input
            value={key}
            onChange={setKey}
            placeholder="AAAA-AAAA-AAAA-AAAA-AAAA"
          />
          <span>
            <Trans
              i18nKey="com.affine.settings.workspace.license.activate-modal.tips"
              components={{
                1: (
                  <a
                    href="mailto:support@toeverything.info"
                    style={{ color: 'var(--affine-link-color)' }}
                  >
                    customer support
                  </a>
                ),
                2: (
                  <a
                    href="https://affine.pro/pricing/?type=selfhost#table"
                    target="_blank"
                    rel="noreferrer"
                    style={{ color: 'var(--affine-link-color)' }}
                  >
                    click to purchase
                  </a>
                ),
              }}
            />
          </span>
        </>
      )}
    </ConfirmModal>
  );
};
