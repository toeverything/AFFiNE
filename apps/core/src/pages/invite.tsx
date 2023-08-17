import { AcceptInvitePage } from '@affine/component/member-components';
import { isDesktop } from '@affine/env/constant';
import {
  acceptInviteByInviteIdMutation,
  acceptInviteByWorkspaceIdMutation,
} from '@affine/graphql';
import { useMutation } from '@affine/workspace/affine/gql';
import type { ReactElement } from 'react';
import { useCallback, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';

import { RouteLogic, useNavigateHelper } from '../hooks/use-navigate-helper';
// valid URL: /invite?wsId=xxx&inviteId=xxx
// valid URL: /invite?wsId=xxx
export const Component = (): ReactElement => {
  const [searchParams] = useSearchParams();
  const workspaceId = searchParams.get('id');
  const inviteId = searchParams.get('invite');
  const { jumpToIndex } = useNavigateHelper();

  const { trigger: triggerByWorkspaceId } = useMutation({
    mutation: acceptInviteByWorkspaceIdMutation,
  });
  const { trigger: triggerByInviteId } = useMutation({
    mutation: acceptInviteByInviteIdMutation,
  });

  const onOpenAffine = useCallback(() => {
    if (isDesktop) {
      window.apis.ui.handleFinishLogin();
    } else {
      jumpToIndex(RouteLogic.REPLACE);
    }
  }, [jumpToIndex]);

  useEffect(() => {
    // User accepts the invitation when enters the page
    if (inviteId && workspaceId) {
      triggerByInviteId({
        workspaceId,
        inviteId,
      }).catch(console.error);
    } else if (workspaceId) {
      triggerByWorkspaceId({
        workspaceId,
      }).catch(console.error);
    }
  }, [inviteId, triggerByWorkspaceId, triggerByInviteId, workspaceId]);

  return <AcceptInvitePage onOpenAffine={onOpenAffine} />;
};
