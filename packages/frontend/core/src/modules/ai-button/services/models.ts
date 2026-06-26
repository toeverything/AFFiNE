import { apis } from '@affine/electron-api';
import { getPromptModelsQuery, SubscriptionStatus } from '@affine/graphql';
import {
  createSignalFromObservable,
  type Signal,
} from '@blocksuite/affine/shared/utils';
import { signal } from '@preact/signals-core';
import { LiveData, OnEvent, Service } from '@toeverything/infra';

import type { GraphQLService, SubscriptionService } from '../../cloud';
import { AccountChanged } from '../../cloud/events/account-changed';
import { ServerStarted } from '../../cloud/events/server-started';
import type { GlobalStateService } from '../../storage';
import {
  type AIModelCatalogItem,
  buildAIModelCatalogSnapshot,
  buildDesktopOfflineGemmaModels,
  DESKTOP_OFFLINE_GEMMA_MODEL_ID,
  mergeDesktopLocalGemmaModels,
} from './catalog';

export { DESKTOP_OFFLINE_GEMMA_MODEL_ID };

const AI_MODEL_ID_KEY = 'AIModelId';
const AI_MODEL_EXECUTION_PREFERENCE_KEY = 'AIModelExecutionPreference';

export type AIModelExecutionPreference = 'local' | 'cloud';

export interface AIModel extends AIModelCatalogItem {}

@OnEvent(AccountChanged, service => service.onAccountChanged)
@OnEvent(ServerStarted, service => service.onServerStarted)
export class AIModelService extends Service {
  modelId: Signal<string | undefined>;

  models: Signal<AIModel[]> = signal([]);

  private readonly modelId$ = LiveData.from(
    this.globalStateService.globalState.watch<string>(AI_MODEL_ID_KEY),
    undefined
  );

  constructor(
    private readonly globalStateService: GlobalStateService,
    private readonly gqlService: GraphQLService,
    private readonly subscriptionService: SubscriptionService
  ) {
    super();

    const { signal: modelId, cleanup } = createSignalFromObservable<
      string | undefined
    >(this.modelId$, undefined);
    this.modelId = modelId;
    this.disposables.push(cleanup);

    this.init().catch(err => {
      console.error(err);
    });
  }

  private getExecutionPreferenceKey(modelId: string) {
    return `${AI_MODEL_EXECUTION_PREFERENCE_KEY}:${modelId}`;
  }

  resetModel = () => {
    this.globalStateService.globalState.set(AI_MODEL_ID_KEY, undefined);
  };

  setModel = (modelId: string) => {
    const isSubscribed =
      this.subscriptionService.subscription.ai$.value?.status ===
      SubscriptionStatus.Active;
    const model = this.models.value.find(model => model.id === modelId);
    if (!isSubscribed && model?.isPro) {
      return;
    }
    this.globalStateService.globalState.set(AI_MODEL_ID_KEY, modelId);
  };

  getActiveModel = (modelId?: string) => {
    const activeModel = this.models.value.find(model => model.id === modelId);
    if (activeModel) {
      return activeModel;
    }

    const cloudDefault = this.models.value.find(
      model => model.isDefault && !model.localCapable
    );
    if (cloudDefault) {
      return cloudDefault;
    }

    return (
      this.models.value.find(model => model.isDefault && model.localCapable) ??
      this.models.value.find(model => model.isDefault) ??
      this.models.value.find(model => model.localCapable) ??
      this.models.value[0]
    );
  };

  getActiveModelId = (modelId?: string) => {
    return this.getActiveModel(modelId)?.id;
  };

  getExecutionPreference = (modelId?: string): AIModelExecutionPreference => {
    const model = this.getActiveModel(modelId);
    const preferenceFor = (resolvedModelId: string) =>
      this.globalStateService.globalState.get<AIModelExecutionPreference>(
        this.getExecutionPreferenceKey(resolvedModelId)
      ) ?? 'local';

    if (!model) {
      return modelId === DESKTOP_OFFLINE_GEMMA_MODEL_ID
        ? preferenceFor(DESKTOP_OFFLINE_GEMMA_MODEL_ID)
        : 'cloud';
    }

    if (!model.localCapable) {
      return 'cloud';
    }

    return preferenceFor(model.id);
  };

  setExecutionPreference = (
    modelId: string,
    preference: AIModelExecutionPreference
  ) => {
    const model = this.getActiveModel(modelId);
    if (!model?.localCapable) {
      return;
    }

    this.globalStateService.globalState.set(
      this.getExecutionPreferenceKey(model.id),
      preference
    );
  };

  private readonly init = async () => {
    await this.initModels();

    // subscribe to ai purchase status
    const sub = this.subscriptionService.subscription.ai$.subscribe(
      subscription => {
        const isSubscribed = subscription?.status === SubscriptionStatus.Active;
        const model = this.models.value.find(
          model => model.id === this.modelId.value
        );
        if (!isSubscribed && model?.isPro) {
          this.resetModel();
        }
      }
    );
    this.disposables.push(() => sub.unsubscribe());
  };

  private readonly initModels = async (prompt?: string) => {
    const promptName = prompt || 'Chat With AFFiNE AI';

    try {
      const models = await this.getModelsByPrompt(promptName);
      if (models?.optionalModels?.length) {
        const cloudModels = buildAIModelCatalogSnapshot({
          selectedModelId: this.modelId.value,
          promptModels: models,
        }).models;
        this.models.value = this.shouldUseDesktopOfflineCatalog()
          ? mergeDesktopLocalGemmaModels(cloudModels)
          : cloudModels;
      } else if (this.shouldUseDesktopOfflineCatalog()) {
        this.applyDesktopOfflineCatalog();
      }
    } catch (error) {
      if (this.shouldUseDesktopOfflineCatalog()) {
        this.applyDesktopOfflineCatalog();
      } else {
        throw error;
      }
    }

    this.ensureDefaultDesktopModel();
  };

  private shouldUseDesktopOfflineCatalog() {
    return !!apis?.localAI;
  }

  private applyDesktopOfflineCatalog() {
    this.models.value = buildDesktopOfflineGemmaModels();
  }

  private ensureDefaultDesktopModel() {
    if (!this.shouldUseDesktopOfflineCatalog()) {
      return;
    }

    const storedModelId = this.modelId.value;
    const hasStoredModel =
      !!storedModelId &&
      this.models.value.some(model => model.id === storedModelId);

    if (hasStoredModel) {
      const activeModelId = this.getActiveModelId(storedModelId);
      if (activeModelId && activeModelId !== storedModelId) {
        this.globalStateService.globalState.set(AI_MODEL_ID_KEY, activeModelId);
      }
      return;
    }

    const cloudDefault =
      this.models.value.find(
        model => model.isDefault && model.id !== DESKTOP_OFFLINE_GEMMA_MODEL_ID
      ) ??
      this.models.value.find(
        model =>
          model.id !== DESKTOP_OFFLINE_GEMMA_MODEL_ID && !model.localCapable
      );

    if (cloudDefault) {
      this.globalStateService.globalState.set(AI_MODEL_ID_KEY, cloudDefault.id);
      return;
    }

    this.globalStateService.globalState.set(
      AI_MODEL_ID_KEY,
      DESKTOP_OFFLINE_GEMMA_MODEL_ID
    );
  }

  private refreshModels() {
    this.initModels().catch(err => {
      console.error(err);
    });
  }

  private onAccountChanged() {
    this.refreshModels();
  }

  private onServerStarted() {
    this.refreshModels();
  }

  private readonly getModelsByPrompt = async (promptName: string) => {
    return this.gqlService
      .gql({
        query: getPromptModelsQuery,
        variables: { promptName },
      })
      .then(res => res.currentUser?.copilot?.models);
  };
}
