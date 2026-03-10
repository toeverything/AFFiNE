import type { ZodTypeAny } from 'zod';
import { z } from 'zod';

import type { PromptMessage } from '../providers/types';

export type CopilotToolExecuteOptions = {
  signal?: AbortSignal;
  messages?: PromptMessage[];
};

export type CopilotTool = {
  description?: string;
  inputSchema?: ZodTypeAny | Record<string, unknown>;
  execute?: {
    bivarianceHack: (
      args: Record<string, unknown>,
      options: CopilotToolExecuteOptions
    ) => Promise<unknown> | unknown;
  }['bivarianceHack'];
};

export type CopilotToolSet = Record<string, CopilotTool>;

export function defineTool<TSchema extends ZodTypeAny, TResult>(tool: {
  description?: string;
  inputSchema: TSchema;
  execute: (
    args: z.infer<TSchema>,
    options: CopilotToolExecuteOptions
  ) => Promise<TResult> | TResult;
}): CopilotTool {
  return tool;
}
