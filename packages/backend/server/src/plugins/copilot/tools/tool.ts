import type { ZodTypeAny } from 'zod';
import { z } from 'zod';

import type { PromptMessage } from '../providers/types';
import { toToolJsonSchema } from './json-schema';

export type CopilotToolExecuteOptions = {
  signal?: AbortSignal;
  messages?: PromptMessage[];
};

export type CopilotTool = {
  description?: string;
  jsonSchema?: Record<string, unknown>;
  inputSchema?: ZodTypeAny | Record<string, unknown>;
  execute?: {
    bivarianceHack: (
      args: Record<string, unknown>,
      options: CopilotToolExecuteOptions
    ) => Promise<unknown> | unknown;
  }['bivarianceHack'];
};

export type CopilotToolSet = Record<string, CopilotTool>;

export function ensureToolJsonSchema(
  tool: Pick<CopilotTool, 'jsonSchema' | 'inputSchema'>,
  name?: string
): Record<string, unknown> {
  if (tool.jsonSchema) {
    return tool.jsonSchema;
  }

  throw new Error(
    `Tool ${name ?? '<anonymous>'} is missing precomputed jsonSchema`
  );
}

export function defineTool<TSchema extends ZodTypeAny, TResult>(tool: {
  description?: string;
  jsonSchema?: Record<string, unknown>;
  inputSchema: TSchema;
  execute: (
    args: z.infer<TSchema>,
    options: CopilotToolExecuteOptions
  ) => Promise<TResult> | TResult;
}): CopilotTool {
  return {
    ...tool,
    jsonSchema: tool.jsonSchema ?? toToolJsonSchema(tool.inputSchema),
  };
}
