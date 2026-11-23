import { Injectable, Logger } from '@nestjs/common';

import { metrics } from '../../../base';
import { Models } from '../../../models';
import { type ByokFeatureKind, ByokProviderSource } from '../byok/types';

export type CopilotRuntimeRouteIdentity = {
  profileId: string;
  source: 'server' | 'local' | 'affine_cloud';
  provider: string;
  model: string;
};

export type CopilotRuntimeEvent =
  | { type: 'route_selected'; route: CopilotRuntimeRouteIdentity }
  | {
      type: 'route_failed';
      route: CopilotRuntimeRouteIdentity;
      errorKind: string;
    }
  | {
      type: 'usage';
      route: CopilotRuntimeRouteIdentity;
      usage: {
        prompt_tokens?: number;
        completion_tokens?: number;
        total_tokens?: number;
        cached_tokens?: number;
        input_tokens?: number;
        output_tokens?: number;
      };
    };

export type CopilotRuntimeEventContext = {
  workspaceId?: string;
  userId?: string;
  sessionId?: string;
  taskId?: string;
  actionId?: string;
  billingUnitId?: string;
  featureKind: ByokFeatureKind;
};

@Injectable()
export class CopilotRuntimeEventConsumer {
  private readonly logger = new Logger(CopilotRuntimeEventConsumer.name);

  constructor(private readonly models: Models) {}

  async consume(
    events: CopilotRuntimeEvent[],
    context: CopilotRuntimeEventContext
  ) {
    for (const event of events) {
      try {
        if (event.type === 'route_selected') {
          await this.recordSelection(event, context);
        } else if (event.type === 'usage') {
          await this.recordUsage(event, context);
        } else if (event.type === 'route_failed') {
          await this.recordFailure(event, context);
        }
      } catch (error) {
        this.logger.warn(
          `Failed to consume copilot runtime event: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }
    }
  }

  private async recordSelection(
    event: Extract<CopilotRuntimeEvent, { type: 'route_selected' }>,
    context: CopilotRuntimeEventContext
  ) {
    if (context.workspaceId && event.route.source === 'server') {
      await this.models.copilotWorkspaceByokConfig.touchUsed(
        context.workspaceId,
        event.route.profileId
      );
    }
  }

  private async recordUsage(
    event: Extract<CopilotRuntimeEvent, { type: 'usage' }>,
    context: CopilotRuntimeEventContext
  ) {
    if (!context.workspaceId || event.route.source === 'affine_cloud') {
      return;
    }
    const usage = event.usage;
    metrics.ai.counter('byok_usage').add(1, {
      provider: event.route.provider,
      source: event.route.source,
      feature: context.featureKind,
    });
    await this.models.copilotUsage.create({
      workspaceId: context.workspaceId,
      userId: context.userId,
      provider: event.route.provider,
      providerSource:
        event.route.source === 'server'
          ? ByokProviderSource.Server
          : ByokProviderSource.Local,
      featureKind: context.featureKind,
      model: event.route.model,
      sessionId: context.sessionId,
      taskId: context.taskId,
      actionId: context.actionId,
      billingUnitId: context.billingUnitId,
      promptTokens: usage.prompt_tokens ?? usage.input_tokens ?? 0,
      completionTokens: usage.completion_tokens ?? usage.output_tokens ?? 0,
      totalTokens: usage.total_tokens ?? 0,
      cachedTokens: usage.cached_tokens ?? 0,
    });
  }

  private async recordFailure(
    event: Extract<CopilotRuntimeEvent, { type: 'route_failed' }>,
    context: CopilotRuntimeEventContext
  ) {
    metrics.ai.counter('byok_route_failure').add(1, {
      provider: event.route.provider,
      source: event.route.source,
      feature: context.featureKind,
      reason: event.errorKind,
    });
    if (context.workspaceId && event.route.source === 'server') {
      await this.models.copilotWorkspaceByokConfig.markFailure(
        context.workspaceId,
        event.route.profileId,
        event.errorKind
      );
    }
  }
}
