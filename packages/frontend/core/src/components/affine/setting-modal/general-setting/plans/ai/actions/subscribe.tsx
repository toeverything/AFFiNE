import { Button, type ButtonProps } from '@affine/component';
import { useAsyncCallback } from '@affine/core/hooks/affine-async-hooks';
import { useMutation } from '@affine/core/hooks/use-mutation';
import { popupWindow } from '@affine/core/utils';
import {
  createCheckoutSessionMutation,
  SubscriptionPlan,
  SubscriptionRecurring,
} from '@affine/graphql';
import { assertExists } from '@blocksuite/global/utils';
import { nanoid } from 'nanoid';
import { useCallback, useEffect, useMemo, useRef } from 'react';

import type { BaseActionProps } from '../types';
import { useAffineAIPrice } from '../use-affine-ai-price';

export interface AISubscribeProps extends BaseActionProps, ButtonProps {}

export const AISubscribe = ({
  price,
  recurring = SubscriptionRecurring.Yearly,
  onSubscriptionUpdate,
  ...btnProps
}: AISubscribeProps) => {
  assertExists(price);
  const idempotencyKey = useMemo(() => `${nanoid()}-${recurring}`, [recurring]);
  const { priceReadable, priceFrequency } = useAffineAIPrice(price);

  const newTabRef = useRef<Window | null>(null);

  const { isMutating, trigger } = useMutation({
    mutation: createCheckoutSessionMutation,
  });

  const onClose = useCallback(() => {
    newTabRef.current = null;
    onSubscriptionUpdate?.();
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
          plan: SubscriptionPlan.AI,
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
  }, [idempotencyKey, onClose, recurring, trigger]);

  if (!price.yearlyAmount) return null;

  return (
    <Button
      loading={isMutating}
      onClick={subscribe}
      type="primary"
      {...btnProps}
    >
      {btnProps.children ?? `${priceReadable} / ${priceFrequency}`}
    </Button>
  );
};
