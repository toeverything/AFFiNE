import { z } from 'zod';

import {
  type LlmBackendConfig,
  llmDispatchToolLoopStream,
  llmDispatchToolLoopStreamPrepared,
  llmDispatchToolLoopStreamRouted,
  type LlmPreparedDispatchRoute,
  type LlmProtocol,
  type LlmRequest,
  type LlmRoutedBackend,
  type LlmToolCallbackRequest,
  type LlmToolCallbackResponse,
  type LlmToolLoopStreamEvent,
} from '../../../../native';
import type {
  CopilotTool,
  CopilotToolExecuteOptions,
  CopilotToolSet,
} from '../../tools';

export type ToolLoopDispatch = (
  request: LlmRequest,
  signalOrOptions?: AbortSignal | CopilotToolExecuteOptions,
  maybeMessages?: CopilotToolExecuteOptions['messages']
) => AsyncIterableIterator<LlmToolLoopStreamEvent>;

export type ToolLoopBackend =
  | { protocol: LlmProtocol; backendConfig: LlmBackendConfig }
  | { routes: LlmRoutedBackend[] }
  | { preparedRoutes: LlmPreparedDispatchRoute[] };

function normalizeToolExecuteOptions(
  signalOrOptions?: AbortSignal | CopilotToolExecuteOptions,
  maybeMessages?: CopilotToolExecuteOptions['messages']
): CopilotToolExecuteOptions {
  if (
    signalOrOptions &&
    typeof signalOrOptions === 'object' &&
    'aborted' in signalOrOptions
  ) {
    return {
      signal: signalOrOptions,
      messages: maybeMessages,
    };
  }

  if (!signalOrOptions) {
    return maybeMessages ? { messages: maybeMessages } : {};
  }

  return {
    ...signalOrOptions,
    signal: signalOrOptions.signal,
    messages: signalOrOptions.messages ?? maybeMessages,
  };
}

export function createToolExecutionCallback(
  tools: CopilotToolSet,
  options: CopilotToolExecuteOptions = {}
) {
  return async (request: LlmToolCallbackRequest) => {
    return await executeToolCall(tools, request, options);
  };
}

export async function executeToolCall(
  tools: CopilotToolSet,
  request: LlmToolCallbackRequest,
  options: CopilotToolExecuteOptions
): Promise<LlmToolCallbackResponse> {
  const tool = tools[request.name] as CopilotTool | undefined;

  if (!tool?.execute) {
    return {
      callId: request.callId,
      name: request.name,
      args: request.args,
      rawArgumentsText: request.rawArgumentsText,
      argumentParseError: request.argumentParseError,
      isError: true,
      output: { message: `Tool not found: ${request.name}` },
    };
  }

  if (request.argumentParseError) {
    return {
      callId: request.callId,
      name: request.name,
      args: request.args,
      rawArgumentsText: request.rawArgumentsText,
      argumentParseError: request.argumentParseError,
      isError: true,
      output: {
        message: 'Invalid tool arguments JSON',
        ...(request.rawArgumentsText
          ? { rawArguments: request.rawArgumentsText }
          : {}),
        ...(request.argumentParseError
          ? { error: request.argumentParseError }
          : {}),
      },
    };
  }

  try {
    const args =
      tool.inputSchema instanceof z.ZodType
        ? tool.inputSchema.parse(request.args)
        : request.args;
    const output = await tool.execute(args, options);
    return {
      callId: request.callId,
      name: request.name,
      args: request.args,
      rawArgumentsText: request.rawArgumentsText,
      argumentParseError: request.argumentParseError,
      output: (output ?? null) as LlmToolCallbackResponse['output'],
    };
  } catch (error) {
    return {
      callId: request.callId,
      name: request.name,
      args: request.args,
      rawArgumentsText: request.rawArgumentsText,
      argumentParseError: request.argumentParseError,
      output: {
        message: error instanceof Error ? error.message : String(error),
      },
      isError: true,
    };
  }
}

export function createToolLoopBridge(
  backend: ToolLoopBackend,
  tools: CopilotToolSet,
  maxSteps = 20
): ToolLoopDispatch {
  return (
    request: LlmRequest,
    signalOrOptions?: AbortSignal | CopilotToolExecuteOptions,
    maybeMessages?: CopilotToolExecuteOptions['messages']
  ) => {
    const toolExecuteOptions = normalizeToolExecuteOptions(
      signalOrOptions,
      maybeMessages
    );
    const execute = createToolExecutionCallback(tools, toolExecuteOptions);
    const toolLoopRequest = { ...request, stream: true };

    if ('routes' in backend) {
      return llmDispatchToolLoopStreamRouted(
        backend.routes,
        toolLoopRequest,
        execute,
        maxSteps,
        toolExecuteOptions.signal
      );
    }

    if ('preparedRoutes' in backend) {
      return llmDispatchToolLoopStreamPrepared(
        backend.preparedRoutes,
        execute,
        maxSteps,
        toolExecuteOptions.signal
      );
    }

    return llmDispatchToolLoopStream(
      backend.protocol,
      backend.backendConfig,
      toolLoopRequest,
      execute,
      maxSteps,
      toolExecuteOptions.signal
    );
  };
}

// re-export for test consumers
export type { LlmToolCallbackRequest } from '../../../../native';
export type { CopilotToolSet, CopilotToolExecuteOptions } from '../../tools';
