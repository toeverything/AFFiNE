import { Injectable } from '@nestjs/common';

import { CopilotContextService } from '../context/service';
import { type Turn } from '../core';
import {
  type ModelConditions,
  ModelInputType,
  type PromptParams,
  type StreamObject,
} from '../providers/types';
import { ChatSession } from '../session';
import { ChatQuerySchema } from '../types';
import { getTools } from '../utils';
import { CapabilityRuntime } from './capability-runtime';
import { ConversationHost } from './hosts/conversation-host';
import { ImageResultHost } from './hosts/image-result-host';
import { TurnPersistence } from './hosts/turn-persistence';

@Injectable()
export class TurnOrchestrator {
  constructor(
    private readonly conversations: ConversationHost,
    private readonly context: CopilotContextService,
    private readonly runtime: CapabilityRuntime,
    private readonly imageResults: ImageResultHost,
    private readonly turnPersistence: TurnPersistence
  ) {}

  private async buildPromptParams(
    sessionId: string,
    options: {
      latestTurn?: Turn;
      includeContextFiles?: boolean;
    } = {}
  ): Promise<Record<string, unknown>> {
    const current = await this.context.getBySessionId(sessionId);
    const contextFiles =
      options.includeContextFiles &&
      current &&
      (current.files.length > 0 || current.blobs.length > 0)
        ? [...current.files, ...(await current.getBlobMetadata())]
        : [];
    const latestTurn = options.latestTurn;

    return {
      ...this.conversations.buildLatestTurnPromptParams(latestTurn),
      ...(contextFiles.length ? { contextFiles } : {}),
    };
  }

  private async prepareChatSelection(
    userId: string,
    sessionId: string,
    query: Record<string, string | string[]>,
    selection: {
      responseMode: 'text' | 'object' | 'image';
      includeContextFiles?: boolean;
    }
  ) {
    const prepared = await this.conversations.prepareTurn(
      userId,
      sessionId,
      query
    );
    const {
      profileId,
      modelId,
      routeTargetId,
      reasoning,
      webSearch,
      toolsConfig,
      byokLeaseId,
    } = ChatQuerySchema.parse(query);
    const promptParams = await this.buildPromptParams(sessionId, {
      latestTurn: prepared.latestTurn,
      includeContextFiles: selection.includeContextFiles,
    });
    const finalMessage = prepared.session.finish({
      ...prepared.params,
      ...promptParams,
    });

    return {
      prepared,
      finalMessage,
      selection: {
        model: profileId && modelId ? modelId : 'route-selected',
        conditions: { profileId, modelId },
        providerOptions: {
          ...prepared.session.config.promptConfig,
          user: prepared.session.config.userId,
          session: prepared.session.config.sessionId,
          workspace: prepared.session.config.workspaceId,
          profileId,
          byokLeaseId,
          billingUnitId: prepared.latestTurn?.id,
          builtInRouteId: prepared.session.config.promptName,
          managedTargetId: routeTargetId,
          quotaBackedRoutesAllowed: prepared.quotaBackedRoutesAllowed,
          featureKind:
            selection.responseMode === 'image'
              ? 'image'
              : selection.responseMode === 'object'
                ? 'action'
                : 'chat',
          reasoning,
          webSearch,
          tools: getTools(
            prepared.session.config.promptConfig?.tools,
            toolsConfig
          ),
        },
      },
    };
  }

  async streamText(
    userId: string,
    sessionId: string,
    query: Record<string, string | string[]>,
    signal?: AbortSignal,
    wasAborted: () => boolean = () => false
  ) {
    const { prepared, finalMessage, selection } =
      await this.prepareChatSelection(userId, sessionId, query, {
        responseMode: 'text',
        includeContextFiles: true,
      });

    const stream = this.streamTextResult(
      prepared.session,
      selection.conditions,
      finalMessage,
      {
        ...selection.providerOptions,
        signal,
      },
      wasAborted
    );

    return {
      messageId: prepared.messageId,
      model: selection.model,
      finalMessage,
      stream,
    };
  }

  private async *streamTextResult(
    session: ChatSession,
    conditions: ModelConditions,
    finalMessage: ReturnType<ChatSession['finish']>,
    options: Record<string, unknown>,
    wasAborted: () => boolean
  ) {
    let buffer = '';
    for await (const chunk of this.runtime.streamText(
      conditions,
      finalMessage,
      options
    )) {
      buffer += chunk;
      yield chunk;
    }
    await this.turnPersistence.persistTextResult(session, buffer, wasAborted());
  }

  async streamObject(
    userId: string,
    sessionId: string,
    query: Record<string, string | string[]>,
    signal?: AbortSignal,
    wasAborted: () => boolean = () => false
  ) {
    const { prepared, finalMessage, selection } =
      await this.prepareChatSelection(userId, sessionId, query, {
        responseMode: 'object',
        includeContextFiles: true,
      });

    return {
      messageId: prepared.messageId,
      model: selection.model,
      finalMessage,
      stream: this.streamObjectResult(
        prepared.session,
        selection.conditions,
        finalMessage,
        {
          ...selection.providerOptions,
          signal,
        },
        wasAborted
      ),
    };
  }

  private async *streamObjectResult(
    session: ChatSession,
    conditions: ModelConditions,
    finalMessage: ReturnType<ChatSession['finish']>,
    options: Record<string, unknown>,
    wasAborted: () => boolean
  ): AsyncIterableIterator<StreamObject> {
    const chunks: StreamObject[] = [];
    for await (const chunk of this.runtime.streamObject(
      conditions,
      finalMessage,
      options
    )) {
      chunks.push(chunk);
      yield chunk;
    }
    await this.turnPersistence.persistObjectResult(
      session,
      chunks,
      wasAborted()
    );
  }

  async streamImages(
    userId: string,
    sessionId: string,
    query: Record<string, string | string[]>,
    signal?: AbortSignal,
    wasAborted: () => boolean = () => false
  ) {
    const { prepared, finalMessage, selection } =
      await this.prepareChatSelection(userId, sessionId, query, {
        responseMode: 'image',
      });
    const [systemMessage] = finalMessage;
    const finalParams: PromptParams = systemMessage?.params ?? {};
    const hasAttachment =
      !!prepared.session.latestUserTurn?.attachments?.length;

    return {
      messageId: prepared.messageId,
      model: selection.model,
      finalMessage,
      stream: this.streamImageResult(
        userId,
        sessionId,
        prepared.session,
        selection.conditions,
        hasAttachment,
        finalMessage,
        {
          ...selection.providerOptions,
          quality:
            typeof finalParams.quality === 'string'
              ? finalParams.quality
              : undefined,
          seed: this.parseNumber(finalParams.seed),
          signal,
        },
        wasAborted
      ),
    };
  }

  private async *streamImageResult(
    userId: string,
    sessionId: string,
    session: ChatSession,
    conditions: ModelConditions,
    hasAttachment: boolean,
    finalMessage: ReturnType<ChatSession['finish']>,
    options: Record<string, unknown>,
    wasAborted: () => boolean
  ): AsyncIterableIterator<string> {
    const attachments: string[] = [];
    for await (const artifact of this.runtime.streamImageArtifacts(
      {
        ...conditions,
        inputTypes: hasAttachment
          ? [ModelInputType.Image]
          : [ModelInputType.Text],
      },
      finalMessage,
      options
    )) {
      const handled = await this.imageResults.persistNativeArtifact(
        userId,
        sessionId,
        artifact
      );
      if (handled) {
        attachments.push(handled);
        yield handled;
      }
    }
    await this.turnPersistence.persistImageResult(
      session,
      attachments,
      wasAborted()
    );
  }

  private parseNumber(value: unknown) {
    if (!value) {
      return undefined;
    }
    const num = Number.parseInt(String(value), 10);
    return Number.isNaN(num) ? undefined : num;
  }
}
