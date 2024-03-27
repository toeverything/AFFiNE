import { Button } from '@affine/component';
import { useAsyncCallback } from '@affine/core/hooks/affine-async-hooks';
import { useMutation } from '@affine/core/hooks/use-mutation';
import { resumeSubscriptionMutation } from '@affine/graphql';
import { nanoid } from 'nanoid';
import { useState } from 'react';

import type { BaseActionProps } from './types';

interface AIResumeProps extends BaseActionProps {}

export const AIResume = ({ plan, onSubscriptionUpdate }: AIResumeProps) => {
  const [idempotencyKey, setIdempotencyKey] = useState(nanoid());

  const { isMutating, trigger } = useMutation({
    mutation: resumeSubscriptionMutation,
  });

  const resume = useAsyncCallback(async () => {
    await trigger(
      { idempotencyKey, plan },
      {
        onSuccess: data => {
          // refresh idempotency key
          setIdempotencyKey(nanoid());
          onSubscriptionUpdate(data.resumeSubscription);
        },
      }
    );
  }, [trigger, idempotencyKey, plan, onSubscriptionUpdate]);

  return (
    <Button loading={isMutating} onClick={resume}>
      Resume
    </Button>
  );
};
