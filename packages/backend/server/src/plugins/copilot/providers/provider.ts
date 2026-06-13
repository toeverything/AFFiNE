import { Inject, Injectable, Logger } from '@nestjs/common';

import { Config } from '../../../base';
import type { NodeTextMiddleware, ProviderMiddlewareConfig } from '../config';
import { ToolExecutorHost } from '../runtime/hosts/tool-executor-host';
import { mapNativeSemanticError } from '../runtime/native-errors';
import type { ToolLoopBackend } from '../runtime/tool/bridge';
import type { CopilotTool, CopilotToolSet } from '../tools';
import { resolveProviderMiddleware } from './provider-middleware';
import {
  checkProviderParams,
  getAttachCapability as getAttachCapabilityHelper,
  matchProviderModel as matchProviderModelHelper,
  type ProviderModelRuntimeContext,
  requireProviderModelSelection,
  resolveProviderModel,
} from './provider-model-runtime';
import {
  type CopilotProviderExecution,
  createNativeExecutionDriverSpec,
  type ProviderDriverSpec,
  type ProviderExecutionDrivers,
  type ProviderRuntimeHostSeed,
} from './provider-runtime-contract';
import {
  type CopilotChatOptions,
  CopilotChatTools,
  type CopilotImageOptions,
  type CopilotModelBackendKind,
  CopilotProviderModel,
  CopilotProviderType,
  type CopilotStructuredOptions,
  type ModelAttachmentCapability,
  ModelFullConditions,
  ModelOutputType,
  type PromptMessage,
} from './types';
export type {
  CopilotProviderExecution,
  ProviderDriverSpec,
  ProviderExecutionDrivers,
  ProviderRuntimeHostSeed,
} from './provider-runtime-contract';

@Injectable()
export abstract class CopilotProvider<C = any> {
  protected readonly logger = new Logger(this.constructor.name);
  protected readonly MAX_STEPS = 20;

  abstract readonly type: CopilotProviderType;
  protected abstract resolveModelBackendKind(
    execution?: CopilotProviderExecution
  ): CopilotModelBackendKind;
  abstract configured(execution?: CopilotProviderExecution): boolean;

  @Inject() protected readonly AFFiNEConfig!: Config;
  @Inject() protected readonly toolExecutorHost!: ToolExecutorHost;

  get maxSteps() {
    return this.MAX_STEPS;
  }

  protected resolveModelRuntimeContext(
    execution?: CopilotProviderExecution
  ): ProviderModelRuntimeContext {
    return {
      type: this.type,
      backendKind: this.resolveModelBackendKind(execution),
    };
  }

  protected get modelRuntimeContext(): ProviderModelRuntimeContext {
    return this.resolveModelRuntimeContext();
  }

  getDriverSpec(): ProviderDriverSpec | undefined {
    return undefined;
  }

  getExecutionDrivers(): ProviderExecutionDrivers | undefined {
    const spec = this.getDriverSpec();
    return spec ? this.createDriverSpec(spec) : undefined;
  }

  protected createDriverSpec(
    spec: ProviderDriverSpec
  ): ProviderExecutionDrivers {
    return createNativeExecutionDriverSpec(spec, {
      createBackendConfig: spec.createBackendConfig,
      mapError: error => {
        const mapped = mapNativeSemanticError(error);
        return mapped === error ? spec.mapError(error) : mapped;
      },
      checkParams: input =>
        checkProviderParams(
          this.resolveModelRuntimeContext(input.execution),
          input
        ),
      selectModel: (cond, execution) =>
        requireProviderModelSelection(
          this.resolveModelRuntimeContext(execution),
          cond
        ),
      getTools: this.getTools.bind(this),
      getActiveProviderMiddleware: this.getActiveProviderMiddleware.bind(this),
    });
  }

  selectModel(
    cond: ModelFullConditions,
    execution?: CopilotProviderExecution
  ): CopilotProviderModel {
    return requireProviderModelSelection(
      this.resolveModelRuntimeContext(execution),
      cond
    );
  }

  checkParams(input: {
    cond: ModelFullConditions;
    messages?: PromptMessage[];
    embeddings?: string[];
    options?:
      | CopilotChatOptions
      | CopilotStructuredOptions
      | CopilotImageOptions;
    withAttachment?: boolean;
    execution?: CopilotProviderExecution;
  }) {
    return checkProviderParams(
      this.resolveModelRuntimeContext(input.execution),
      input
    );
  }

  getRuntimeHostSeed(): ProviderRuntimeHostSeed {
    return {
      model: this.resolveModelRuntimeContext(),
      resolveExecutionDrivers: () => this.getExecutionDrivers(),
      selectModel: this.selectModel.bind(this),
      checkParams: this.checkParams.bind(this),
      getAttachCapability: this.getAttachCapability.bind(this),
      getActiveProviderMiddleware: this.getActiveProviderMiddleware.bind(this),
      getTools: this.getTools.bind(this),
      metricLabels: this.metricLabels.bind(this),
    };
  }

  protected getExecutionProfile(execution?: CopilotProviderExecution) {
    return execution?.profile?.type === this.type
      ? execution.profile
      : undefined;
  }

  getActiveProviderMiddleware(
    execution?: CopilotProviderExecution
  ): ProviderMiddlewareConfig {
    return (
      this.getExecutionProfile(execution)?.middleware ??
      resolveProviderMiddleware(this.type)
    );
  }

  metricLabels(
    model: string,
    labels: Record<string, string | number | boolean | undefined> = {},
    execution?: CopilotProviderExecution
  ) {
    return {
      model,
      providerId: execution?.providerId ?? `${this.type}-default`,
      ...labels,
    };
  }

  protected get config(): C {
    return this.AFFiNEConfig.copilot.providers[this.type] as C;
  }

  protected getConfig(execution?: CopilotProviderExecution): C {
    const profile = this.getExecutionProfile(execution);
    if (profile) {
      return profile.config as C;
    }
    return this.config;
  }
  getAttachCapability(
    model: CopilotProviderModel,
    outputType: ModelOutputType
  ): ModelAttachmentCapability | undefined {
    return getAttachCapabilityHelper(model, outputType);
  }

  // make it async to allow dynamic check available models in some providers
  async match(
    cond: ModelFullConditions = {},
    execution?: CopilotProviderExecution
  ): Promise<boolean> {
    return (
      this.configured(execution) &&
      matchProviderModelHelper(this.resolveModelRuntimeContext(execution), cond)
    );
  }

  resolveModel(
    modelId: string,
    execution?: CopilotProviderExecution
  ): CopilotProviderModel | undefined {
    return resolveProviderModel(
      this.resolveModelRuntimeContext(execution),
      modelId
    );
  }

  protected getProviderSpecificTools(
    _toolName: CopilotChatTools,
    _model: string
  ): [string, CopilotTool?] | undefined {
    return;
  }

  // use for tool use, shared between providers
  async getTools(
    options: CopilotChatOptions,
    model: string
  ): Promise<CopilotToolSet> {
    this.logger.debug(`getTools: ${JSON.stringify(options?.tools ?? [])}`);
    return await this.toolExecutorHost.getTools(
      options,
      model,
      this.getProviderSpecificTools.bind(this)
    );
  }

  createNativeAdapter(
    backend: ToolLoopBackend,
    tools: CopilotToolSet,
    nodeTextMiddleware?: NodeTextMiddleware[],
    options: {
      maxSteps?: number;
      nodeTextMiddleware?: NodeTextMiddleware[];
    } = {}
  ) {
    return this.toolExecutorHost.createNativeAdapter(backend, tools, {
      ...options,
      nodeTextMiddleware: nodeTextMiddleware ?? options.nodeTextMiddleware,
    });
  }
}
