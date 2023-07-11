import { Button } from '@affine/component';
import { WorkspaceFallback } from '@affine/component/workspace';
import { acceptInviteByWorkspaceIdMutation } from '@affine/graphql';
import { useMutation } from '@affine/workspace/affine/gql';
import { useRouter } from 'next/router';
import { Suspense, useCallback } from 'react';

function AcceptPageImpl() {
  const router = useRouter();
  const { trigger } = useMutation({
    mutation: acceptInviteByWorkspaceIdMutation,
  });
  const workspaceId = router.query.id;
  const onClickAccept = useCallback(async () => {
    if (typeof workspaceId !== 'string') {
      throw new Error('workspaceId is not a string');
    }
    await trigger({
      workspaceId,
    });
  }, [trigger, workspaceId]);

  if (router.isReady && typeof workspaceId !== 'string') {
    router.push('404').catch(console.error);
  }

  if (!router.isReady) {
    return <WorkspaceFallback />;
  }

  return (
    <div>
      <Button onClick={onClickAccept}>Accept Invitation</Button>
    </div>
  );
}

export default function AcceptPage() {
  return (
    <Suspense fallback={<WorkspaceFallback />}>
      <AcceptPageImpl />
    </Suspense>
  );
}
