import { ConfirmModal, notify, useConfirmModal } from '@affine/component';
import { useAsyncCallback } from '@affine/core/components/hooks/affine-async-hooks';
import { AuthService } from '@affine/core/modules/cloud';
import { WorkspacesService } from '@affine/core/modules/workspace';
import { UserFriendlyError } from '@affine/error';
import { Trans, useI18n } from '@affine/i18n';
import track from '@affine/track';
import { ArrowRightSmallIcon } from '@blocksuite/icons/rc';
import { useLiveData, useService } from '@toeverything/infra';
import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { RowLayout } from '../row.layout';
import * as styles from './delete-account.css';

export const DeleteAccount = () => {
  const t = useI18n();
  const workspacesService = useService(WorkspacesService);
  const authService = useService(AuthService);
  const session = authService.session;
  const account = useLiveData(session.account$);
  const workspaceProfiles = workspacesService.getAllWorkspaceProfile();
  const isTeamWorkspaceOwner = workspaceProfiles.some(
    profile => profile.profile$.value?.isTeam && profile.profile$.value.isOwner
  );
  const [showModal, setShowModal] = useState(false);

  const openModal = useCallback(() => {
    setShowModal(true);
  }, []);

  return (
    <>
      {account ? (
        <RowLayout
          label={t['com.affine.mobile.setting.others.delete-account']()}
          onClick={openModal}
        >
          <ArrowRightSmallIcon fontSize={22} />
        </RowLayout>
      ) : null}
      {isTeamWorkspaceOwner ? (
        <TeamOwnerWarningModal open={showModal} onOpenChange={setShowModal} />
      ) : (
        <DeleteAccountModal open={showModal} onOpenChange={setShowModal} />
      )}
    </>
  );
};

const TeamOwnerWarningModal = ({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => {
  const t = useI18n();
  const onConfirm = useCallback(() => {
    onOpenChange(false);
  }, [onOpenChange]);
  return (
    <ConfirmModal
      open={open}
      onOpenChange={onOpenChange}
      title={t['com.affine.setting.account.delete.team-warning-title']()}
      description={t[
        'com.affine.setting.account.delete.team-warning-description'
      ]()}
      confirmText={t['Confirm']()}
      confirmButtonOptions={{
        variant: 'primary',
      }}
      onConfirm={onConfirm}
      cancelButtonOptions={{
        style: {
          display: 'none',
        },
      }}
    />
  );
};

const DeleteAccountModal = ({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => {
  const t = useI18n();
  const authService = useService(AuthService);
  const session = authService.session;
  const account = useLiveData(session.account$);
  const [isLoading, setIsLoading] = useState(false);
  const { openConfirmModal } = useConfirmModal();
  const navigate = useNavigate();
  const onConfirm = useCallback(() => {
    navigate('/');
  }, [navigate]);

  const handleDeleteAccount = useCallback(async () => {
    try {
      setIsLoading(true);
      await authService.deleteAccount();
      track.$.$.auth.deleteAccount();
      openConfirmModal({
        title: t['com.affine.setting.account.delete.success-title'](),
        description: (
          <>
            <span>
              {t['com.affine.setting.account.delete.success-description-1']()}
            </span>
            <br />
            <span>
              {t['com.affine.setting.account.delete.success-description-2']()}
            </span>
          </>
        ),
        cancelButtonOptions: {
          style: {
            display: 'none',
          },
        },
        confirmText: t['Confirm'](),
        onConfirm,
        confirmButtonOptions: {
          variant: 'primary',
        },
      });
    } catch (err) {
      console.error(err);
      const error = UserFriendlyError.fromAny(err);
      notify.error(error);
    } finally {
      setIsLoading(false);
    }
  }, [authService, onConfirm, openConfirmModal, t]);

  const onDeleteAccountConfirm = useAsyncCallback(async () => {
    await handleDeleteAccount();
  }, [handleDeleteAccount]);

  const onCancel = useCallback(() => {
    onOpenChange(false);
  }, [onOpenChange]);

  if (!account) {
    return null;
  }
  return (
    <ConfirmModal
      open={open}
      onOpenChange={onOpenChange}
      title={t['com.affine.setting.account.delete.confirm-title']()}
      description={
        <Trans
          i18nKey="com.affine.setting.account.delete.confirm-description-2"
          components={{
            1: <strong />,
          }}
        />
      }
      descriptionClassName={styles.description}
      confirmText={t['com.affine.setting.account.delete.confirm-button']()}
      confirmButtonOptions={{
        variant: 'error',
        disabled: isLoading,
        loading: isLoading,
        onClick: onDeleteAccountConfirm,
      }}
      onCancel={onCancel}
      cancelText={t['Cancel']()}
      cancelButtonOptions={{
        variant: 'primary',
      }}
      rowFooter
    />
  );
};
