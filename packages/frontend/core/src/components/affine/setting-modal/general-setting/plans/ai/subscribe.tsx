import { Button } from '@affine/component';
import { useAsyncCallback } from '@affine/core/hooks/affine-async-hooks';
import { useMutation } from '@affine/core/hooks/use-mutation';
import { popupWindow } from '@affine/core/utils';
import { createCheckoutSessionMutation } from '@affine/graphql';
import { nanoid } from 'nanoid';
import { useCallback, useEffect, useMemo, useRef } from 'react';

import { purchaseButton } from './ai-plan.css';
import type { BaseActionProps } from './types';

interface AISubscribeProps extends BaseActionProps {}

export const AISubscribe = ({
  price,
  plan,
  recurring,
  onSubscriptionUpdate,
}: AISubscribeProps) => {
  const idempotencyKey = useMemo(() => `${nanoid()}-${recurring}`, [recurring]);

  const newTabRef = useRef<Window | null>(null);

  const { isMutating, trigger } = useMutation({
    mutation: createCheckoutSessionMutation,
  });

  const onClose = useCallback(() => {
    newTabRef.current = null;
    onSubscriptionUpdate();
  }, [onSubscriptionUpdate]);

  useEffect(() => {
    return () => {
      if (newTabRef.current) {
        newTabRef.current.removeEventListener('close', onClose);
        newTabRef.current = null;
      }
    };
  }, [onClose]);

  const subscribe = useAsyncCallback(async () => {
    await trigger(
      {
        input: {
          recurring,
          idempotencyKey,
          plan,
          coupon: null,
          successCallbackLink: null,
        },
      },
      {
        onSuccess: data => {
          const newTab = popupWindow(data.createCheckoutSession);
          if (newTab) {
            newTabRef.current = newTab;
            newTab.addEventListener('close', onClose);
          }
        },
      }
    );
  }, [idempotencyKey, onClose, plan, recurring, trigger]);

  if (!price.yearlyAmount) return null;

  return (
    <Button
      loading={isMutating}
      onClick={subscribe}
      className={purchaseButton}
      type="primary"
    >
      ${(price.yearlyAmount / 100).toFixed(2)} / Year
    </Button>
  );
};
