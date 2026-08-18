import { ConfirmModal, Input, notify } from '@affine/component';
import { AuthService, ServerService } from '@affine/core/modules/cloud';
import { WorkspacesService } from '@affine/core/modules/workspace';
import { UserFriendlyError } from '@affine/error';
import { Trans, useI18n } from '@affine/i18n';
import { track } from '@affine/track';
import { LiveData, useLiveData, useService } from '@toeverything/infra';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { combineLatest, map, of, switchMap } from 'rxjs';

import { RowLayout } from '../row.layout';
import * as styles from './delete-account.css';

export const DeleteAccount = ({
  onDeleteFinished,
}: {
  onDeleteFinished?: () => void;
}) => {
  const t = useI18n();
  const authService = useService(AuthService);
  const workspacesService = useService(WorkspacesService);
  const account = useLiveData(authService.session.account$);
  const isTeamWorkspaceOwner$ = useMemo(
    () =>
      LiveData.from<boolean | null>(
        workspacesService.list.workspaces$.pipe(
          switchMap(workspaces => {
            if (!workspaces.length) {
              return of(false);
            }

            return combineLatest(
              workspaces.map(meta => {
                const profile = workspacesService.getProfile(meta);
                profile.revalidate();

                return combineLatest([
                  profile.profile$,
                  profile.isLoading$,
                ]).pipe(
                  map(([info, isLoading]) =>
                    isLoading && info === null
                      ? null
                      : !!info?.isTeam && !!info?.isOwner
                  )
                );
              })
            ).pipe(
              map(ownerStates => {
                if (ownerStates.some(Boolean)) {
                  return true;
                }
                return ownerStates.some(state => state === null) ? null : false;
              })
            );
          })
        ),
        null
      ),
    [workspacesService]
  );
  const isTeamWorkspaceOwner = useLiveData(isTeamWorkspaceOwner$);
  const [open, setOpen] = useState(false);

  const handleOpen = useCallback(() => {
    setOpen(true);
  }, []);

  if (!account || isTeamWorkspaceOwner === null) {
    return null;
  }

  return (
    <>
      <RowLayout
        label={
          <span className={styles.deleteAccountLabel}>
            {t['com.affine.mobile.setting.others.delete-account']()}
          </span>
        }
        onClick={handleOpen}
      />
      {isTeamWorkspaceOwner ? (
        <TeamOwnerWarningModal open={open} onOpenChange={setOpen} />
      ) : (
        <DeleteAccountModal
          open={open}
          onOpenChange={setOpen}
          onDeleteFinished={onDeleteFinished}
        />
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
  const handleConfirm = useCallback(() => {
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
      onConfirm={handleConfirm}
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
  onDeleteFinished,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDeleteFinished?: () => void;
}) => {
  const t = useI18n();
  const authService = useService(AuthService);
  const serverService = useService(ServerService);
  const account = useLiveData(authService.session.account$);
  const [phase, setPhase] = useState<'warning' | 'confirm'>('warning');
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!open) {
      setPhase('warning');
      setEmail('');
      setIsLoading(false);
    }
  }, [open]);

  const handleDeleteAccount = useCallback(async () => {
    try {
      setIsLoading(true);
      await authService.deleteAccount();
      track.$.$.auth.deleteAccount();
      onDeleteFinished?.();
    } catch (err) {
      console.error(err);
      const error = UserFriendlyError.fromAny(err);
      notify.error(error);
    } finally {
      setIsLoading(false);
    }
  }, [authService, onDeleteFinished]);

  const handleDeleteAccountClick = useCallback(() => {
    handleDeleteAccount().catch(console.error);
  }, [handleDeleteAccount]);

  if (!account) {
    return null;
  }

  return (
    <>
      <ConfirmModal
        open={open && phase === 'warning'}
        onOpenChange={nextOpen => {
          if (!nextOpen) {
            onOpenChange(false);
          }
        }}
        title={t['com.affine.setting.account.delete.confirm-title']()}
        description={
          <>
            <Trans
              i18nKey="com.affine.setting.account.delete.confirm-delete-description-1"
              components={{
                1: <strong />,
              }}
              values={{
                server:
                  serverService.server.id !== 'affine-cloud'
                    ? `${serverService.server.config$.value.serverName} (${serverService.server.baseUrl})`
                    : serverService.server.config$.value.serverName,
              }}
            />
            <br />
            <br />
            <Trans
              i18nKey="com.affine.setting.account.delete.confirm-delete-description-2"
              components={{
                1: <strong />,
              }}
            />
          </>
        }
        descriptionClassName={styles.description}
        confirmText={t['Continue']()}
        confirmButtonOptions={{
          variant: 'primary',
          onClick: () => {
            setPhase('confirm');
          },
        }}
        cancelText={t['Cancel']()}
        cancelButtonOptions={{
          variant: 'primary',
        }}
        rowFooter
      />
      <ConfirmModal
        open={open && phase === 'confirm'}
        onOpenChange={nextOpen => {
          if (!nextOpen) {
            onOpenChange(false);
          }
        }}
        title={t['com.affine.setting.account.delete.email-confirm-title']()}
        description={
          <Trans
            i18nKey="com.affine.setting.account.delete.email-confirm-description"
            components={{
              1: <strong />,
            }}
            values={{
              email: account.email,
            }}
          />
        }
        descriptionClassName={styles.description}
        confirmText={t['com.affine.setting.account.delete.confirm-button']()}
        confirmButtonOptions={{
          variant: 'error',
          disabled:
            email.trim().toLowerCase() !==
              account.email?.trim().toLowerCase() || isLoading,
          loading: isLoading,
          onClick: handleDeleteAccountClick,
        }}
        cancelText={t['Cancel']()}
        cancelButtonOptions={{
          variant: 'primary',
          onClick: event => {
            event.preventDefault();
            setPhase('warning');
          },
        }}
        rowFooter
      >
        <Input
          type="email"
          placeholder={t[
            'com.affine.setting.account.delete.input-placeholder'
          ]()}
          value={email}
          onChange={setEmail}
          className={styles.inputWrapper}
        />
      </ConfirmModal>
    </>
  );
};
