import { Injectable } from '@nestjs/common';

import { Models } from '../../../models';
import type { AiActionRunStatus } from '../../../models/copilot-action-run';
import { type NativeActionEvent } from '../../../native';
import type {
  CopilotImageOptions,
  CopilotStructuredOptions,
  PromptMessage,
} from '../providers/types';
import type { ChatSession } from '../session';
import {
  projectActionResultToAssistantTurn,
  summarizeActionResult,
} from './action-output-projector';
import { CapabilityRuntime } from './capability-runtime';
import { type RequiredStructuredOutputContract } from './contracts';
import { TurnPersistence } from './hosts/turn-persistence';

export type ActionRuntimeBridgeInput = {
  userId: string;
  workspaceId: string;
  docId?: string | null;
  session?: ChatSession;
  userMessageId?: string | null;
  compatSubmissionId?: string | null;
  actionId: string;
  actionVersion: string;
  attempt?: number;
  retryOf?: string | null;
  inputSnapshot?: unknown;
  onRunCreated?: (
    context: ActionRuntimeBridgeRunContext
  ) => Promise<void> | void;
  step: {
    slot: string;
    builtInRouteId: string;
    profileId?: string;
    modelId?: string;
    messages: PromptMessage[];
    options?: CopilotStructuredOptions | CopilotImageOptions;
    responseContract?: RequiredStructuredOutputContract;
  };
  persistAttachment?: (attachment: unknown) => Promise<unknown> | unknown;
  signal?: AbortSignal;
};

export type ActionRuntimeBridgeEvent = NativeActionEvent & {
  runId: string;
};

export type ActionRuntimeBridgeOutput = {
  result: unknown;
  attachments?: unknown[];
};

export type ActionRuntimeBridgeExecutor = (
  input: ActionRuntimeBridgeInput
) => Promise<ActionRuntimeBridgeOutput>;

export type ActionRuntimeBridgeRunContext = {
  runId: string;
  attempt: number;
};

function extractResultArtifacts(result: unknown) {
  if (!result || typeof result !== 'object') {
    return [];
  }
  const value = result as { artifacts?: unknown; attachments?: unknown };
  if (Array.isArray(value.artifacts)) {
    return value.artifacts;
  }
  if (Array.isArray(value.attachments)) {
    return value.attachments;
  }
  return [];
}

function resolveFinalStatus(
  event: NativeActionEvent | undefined,
  signal?: AbortSignal
): Extract<AiActionRunStatus, 'succeeded' | 'failed' | 'aborted'> {
  if (signal?.aborted || event?.status === 'aborted') {
    return 'aborted';
  }
  if (event?.type === 'action_done' && event.status === 'succeeded') {
    return 'succeeded';
  }
  return 'failed';
}

@Injectable()
export class ActionRuntimeBridge {
  constructor(
    private readonly models: Models,
    private readonly turnPersistence: TurnPersistence,
    private readonly runtime: CapabilityRuntime
  ) {}

  private async execute(input: ActionRuntimeBridgeInput) {
    const step = input.step;
    if (step.responseContract) {
      const output = await this.runtime.generateStructuredValue(
        { profileId: step.profileId, modelId: step.modelId },
        step.messages,
        {
          ...(step.options as CopilotStructuredOptions | undefined),
          builtInRouteId: step.builtInRouteId,
        },
        step.responseContract,
        undefined,
        step.slot
      );
      return { result: output.value, attachments: [] };
    }
    const images = [];
    for await (const image of this.runtime.streamImageArtifacts(
      { profileId: step.profileId, modelId: step.modelId },
      step.messages,
      {
        ...(step.options as CopilotImageOptions | undefined),
        builtInRouteId: step.builtInRouteId,
      },
      undefined,
      step.slot
    )) {
      images.push(image);
    }
    const result = images[0];
    if (!result) throw new Error('Action image generation produced no image');
    return { result, attachments: [result] };
  }

  private async projectAssistantResult(
    input: ActionRuntimeBridgeInput,
    result: unknown,
    artifacts: unknown[],
    wasAborted: boolean
  ) {
    if (!input.session) return null;
    const turn = projectActionResultToAssistantTurn({
      session: input.session,
      actionId: input.actionId,
      result,
      artifacts,
      wasAborted,
    });
    if (!turn) return null;
    return await this.turnPersistence.persistProjectedResult(
      input.session,
      turn,
      wasAborted
    );
  }

  private async resolveAttempt(input: ActionRuntimeBridgeInput) {
    if (!input.retryOf) {
      return input.attempt ?? 1;
    }

    const previous = await this.models.copilotActionRun.get(input.retryOf);
    if (!previous) {
      throw new Error('Retry source action run not found');
    }
    if (
      previous.userId !== input.userId ||
      previous.workspaceId !== input.workspaceId ||
      previous.actionId !== input.actionId ||
      previous.actionVersion !== input.actionVersion ||
      previous.sessionId !== (input.session?.config.sessionId ?? null)
    ) {
      throw new Error('Retry source action run does not match current action');
    }
    if (input.attempt && input.attempt <= previous.attempt) {
      throw new Error('Retry attempt must be greater than source action run');
    }
    if (input.attempt) {
      return input.attempt;
    }
    return (previous?.attempt ?? 1) + 1;
  }

  async *runStream(
    input: ActionRuntimeBridgeInput,
    executor?: ActionRuntimeBridgeExecutor
  ): AsyncIterableIterator<ActionRuntimeBridgeEvent> {
    const attempt = await this.resolveAttempt(input);
    const run = await this.models.copilotActionRun.create({
      userId: input.userId,
      workspaceId: input.workspaceId,
      docId: input.docId,
      sessionId: input.session?.config.sessionId,
      userMessageId: input.userMessageId,
      compatSubmissionId: input.compatSubmissionId,
      actionId: input.actionId,
      actionVersion: input.actionVersion,
      attempt,
      retryOf: input.retryOf,
      inputSnapshot: input.inputSnapshot,
    });
    await this.models.copilotActionRun.markRunning(run.id);
    await input.onRunCreated?.({
      runId: run.id,
      attempt,
    });

    const inputWithBillingUnit = this.withBillingUnit(input, run.id);
    let finalEvent: NativeActionEvent | undefined;
    const attachments: unknown[] = [];
    try {
      const actionStart: NativeActionEvent = {
        type: 'action_start',
        actionId: input.actionId,
        actionVersion: input.actionVersion,
        status: 'running',
      };
      yield { ...actionStart, runId: run.id };
      const output = executor
        ? await executor(inputWithBillingUnit)
        : await this.execute(inputWithBillingUnit);
      for (const artifact of output.attachments ?? []) {
        const attachment = input.persistAttachment
          ? await input.persistAttachment(artifact)
          : artifact;
        attachments.push(attachment);
        yield {
          type: 'attachment',
          actionId: input.actionId,
          actionVersion: input.actionVersion,
          status: 'running',
          attachment,
          runId: run.id,
        };
      }
      finalEvent = {
        type: 'action_done',
        actionId: input.actionId,
        actionVersion: input.actionVersion,
        status: 'succeeded',
        result: output.result,
      };
      yield { ...finalEvent, runId: run.id };
    } catch (error) {
      finalEvent = {
        type: 'error',
        actionId: input.actionId,
        actionVersion: input.actionVersion,
        status: input.signal?.aborted ? 'aborted' : 'failed',
        errorCode: input.signal?.aborted
          ? 'action_aborted'
          : 'action_bridge_stream_error',
        errorMessage:
          error instanceof Error ? error.message : 'action stream failed',
      };
      yield { ...finalEvent, runId: run.id };
    } finally {
      let status = resolveFinalStatus(finalEvent, input.signal);
      const result = finalEvent?.result;
      const artifacts =
        status === 'succeeded'
          ? [...attachments, ...extractResultArtifacts(result)]
          : undefined;
      let assistantMessageId: string | null = null;
      let errorCode = status === 'succeeded' ? null : finalEvent?.errorCode;
      if (status === 'succeeded' || status === 'aborted') {
        try {
          assistantMessageId =
            (await this.projectAssistantResult(
              input,
              result,
              artifacts ?? [],
              status === 'aborted'
            )) ?? null;
        } catch {
          status = 'failed';
          errorCode = 'action_output_projection_failed';
        }
      }

      await this.models.copilotActionRun.complete(run.id, {
        status,
        result: status === 'succeeded' ? result : undefined,
        artifacts: status === 'succeeded' ? artifacts : undefined,
        resultSummary:
          status === 'succeeded' ? summarizeActionResult(result) : null,
        errorCode,
        trace: finalEvent?.trace ?? undefined,
        assistantMessageId,
      });
    }
  }

  private withBillingUnit(
    input: ActionRuntimeBridgeInput,
    billingUnitId: string
  ): ActionRuntimeBridgeInput {
    return {
      ...input,
      step: {
        ...input.step,
        options: {
          ...input.step.options,
          actionId: input.step.options?.actionId ?? input.actionId,
          billingUnitId: input.step.options?.billingUnitId ?? billingUnitId,
        },
      },
    };
  }
}
