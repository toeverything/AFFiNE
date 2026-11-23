import type { Server } from '@affine/core/modules/cloud/entities/server';
import { AuthService } from '@affine/core/modules/cloud/services/auth';
import {
  AppStorePurchaseAction,
  type AppStorePurchaseInput,
  appStorePurchaseMutation,
} from '@affine/graphql';
import { expect, test, vi } from 'vitest';

import { createNativePurchaseBridge } from './native-purchase-bridge';

function createServer(baseUrl: string, userId: string) {
  const revalidate = vi.fn().mockResolvedValue(undefined);
  const gql = vi.fn();
  const auth = { session: { account$: { value: { id: userId } } } };
  const subscriptions = { subscription: { waitForRevalidation: revalidate } };
  const server = {
    baseUrl,
    gql,
    scope: {
      get: (service: unknown) =>
        service === AuthService ? auth : subscriptions,
    },
  } as unknown as Server;
  return { server, gql, revalidate };
}

const input = {
  purchaseAction: AppStorePurchaseAction.Submit,
  expectedUserId: 'user',
  productId: 'pro.monthly',
  attemptId: 'original-attempt',
  transactionId: 'observed-transaction',
} satisfies AppStorePurchaseInput;

test('captures server and user together and rejects delivery to another server', async () => {
  const first = createServer('https://first.example', 'user');
  const second = createServer('https://second.example', 'user');
  let selected = first.server;
  const bridge = createNativePurchaseBridge(() => selected);
  const context = bridge.getContext();
  selected = second.server;
  await expect(context).resolves.toEqual({
    serverBaseUrl: first.server.baseUrl,
    userId: 'user',
  });
  await expect(bridge.purchase(input, first.server.baseUrl)).rejects.toThrow(
    'Your server has changed'
  );
  expect(first.gql).not.toHaveBeenCalled();
  expect(second.gql).not.toHaveBeenCalled();
});

test('preserves the original report and refreshes the same server after selection changes', async () => {
  const first = createServer('https://first.example', 'user');
  const second = createServer('https://second.example', 'other-user');
  let selected = first.server;
  const bridge = createNativePurchaseBridge(() => selected);
  const pending = Promise.withResolvers<{
    appStorePurchase: { status: string; attemptId: string };
  }>();
  first.gql.mockReturnValueOnce(pending.promise);
  const delivery = bridge.purchase(input, first.server.baseUrl);
  selected = second.server;
  pending.resolve({
    appStorePurchase: { status: 'confirmed', attemptId: input.attemptId },
  });
  await expect(delivery).resolves.toEqual({
    status: 'confirmed',
    attemptId: input.attemptId,
  });
  expect(first.gql).toHaveBeenCalledExactlyOnceWith({
    query: appStorePurchaseMutation,
    variables: { input },
  });
  expect(second.gql).not.toHaveBeenCalled();
  expect(first.revalidate).toHaveBeenCalledTimes(1);
  expect(second.revalidate).not.toHaveBeenCalled();

  selected = first.server;
  const error = new Error('provider unavailable');
  first.gql.mockRejectedValueOnce(error);
  await expect(bridge.purchase(input, first.server.baseUrl)).rejects.toBe(
    error
  );
});
