import { notify } from '@affine/component';
import {
  AcceptInvitePage,
  ExpiredPage,
  JoinFailedPage,
  RequestToJoinPage,
  SentRequestPage,
} from '@affine/component/member-components';
import { useAsyncCallback } from '@affine/core/components/hooks/affine-async-hooks';
import { WorkspacesService } from '@affine/core/modules/workspace';
import { UserFriendlyError } from '@affine/error';
import { WorkspaceMemberStatus } from '@affine/graphql';
import { useLiveData, useService } from '@toeverything/infra';
import { useCallback, useEffect, useState } from 'react';
import { Navigate, useParams } from 'react-router-dom';

import {
  RouteLogic,
  useNavigateHelper,
} from '../../../components/hooks/use-navigate-helper';
import { AuthService, InvitationService } from '../../../modules/cloud';

const AcceptInvite = ({ inviteId: targetInviteId }: { inviteId: string }) => {
  const { jumpToPage } = useNavigateHelper();

  const invitationService = useService(InvitationService);
  const workspacesService = useService(WorkspacesService);
  const authService = useService(AuthService);
  const user = useLiveData(authService.session.account$);
  const error = useLiveData(invitationService.error$);
  const inviteId = useLiveData(invitationService.inviteId$);
  const inviteInfo = useLiveData(invitationService.inviteInfo$);
  const loading = useLiveData(invitationService.loading$);
  const workspaces = useLiveData(workspacesService.list.workspaces$);
  const navigateHelper = useNavigateHelper();
  const [accepted, setAccepted] = useState(false);
  const [requestToJoinLoading, setRequestToJoinLoading] = useState(false);
  const [acceptError, setAcceptError] = useState<UserFriendlyError | null>(
    null
  );

  const openWorkspace = useAsyncCallback(async () => {
    if (!inviteInfo?.workspace.id) {
      return;
    }
    await workspacesService.list.waitForRevalidation();
    jumpToPage(inviteInfo.workspace.id, 'all', RouteLogic.REPLACE);
  }, [inviteInfo, workspacesService, jumpToPage]);

  const onOpenAffine = useCallback(() => {
    navigateHelper.jumpToIndex();
  }, [navigateHelper]);

  useEffect(() => {
    // if workspace already exists, open it
    if (
      !accepted &&
      inviteInfo?.workspace.id &&
      workspaces.some(w => w.id === inviteInfo.workspace.id)
    ) {
      return openWorkspace();
    }
  }, [accepted, inviteInfo?.workspace.id, openWorkspace, workspaces]);

  const requestToJoin = useAsyncCallback(async () => {
    setRequestToJoinLoading(true);
    await invitationService
      .acceptInvite(targetInviteId)
      .then(() => {
        invitationService.getInviteInfo({ inviteId: targetInviteId });
        setAccepted(true);
      })
      .catch(error => {
        const err = UserFriendlyError.fromAny(error);
        if (err.is('ALREADY_IN_SPACE')) {
          return openWorkspace();
        }
        setAcceptError(err);
        notify.error(err);
      });
    setRequestToJoinLoading(false);
  }, [invitationService, openWorkspace, targetInviteId]);

  const onSignOut = useAsyncCallback(async () => {
    await authService.signOut();
    navigateHelper.jumpToSignIn();
  }, [authService, navigateHelper]);

  if ((loading && !requestToJoinLoading) || inviteId !== targetInviteId) {
    return null;
  }

  if (!inviteInfo && !loading) {
    return <ExpiredPage onOpenAffine={onOpenAffine} />;
  }

  if (error || acceptError) {
    return (
      <JoinFailedPage inviteInfo={inviteInfo} error={error || acceptError} />
    );
  }

  // for email invite
  if (accepted && inviteInfo?.status === WorkspaceMemberStatus.Accepted) {
    return (
      <AcceptInvitePage
        onOpenWorkspace={openWorkspace}
        inviteInfo={inviteInfo}
      />
    );
  }

  if (
    inviteInfo?.status === WorkspaceMemberStatus.UnderReview ||
    inviteInfo?.status === WorkspaceMemberStatus.NeedMoreSeatAndReview ||
    inviteInfo?.status === WorkspaceMemberStatus.NeedMoreSeat
  ) {
    return <SentRequestPage user={user} inviteInfo={inviteInfo} />;
  }

  return (
    <RequestToJoinPage
      user={user}
      inviteInfo={inviteInfo}
      requestToJoin={requestToJoin}
      onSignOut={onSignOut}
    />
  );
};

/**
 * /invite/:inviteId page
 *
 * only for web
 */
export const Component = () => {
  const authService = useService(AuthService);
  const invitationService = useService(InvitationService);
  const isRevalidating = useLiveData(authService.session.isRevalidating$);
  const loginStatus = useLiveData(authService.session.status$);
  const params = useParams<{ inviteId: string }>();

  useEffect(() => {
    authService.session.revalidate();
    if (params.inviteId) {
      invitationService.getInviteInfo({ inviteId: params.inviteId });
    }
  }, [authService, invitationService, params.inviteId]);

  const { jumpToSignIn } = useNavigateHelper();

  useEffect(() => {
    if (loginStatus === 'unauthenticated' && !isRevalidating) {
      // We can not pass function to navigate state, so we need to save it in atom
      jumpToSignIn(`/invite/${params.inviteId}`, RouteLogic.REPLACE);
    }
  }, [isRevalidating, jumpToSignIn, loginStatus, params.inviteId]);

  if (!params.inviteId) {
    return <Navigate to="/expired" />;
  }

  if (loginStatus === 'authenticated') {
    return <AcceptInvite inviteId={params.inviteId} />;
  }

  return null;
};
