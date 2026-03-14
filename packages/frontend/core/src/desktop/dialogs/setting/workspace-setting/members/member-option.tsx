import { MenuItem, notify, useConfirmModal } from '@affine/component';
import {
  type Member,
  WorkspaceMembersService,
  WorkspacePermissionService,
} from '@affine/core/modules/permissions';
import { Permission, WorkspaceMemberStatus } from '@affine/graphql';
import { useI18n } from '@affine/i18n';
import { useLiveData, useService } from '@toeverything/infra';
import { useCallback, useEffect, useMemo, useState } from 'react';

export const MemberOptions = ({
  member,
  isOwner,
  isAdmin,
  openAssignModal,
  goToTeamBilling,
}: {
  member: Member;
  isOwner: boolean;
  isAdmin: boolean;
  openAssignModal: () => void;
  goToTeamBilling: () => void;
}) => {
  const t = useI18n();
  const membersService = useService(WorkspaceMembersService);
  const permission = useService(WorkspacePermissionService).permission;
  const isTeam = useLiveData(permission.isTeam$);
  const { openConfirmModal } = useConfirmModal();
  useLiveData(membersService.resendMemberInviteBackoff$);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    setNow(Date.now());
    const timer = setInterval(() => {
      setNow(Date.now());
    }, 1000);

    return () => {
      clearInterval(timer);
    };
  }, []);

  const resendRetryAfterMs = membersService.getMemberResendInviteRetryAfterMs(
    member.email ?? undefined,
    now
  );
  const resendRetryAfterSeconds = Math.ceil(resendRetryAfterMs / 1000);

  const openRemoveConfirmModal = useCallback(
    (successNotify: { title: string; message: string }) => {
      openConfirmModal({
        title: t['com.affine.payment.member.team.remove.confirm.title'](),
        description:
          t['com.affine.payment.member.team.remove.confirm.description'](),
        confirmText:
          t['com.affine.payment.member.team.remove.confirm.confirm-button'](),
        cancelText: t['com.affine.payment.member.team.remove.confirm.cancel'](),
        confirmButtonOptions: {
          variant: 'error',
        },
        onConfirm: () =>
          membersService
            .revokeMember(member.id)
            .then(result => {
              if (result) {
                notify.success({
                  title: successNotify.title,
                  message: successNotify.message,
                });
                membersService.members.revalidate();
              }
            })
            .catch(error => {
              notify.error({
                title: 'Operation failed',
                message: error.message,
              });
            }),
      });
    },
    [member, membersService, openConfirmModal, t]
  );

  const handleAssignOwner = useCallback(() => {
    openAssignModal();
  }, [openAssignModal]);

  const handleRevoke = useCallback(() => {
    openRemoveConfirmModal({
      title: t['com.affine.payment.member.team.revoke.notify.title'](),
      message: t['com.affine.payment.member.team.revoke.notify.message']({
        name: member.name || member.email || member.id,
      }),
    });
  }, [openRemoveConfirmModal, member, t]);

  const handleResendInvite = useCallback(() => {
    const inviteeName = member.name || member.email || member.id;
    if (!member.email) {
      notify.error({
        title: 'Operation failed',
        message: 'No email found for this member',
      });
      return;
    }

    if (resendRetryAfterMs > 0) {
      notify({
        title:
          t[
            'com.affine.payment.member.team.resendInvite.cooldown.notify.title'
          ](),
        message: t.t(
          'com.affine.payment.member.team.resendInvite.cooldown.notify.message',
          {
            name: inviteeName,
            second: resendRetryAfterSeconds.toString(),
          }
        ),
      });
      return;
    }

    membersService
      .resendMemberInvite(member.inviteId, member.email)
      .then(result => {
        if (result.allowed) {
          notify.success({
            title:
              t['com.affine.payment.member.team.resendInvite.notify.title'](),
            message: t.t(
              'com.affine.payment.member.team.resendInvite.notify.message',
              {
                name: inviteeName,
              }
            ),
          });
          membersService.members.revalidate();
        } else {
          notify({
            title:
              t[
                'com.affine.payment.member.team.resendInvite.cooldown.notify.title'
              ](),
            message: t.t(
              'com.affine.payment.member.team.resendInvite.cooldown.notify.message',
              {
                name: inviteeName,
                second: Math.ceil(result.retryAfterMs / 1000).toString(),
              }
            ),
          });
        }
      })
      .catch(error => {
        notify.error({
          title: 'Operation failed',
          message: error.message,
        });
      })
      .finally(() => {
        setNow(Date.now());
      });
  }, [member, membersService, resendRetryAfterMs, resendRetryAfterSeconds, t]);

  const handleApprove = useCallback(() => {
    membersService
      .approveMember(member.id)
      .then(result => {
        if (result) {
          notify.success({
            title: t['com.affine.payment.member.team.approve.notify.title'](),
            message: t['com.affine.payment.member.team.approve.notify.message'](
              {
                name: member.name || member.email || member.id,
              }
            ),
          });
          membersService.members.revalidate();
        }
      })
      .catch(error => {
        notify.error({
          title: 'Operation failed',
          message: error.message,
        });
      });
  }, [member, membersService, t]);

  const handleDecline = useCallback(() => {
    openRemoveConfirmModal({
      title: t['com.affine.payment.member.team.decline.notify.title'](),
      message: t['com.affine.payment.member.team.decline.notify.message']({
        name: member.name || member.email || member.id,
      }),
    });
  }, [member, openRemoveConfirmModal, t]);

  const handleRemove = useCallback(() => {
    openRemoveConfirmModal({
      title: t['com.affine.payment.member.team.remove.notify.title'](),
      message: t['com.affine.payment.member.team.remove.notify.message']({
        name: member.name || member.email || member.id,
      }),
    });
  }, [member, openRemoveConfirmModal, t]);

  const handleChangeToAdmin = useCallback(() => {
    membersService
      .adjustMemberPermission(member.id, Permission.Admin)
      .then(result => {
        if (result) {
          notify.success({
            title: t['com.affine.payment.member.team.change.notify.title'](),
            message: t[
              'com.affine.payment.member.team.change.admin.notify.message'
            ]({
              name: member.name || member.email || member.id,
            }),
          });
          membersService.members.revalidate();
        }
      })
      .catch(error => {
        notify.error({
          title: 'Operation failed',
          message: error.message,
        });
      });
  }, [member, membersService, t]);

  const handleChangeToCollaborator = useCallback(() => {
    membersService
      .adjustMemberPermission(member.id, Permission.Collaborator)
      .then(result => {
        if (result) {
          notify.success({
            title: t['com.affine.payment.member.team.change.notify.title'](),
            message: t[
              'com.affine.payment.member.team.change.collaborator.notify.message'
            ]({
              name: member.name || member.email || member.id,
            }),
          });
          membersService.members.revalidate();
        }
      })
      .catch(error => {
        notify.error({
          title: 'Operation failed',
          message: error.message,
        });
      });
  }, [member, membersService, t]);

  const handleRetryPayment = useCallback(() => {
    openConfirmModal({
      title: t['com.affine.payment.member.team.retry-payment.title'](),
      description:
        t[
          `com.affine.payment.member.team.retry-payment.${isOwner ? 'owner' : 'admin'}.description`
        ](),
      confirmText:
        t[
          isOwner
            ? 'com.affine.payment.member.team.retry-payment.update-payment'
            : 'Got it'
        ](),
      confirmButtonOptions: {
        variant: 'primary',
      },
      onConfirm: isOwner ? goToTeamBilling : undefined,
      cancelText: t['Cancel'](),
      cancelButtonOptions: {
        style: {
          visibility: isOwner ? 'visible' : 'hidden',
        },
      },
    });
  }, [goToTeamBilling, isOwner, openConfirmModal, t]);

  const operationButtonInfo = useMemo(() => {
    return [
      {
        label: t['com.affine.payment.member.team.retry-payment'](),
        onClick: handleRetryPayment,
        show: member.status === WorkspaceMemberStatus.NeedMoreSeat,
      },
      {
        label: t['com.affine.payment.member.team.approve'](),
        onClick: handleApprove,
        show: member.status === WorkspaceMemberStatus.UnderReview,
      },
      {
        label: t['com.affine.payment.member.team.approve'](),
        onClick: handleRetryPayment,
        show: member.status === WorkspaceMemberStatus.NeedMoreSeatAndReview,
      },
      {
        label: t['com.affine.payment.member.team.decline'](),
        onClick: handleDecline,
        show:
          (isAdmin || isOwner) &&
          (member.status === WorkspaceMemberStatus.UnderReview ||
            member.status === WorkspaceMemberStatus.NeedMoreSeatAndReview),
      },
      {
        label: t['com.affine.payment.member.team.revoke'](),
        onClick: handleRevoke,
        show:
          (isAdmin || isOwner) &&
          [
            WorkspaceMemberStatus.NeedMoreSeat,
            WorkspaceMemberStatus.NeedMoreSeatAndReview,
            WorkspaceMemberStatus.Pending,
          ].includes(member.status),
      },
      {
        label:
          resendRetryAfterSeconds > 0
            ? t.t('com.affine.payment.member.team.resendInvite.hint', {
                second: resendRetryAfterSeconds.toString(),
              })
            : t['com.affine.payment.member.team.resendInvite'](),
        onClick: handleResendInvite,
        disabled: resendRetryAfterSeconds > 0,
        show:
          (isAdmin || isOwner) &&
          [WorkspaceMemberStatus.Pending].includes(member.status),
      },
      {
        label: t['com.affine.payment.member.team.remove'](),
        onClick: handleRemove,
        show:
          (isOwner && member.status === WorkspaceMemberStatus.Accepted) ||
          (isAdmin &&
            member.status === WorkspaceMemberStatus.Accepted &&
            member.permission !== Permission.Owner &&
            member.permission !== Permission.Admin),
      },
      {
        label: t['com.affine.payment.member.team.change.collaborator'](),
        onClick: handleChangeToCollaborator,
        show:
          isOwner &&
          member.status === WorkspaceMemberStatus.Accepted &&
          member.permission === Permission.Admin,
      },
      {
        label: t['com.affine.payment.member.team.change.admin'](),
        onClick: handleChangeToAdmin,
        show:
          isTeam &&
          isOwner &&
          member.permission !== Permission.Owner &&
          member.permission !== Permission.Admin &&
          member.status === WorkspaceMemberStatus.Accepted,
      },
      {
        label: t['com.affine.payment.member.team.assign'](),
        onClick: handleAssignOwner,
        show: isOwner && member.status === WorkspaceMemberStatus.Accepted,
      },
    ];
  }, [
    handleApprove,
    handleAssignOwner,
    handleChangeToAdmin,
    handleChangeToCollaborator,
    handleDecline,
    handleRemove,
    handleResendInvite,
    handleRetryPayment,
    handleRevoke,
    isAdmin,
    isOwner,
    isTeam,
    member.permission,
    member.status,
    resendRetryAfterSeconds,
    t,
  ]);

  return (
    <>
      {operationButtonInfo.map(item =>
        item.show ? (
          <MenuItem
            key={item.label}
            onSelect={item.onClick}
            disabled={item.disabled}
          >
            {item.label}
          </MenuItem>
        ) : null
      )}
    </>
  );
};
