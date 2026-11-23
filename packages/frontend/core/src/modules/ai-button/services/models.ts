import { getCopilotRouteOptionsQuery } from '@affine/graphql';
import { signal } from '@preact/signals-core';
import { Service } from '@toeverything/infra';

import type { GraphQLService, SubscriptionService } from '../../cloud';
import type { GlobalStateService } from '../../storage';

const ROUTE_TARGET_KEY = 'AIManagedRouteTarget';

export interface AIModel {
  id: string;
  name: string;
  category: string;
  version: string;
  available: boolean;
}

export class AIModelService extends Service {
  readonly modelId = signal<string | undefined>(undefined);
  readonly models = signal<AIModel[]>([]);

  private workspaceId: string | undefined;
  private routeId: string | undefined;
  private requestId = 0;

  constructor(
    private readonly globalStateService: GlobalStateService,
    private readonly gqlService: GraphQLService,
    subscriptionService: SubscriptionService
  ) {
    super();
    const subscription = subscriptionService.subscription.ai$.subscribe(() => {
      if (this.workspaceId && this.routeId) {
        this.load(this.workspaceId, this.routeId).catch(console.error);
      }
    });
    this.disposables.push(() => subscription.unsubscribe());
  }

  setScope(workspaceId: string, routeId: string) {
    if (workspaceId === this.workspaceId && routeId === this.routeId) return;
    this.workspaceId = workspaceId;
    this.routeId = routeId;
    this.models.value = [];
    this.modelId.value = undefined;
    this.load(workspaceId, routeId).catch(console.error);
  }

  resetModel() {
    this.setModel(undefined);
  }

  setModel(modelId: string | undefined) {
    if (!this.workspaceId || !this.routeId) return;
    if (
      modelId &&
      !this.models.value.find(model => model.id === modelId)?.available
    ) {
      return;
    }
    this.modelId.value = modelId;
    this.globalStateService.globalState.set(
      this.storageKey(this.workspaceId, this.routeId),
      modelId
    );
  }

  private async load(workspaceId: string, routeId: string) {
    const requestId = ++this.requestId;
    const result = await this.gqlService.gql({
      query: getCopilotRouteOptionsQuery,
      variables: { promptName: routeId },
    });
    if (requestId !== this.requestId) return;
    const options = result.currentUser?.copilot?.routeOptions;
    if (!options) {
      this.models.value = [];
      this.modelId.value = undefined;
      return;
    }
    this.models.value = options.choices.map(choice => {
      const [category] = choice.displayName.split(' ');
      return {
        id: choice.id,
        name: choice.displayName,
        category,
        version: choice.displayName.slice(category.length + 1),
        available: choice.available,
      };
    });
    const selected = this.globalStateService.globalState.get<string>(
      this.storageKey(workspaceId, routeId)
    );
    const selectedAvailable = this.models.value.some(
      model => model.id === selected && model.available
    );
    this.modelId.value = selectedAvailable ? selected : undefined;
    if (selected && !selectedAvailable) {
      this.globalStateService.globalState.set(
        this.storageKey(workspaceId, routeId),
        undefined
      );
    }
  }

  private storageKey(workspaceId: string, routeId: string) {
    return `${ROUTE_TARGET_KEY}:${workspaceId}:${routeId}`;
  }
}
