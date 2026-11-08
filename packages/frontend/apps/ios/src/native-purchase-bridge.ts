import { getCurrentNativeUserIdentifier } from '@affine/core/mobile/utils/native-user-identifier';
import type { Server } from '@affine/core/modules/cloud/entities/server';
import { AuthService } from '@affine/core/modules/cloud/services/auth';
import { SubscriptionService } from '@affine/core/modules/cloud/services/subscription';
import {
  type AppStorePurchaseInput,
  appStorePurchaseMutation,
} from '@affine/graphql';

export const createNativePurchaseBridge = (getCurrentServer: () => Server) => ({
  async getContext() {
    const server = getCurrentServer();
    const userId = await getCurrentNativeUserIdentifier(
      server.scope.get(AuthService)
    );
    if (!userId) {
      throw new Error('Unable to verify your current account.');
    }
    return { serverBaseUrl: server.baseUrl, userId };
  },

  async purchase(input: AppStorePurchaseInput, expectedServerBaseUrl?: string) {
    const server = getCurrentServer();
    if (expectedServerBaseUrl && server.baseUrl !== expectedServerBaseUrl) {
      throw new Error(
        'Your server has changed. Switch back to report this purchase.'
      );
    }
    const { appStorePurchase } = await server.gql({
      query: appStorePurchaseMutation,
      variables: { input },
    });
    if (
      appStorePurchase.status === 'confirmed' ||
      appStorePurchase.status === 'conflict'
    ) {
      server.scope
        .get(SubscriptionService)
        .subscription.waitForRevalidation()
        .catch(error => console.error('Failed to refresh subscription', error));
    }
    return appStorePurchase;
  },
});
