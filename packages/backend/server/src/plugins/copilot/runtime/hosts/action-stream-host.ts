import { Injectable } from '@nestjs/common';

import {
  getCopilotActionRecipe,
  type LlmImageResponse,
} from '../../../../native';
import { PromptService } from '../../prompt';
import type { PromptMessage } from '../../providers/types';
import type { ChatSession } from '../../session';
import { ChatQuerySchema } from '../../types';
import { projectActionEventToChatEvent } from '../action-output-projector';
import type { ActionRuntimeBridgeEvent } from '../action-runtime-bridge';
import { ActionRuntimeBridge } from '../action-runtime-bridge';
import {
  buildStructuredResponseFromSchemaJson,
  requireStructuredOutputContract,
} from '../contracts';
import { ConversationHost } from './conversation-host';
import { ImageResultHost } from './image-result-host';

export { projectActionEventToChatEvent };

function firstQueryValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

@Injectable()
export class ActionStreamHost {
  constructor(
    private readonly conversations: ConversationHost,
    private readonly bridge: ActionRuntimeBridge,
    private readonly prompts: PromptService,
    private readonly imageResults: ImageResultHost
  ) {}

  async stream(
    userId: string,
    sessionId: string,
    query: Record<string, string | string[]>,
    signal?: AbortSignal
  ): Promise<{
    messageId?: string;
    actionId: string;
    actionVersion: string;
    stream: AsyncIterableIterator<ActionRuntimeBridgeEvent>;
  }> {
    const parsedQuery = ChatQuerySchema.parse(query);
    const prepared = await this.conversations.prepareTurn(
      userId,
      sessionId,
      query
    );
    const requestedActionId =
      firstQueryValue(query.actionId) ?? prepared.session.config.promptName;
    const actionId = requestedActionId;
    const actionVersion = firstQueryValue(query.actionVersion) ?? 'v1';
    const recipe = getCopilotActionRecipe(actionId, actionVersion);
    const retryOf = parsedQuery.retry
      ? firstQueryValue(query.runId)
      : undefined;
    const params = {
      ...prepared.params,
      ...this.conversations.buildLatestTurnPromptParams(prepared.latestTurn),
    };
    const finalMessage = await this.preparePromptMessages(
      recipe.promptRef,
      prepared.session,
      params
    );
    const responseContract = recipe.responseContract
      ? requireStructuredOutputContract(
          buildStructuredResponseFromSchemaJson(recipe.responseContract.schema)
        )
      : undefined;
    const producesImage = recipe.outputProjection === 'first_image';
    const runStream = this.bridge.runStream({
      userId,
      workspaceId: prepared.session.config.workspaceId,
      docId: prepared.session.config.docId,
      session: prepared.session,
      userMessageId: prepared.latestTurn?.id,
      compatSubmissionId: prepared.messageId,
      actionId,
      actionVersion,
      retryOf,
      inputSnapshot: {
        params,
        messageId: prepared.messageId,
      },
      persistAttachment: producesImage
        ? attachment =>
            this.persistImageAttachment(
              userId,
              prepared.session.config.workspaceId,
              attachment
            )
        : undefined,
      step: {
        slot: recipe.slot,
        builtInRouteId: recipe.promptRef,
        profileId: parsedQuery.profileId,
        modelId: parsedQuery.modelId,
        messages: finalMessage,
        responseContract,
        options: {
          ...prepared.session.config.promptConfig,
          signal,
          user: userId,
          workspace: prepared.session.config.workspaceId,
          session: sessionId,
          byokLeaseId: parsedQuery.byokLeaseId,
          managedTargetId: parsedQuery.routeTargetId,
          quotaBackedRoutesAllowed: prepared.quotaBackedRoutesAllowed,
          featureKind: producesImage ? 'image' : 'action',
        },
      },
      signal,
    });

    return {
      messageId: prepared.messageId,
      actionId,
      actionVersion,
      stream: runStream,
    };
  }

  private async preparePromptMessages(
    promptRef: string,
    session: ChatSession,
    params: Record<string, unknown>
  ): Promise<PromptMessage[]> {
    const prompt = await this.prompts.get(promptRef);
    if (!prompt) {
      throw new Error(`Prompt ${promptRef} not found`);
    }
    return this.prompts.finish(
      prompt,
      params as Record<string, string>,
      session.config.sessionId
    );
  }

  private async persistImageAttachment(
    userId: string,
    workspaceId: string,
    attachment: unknown
  ) {
    if (!attachment || typeof attachment !== 'object') {
      return attachment;
    }

    const artifact = attachment as LlmImageResponse['images'][number] & {
      url?: unknown;
      data_base64?: unknown;
      media_type?: unknown;
      width?: unknown;
      height?: unknown;
      providerMetadata?: unknown;
    };
    const persisted = await this.imageResults.persistNativeArtifact(
      userId,
      workspaceId,
      artifact
    );
    if (!persisted) {
      return attachment;
    }

    return {
      url: persisted,
      ...(typeof artifact.media_type === 'string'
        ? { mimeType: artifact.media_type }
        : {}),
      ...(typeof artifact.width === 'number' ? { width: artifact.width } : {}),
      ...(typeof artifact.height === 'number'
        ? { height: artifact.height }
        : {}),
      ...(artifact.providerMetadata !== undefined
        ? { providerMetadata: artifact.providerMetadata }
        : {}),
    };
  }
}
