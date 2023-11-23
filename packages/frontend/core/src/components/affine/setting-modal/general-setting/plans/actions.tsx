import type { SubscriptionMutator } from '@affine/core/hooks/use-subscription';
import {
  cancelSubscriptionMutation,
  resumeSubscriptionMutation,
} from '@affine/graphql';
import { useMutation } from '@affine/workspace/affine/gql';
import { useAsyncCallback } from '@toeverything/hooks/affine-async-hooks';
import { nanoid } from 'nanoid';
import type { PropsWithChildren } from 'react';
import { useState } from 'react';

import { ConfirmLoadingModal, DowngradeModal } from './modals';

/**
 * Cancel action with modal & request
 * @param param0
 * @returns
 */
export const CancelAction = ({
  children,
  open,
  onOpenChange,
  onSubscriptionUpdate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubscriptionUpdate: SubscriptionMutator;
} & PropsWithChildren) => {
  const [idempotencyKey, setIdempotencyKey] = useState(nanoid());
  const { trigger, isMutating } = useMutation({
    mutation: cancelSubscriptionMutation,
  });

  const downgrade = useAsyncCallback(async () => {
    await trigger(
      { idempotencyKey },
      {
        onSuccess: data => {
          // refresh idempotency key
          setIdempotencyKey(nanoid());
          onSubscriptionUpdate(data.cancelSubscription);
          onOpenChange(false);
        },
      }
    );
  }, [trigger, idempotencyKey, onSubscriptionUpdate, onOpenChange]);

  return (
    <>
      {children}
      <DowngradeModal
        open={open}
        onCancel={downgrade}
        onOpenChange={onOpenChange}
        loading={isMutating}
      />
    </>
  );
};

/**
 * Resume payment action with modal & request
 * @param param0
 * @returns
 */
export const ResumeAction = ({
  children,
  open,
  onOpenChange,
  onSubscriptionUpdate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubscriptionUpdate: SubscriptionMutator;
} & PropsWithChildren) => {
  // allow replay request on network error until component unmount or success
  const [idempotencyKey, setIdempotencyKey] = useState(nanoid());
  const { isMutating, trigger } = useMutation({
    mutation: resumeSubscriptionMutation,
  });

  const resume = useAsyncCallback(async () => {
    await trigger(
      { idempotencyKey },
      {
        onSuccess: data => {
          // refresh idempotency key
          setIdempotencyKey(nanoid());
          onSubscriptionUpdate(data.resumeSubscription);
          onOpenChange(false);
        },
      }
    );
  }, [trigger, idempotencyKey, onSubscriptionUpdate, onOpenChange]);

  return (
    <>
      {children}
      <ConfirmLoadingModal
        type={'resume'}
        open={open}
        onConfirm={resume}
        onOpenChange={onOpenChange}
        loading={isMutating}
      />
    </>
  );
};
