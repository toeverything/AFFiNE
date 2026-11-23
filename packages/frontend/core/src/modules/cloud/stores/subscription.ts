import type {
  CreateCheckoutSessionInput,
  SubscriptionRecurring,
} from '@affine/graphql';
import {
  cancelSubscriptionMutation,
  checkoutAttemptQuery,
  createCheckoutSessionMutation,
  expireCheckoutMutation,
  getWorkspaceSubscriptionQuery,
  pricesQuery,
  resumeSubscriptionMutation,
  SubscriptionPlan,
  subscriptionQuery,
  updateSubscriptionMutation,
} from '@affine/graphql';
import { Store } from '@toeverything/infra';

import type { GlobalCache } from '../../storage';
import type { UrlService } from '../../url';
import type { SubscriptionBilling } from '../entities/subscription';
import type { SubscriptionType } from '../entities/workspace-subscription';
import type { GraphQLService } from '../services/graphql';
import type { ServerService } from '../services/server';
const SUBSCRIPTION_CACHE_KEY = 'subscription:';
const SUBSCRIPTION_BILLING_CACHE_KEY = 'subscription-billing:v1:';

const getDefaultSubscriptionSuccessCallbackLink = (
  baseUrl: string,
  plan?: SubscriptionPlan | null,
  scheme?: string
) => {
  const path =
    plan === SubscriptionPlan.Team
      ? '/upgrade-success/team'
      : plan === SubscriptionPlan.AI
        ? '/ai-upgrade-success'
        : '/upgrade-success';
  const urlString = baseUrl + path;
  const url = new URL(urlString);
  if (scheme) {
    url.searchParams.set('scheme', scheme);
  }
  return url.toString();
};

export class SubscriptionStore extends Store {
  constructor(
    private readonly gqlService: GraphQLService,
    private readonly globalCache: GlobalCache,
    private readonly urlService: UrlService,
    private readonly serverService: ServerService
  ) {
    super();
  }

  async fetchSubscriptionBilling(abortSignal?: AbortSignal) {
    const data = await this.gqlService.gql({
      query: subscriptionQuery,
      context: {
        signal: abortSignal,
      },
    });

    return data.currentUser
      ? {
          userId: data.currentUser.id,
          billing: data.currentUser.subscriptionBilling,
        }
      : null;
  }

  async fetchWorkspaceSubscriptions(
    workspaceId: string,
    abortSignal?: AbortSignal
  ) {
    const data = await this.gqlService.gql({
      query: getWorkspaceSubscriptionQuery,
      variables: {
        workspaceId,
      },
      context: {
        signal: abortSignal,
      },
    });

    if (!data.workspace) {
      throw new Error('No workspace');
    }

    return {
      workspaceId: data.workspace.subscription?.id,
      subscription: data.workspace.subscription,
    };
  }

  async mutateResumeSubscription(
    idempotencyKey: string,
    plan?: SubscriptionPlan,
    abortSignal?: AbortSignal,
    workspaceId?: string
  ) {
    const data = await this.gqlService.gql({
      query: resumeSubscriptionMutation,
      variables: {
        plan,
        workspaceId,
      },
      context: {
        signal: abortSignal,
        headers: {
          'Idempotency-Key': idempotencyKey,
        },
      },
    });
    return data.resumeSubscription;
  }

  async mutateCancelSubscription(
    idempotencyKey: string,
    plan?: SubscriptionPlan,
    abortSignal?: AbortSignal,
    workspaceId?: string
  ) {
    const data = await this.gqlService.gql({
      query: cancelSubscriptionMutation,
      variables: {
        plan,
        workspaceId,
      },
      context: {
        signal: abortSignal,
        headers: {
          'Idempotency-Key': idempotencyKey,
        },
      },
    });
    return data.cancelSubscription;
  }

  getCachedSubscriptionBilling(userId: string) {
    return this.globalCache.get<SubscriptionBilling>(
      this.billingCacheKey(userId)
    );
  }

  setCachedSubscriptionBilling(userId: string, billing: SubscriptionBilling) {
    return this.globalCache.set(this.billingCacheKey(userId), billing);
  }

  private billingCacheKey(userId: string) {
    return (
      SUBSCRIPTION_BILLING_CACHE_KEY +
      JSON.stringify([this.serverService.server.id, userId])
    );
  }

  getCachedWorkspaceSubscription(workspaceId: string) {
    return this.globalCache.get<SubscriptionType>(
      SUBSCRIPTION_CACHE_KEY + workspaceId
    );
  }

  setCachedWorkspaceSubscription(
    workspaceId: string,
    subscription: SubscriptionType
  ) {
    return this.globalCache.set(
      SUBSCRIPTION_CACHE_KEY + workspaceId,
      subscription
    );
  }

  setSubscriptionRecurring(
    idempotencyKey: string,
    recurring: SubscriptionRecurring,
    plan?: SubscriptionPlan,
    workspaceId?: string
  ) {
    return this.gqlService.gql({
      query: updateSubscriptionMutation,
      variables: {
        plan,
        recurring,
        workspaceId,
      },
      context: {
        headers: {
          'Idempotency-Key': idempotencyKey,
        },
      },
    });
  }

  async createCheckoutSession(input: CreateCheckoutSessionInput) {
    const data = await this.gqlService.gql({
      query: createCheckoutSessionMutation,
      variables: {
        input: {
          ...input,
          successCallbackLink:
            input.successCallbackLink ||
            getDefaultSubscriptionSuccessCallbackLink(
              this.serverService.server.baseUrl,
              input.plan,
              this.urlService.getClientScheme()
            ),
        },
      },
    });
    return data.createCheckoutSession;
  }

  async checkoutAttempt(plan: SubscriptionPlan) {
    const data = await this.gqlService.gql({
      query: checkoutAttemptQuery,
      variables: { plan },
    });
    return data.checkoutAttempt;
  }

  async expireCheckout(plan: SubscriptionPlan, attemptId: string) {
    const data = await this.gqlService.gql({
      query: expireCheckoutMutation,
      variables: { plan, attemptId },
    });
    return data.expireCheckout;
  }

  async fetchSubscriptionPrices(abortSignal?: AbortSignal) {
    const data = await this.gqlService.gql({
      query: pricesQuery,
      context: {
        signal: abortSignal,
      },
    });

    return data.prices;
  }
}
