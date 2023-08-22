import { AcceptInvitePage } from '@affine/component/member-components';
import {
  acceptInviteByInviteIdMutation,
  type GetInviteInfoQuery,
  getInviteInfoQuery,
} from '@affine/graphql';
import { fetcher, useMutation } from '@affine/workspace/affine/gql';
import { useCallback, useEffect } from 'react';
import { type LoaderFunction, redirect, useLoaderData } from 'react-router-dom';

import { useCurrenLoginStatus } from '../hooks/affine/use-curren-login-status';
import { RouteLogic, useNavigateHelper } from '../hooks/use-navigate-helper';

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

  return {
    inviteId,
    inviteInfo: res.getInviteInfo,
  };
};

export const Component = () => {
  const loginStatus = useCurrenLoginStatus();
  const { jumpToExpired } = useNavigateHelper();
  const { inviteId, inviteInfo } = useLoaderData() as {
    inviteId: string;
    inviteInfo: GetInviteInfoQuery['getInviteInfo'];
  };

  const { trigger: triggerByInviteId } = useMutation({
    mutation: acceptInviteByInviteIdMutation,
  });

  const acceptInvite = useCallback(() => {
    triggerByInviteId({
      workspaceId: inviteInfo.workspace.id,
      inviteId,
    }).catch(console.error);
  }, [inviteId, inviteInfo.workspace.id, triggerByInviteId]);

  if (loginStatus === 'unauthenticated') {
    // TODO: If user has not signed in, redirect to sign in page
    // TODO: In sign page, we need `afterSignInCallback` event to accept the invite and `callbackUrl` to redirect to the workspace
    jumpToExpired(RouteLogic.REPLACE);
  }

  if (loginStatus === 'authenticated') {
    return <InvitePage acceptInvite={acceptInvite} inviteInfo={inviteInfo} />;
  }
  return null;
};

export const InvitePage = ({
  acceptInvite,
  inviteInfo,
}: {
  acceptInvite: () => void;
  inviteInfo: GetInviteInfoQuery['getInviteInfo'];
}) => {
  const { jumpToWorkspace } = useNavigateHelper();

  const onOpenWorkspace = useCallback(() => {
    jumpToWorkspace(inviteInfo.workspace.id, RouteLogic.REPLACE);
  }, [inviteInfo.workspace.id, jumpToWorkspace]);

  useEffect(() => {
    acceptInvite();
  }, [acceptInvite]);

  return (
    <AcceptInvitePage
      onOpenWorkspace={onOpenWorkspace}
      inviteInfo={inviteInfo}
    />
  );
};
