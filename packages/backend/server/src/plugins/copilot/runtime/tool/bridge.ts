import { z } from 'zod';

import {
  type LlmToolCallbackRequest,
  type LlmToolCallbackResponse,
} from '../../../../native';
import type {
  CopilotTool,
  CopilotToolExecuteOptions,
  CopilotToolSet,
} from '../../tools';

export async function executeToolCall(
  tools: CopilotToolSet,
  request: LlmToolCallbackRequest,
  options: CopilotToolExecuteOptions
): Promise<LlmToolCallbackResponse> {
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

export type { LlmToolCallbackRequest } from '../../../../native';
export type { CopilotToolExecuteOptions, CopilotToolSet } from '../../tools';
