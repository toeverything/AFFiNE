import { AcceptInvitePage } from '@affine/component/member-components';
import type { GetInviteInfoQuery } from '@affine/graphql';
import {
  acceptInviteByInviteIdMutation,
  fetcher,
  getInviteInfoQuery,
} from '@affine/graphql';
import { useLiveData, useService } from '@toeverything/infra';
import { useCallback, useEffect } from 'react';
import type { LoaderFunction } from 'react-router-dom';
import { redirect, useLoaderData } from 'react-router-dom';

import {
  RouteLogic,
  useNavigateHelper,
} from '../../../components/hooks/use-navigate-helper';
import { AuthService } from '../../../modules/cloud';

/**
 * /invite/:inviteId page
 *
 * only for web
 */
export const loader: LoaderFunction = async args => {
  const inviteId = args.params.inviteId || '';
  const res = await fetcher({
    query: getInviteInfoQuery,
    variables: {
      inviteId,
    },
  }).catch(console.error);

  // If the inviteId is invalid, redirect to 404 page
  if (!res || !res?.getInviteInfo) {
    return redirect('/404');
  }

  // No mater sign in or not, we need to accept the invite
  await fetcher({
    query: acceptInviteByInviteIdMutation,
    variables: {
      workspaceId: res.getInviteInfo.workspace.id,
      inviteId,
      sendAcceptMail: true,
    },
  }).catch(console.error);

  return {
    inviteId,
    inviteInfo: res.getInviteInfo,
  };
};

export const Component = () => {
  const authService = useService(AuthService);
  const isRevalidating = useLiveData(authService.session.isRevalidating$);
  const loginStatus = useLiveData(authService.session.status$);

  useEffect(() => {
    authService.session.revalidate();
  }, [authService]);

  const { jumpToSignIn } = useNavigateHelper();
  const { jumpToPage } = useNavigateHelper();

  const { inviteInfo } = useLoaderData() as {
    inviteId: string;
    inviteInfo: GetInviteInfoQuery['getInviteInfo'];
  };

  const openWorkspace = useCallback(() => {
    jumpToPage(inviteInfo.workspace.id, 'all', RouteLogic.REPLACE);
  }, [inviteInfo.workspace.id, jumpToPage]);

  useEffect(() => {
    if (loginStatus === 'unauthenticated' && !isRevalidating) {
      // We can not pass function to navigate state, so we need to save it in atom
      jumpToSignIn(
        `/workspace/${inviteInfo.workspace.id}/all`,
        RouteLogic.REPLACE
      );
    }
  }, [
    inviteInfo.workspace.id,
    isRevalidating,
    jumpToSignIn,
    loginStatus,
    openWorkspace,
  ]);

  if (loginStatus === 'authenticated') {
    return (
      <AcceptInvitePage
        inviteInfo={inviteInfo}
        onOpenWorkspace={openWorkspace}
      />
    );
  }

  return null;
};
