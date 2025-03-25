import {
  AcceptInvitePage,
  ExpiredPage,
  JoinFailedPage,
} from '@affine/component/member-components';
import { useAsyncCallback } from '@affine/core/components/hooks/affine-async-hooks';
import { WorkspacesService } from '@affine/core/modules/workspace';
import { UserFriendlyError } from '@affine/error';
import { useLiveData, useService } from '@toeverything/infra';
import { useCallback, useEffect } from 'react';
import { Navigate, useParams } from 'react-router-dom';

import {
  RouteLogic,
  useNavigateHelper,
} from '../../../components/hooks/use-navigate-helper';
import { AcceptInviteService, AuthService } from '../../../modules/cloud';

const AcceptInvite = ({ inviteId: targetInviteId }: { inviteId: string }) => {
  const { jumpToPage } = useNavigateHelper();
  const acceptInviteService = useService(AcceptInviteService);
  const workspacesService = useService(WorkspacesService);
  const error = useLiveData(acceptInviteService.error$);
  const inviteId = useLiveData(acceptInviteService.inviteId$);
  const inviteInfo = useLiveData(acceptInviteService.inviteInfo$);
  const accepted = useLiveData(acceptInviteService.accepted$);
  const loading = useLiveData(acceptInviteService.loading$);
  const navigateHelper = useNavigateHelper();

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
    acceptInviteService.acceptInvite({
      inviteId: targetInviteId,
    });
  }, [acceptInviteService, targetInviteId]);

  useEffect(() => {
    if (error && inviteId === targetInviteId) {
      const err = UserFriendlyError.fromAny(error);
      if (err.is('ALREADY_IN_SPACE')) {
        return openWorkspace();
      }
    }
  }, [error, inviteId, navigateHelper, openWorkspace, targetInviteId]);

  if (loading || inviteId !== targetInviteId) {
    return null;
  }

  if (!inviteInfo) {
    // if invite is expired
    return <ExpiredPage onOpenAffine={onOpenAffine} />;
  }

  if (error) {
    return <JoinFailedPage inviteInfo={inviteInfo} error={error} />;
  }

  if (accepted) {
    return (
      <AcceptInvitePage
        inviteInfo={inviteInfo}
        onOpenWorkspace={openWorkspace}
      />
    );
  } else {
    // invite is expired
    return <ExpiredPage onOpenAffine={onOpenAffine} />;
  }
};

/**
 * /invite/:inviteId page
 *
 * only for web
 */
export const Component = () => {
  const authService = useService(AuthService);
  const isRevalidating = useLiveData(authService.session.isRevalidating$);
  const loginStatus = useLiveData(authService.session.status$);
  const params = useParams<{ inviteId: string }>();

  useEffect(() => {
    authService.session.revalidate();
  }, [authService]);

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
