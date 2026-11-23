import { z } from 'zod';

import type { CopilotToolSet } from '../../tools';
import { ensureToolJsonSchema } from '../../tools/tool';
import { ToolDefinitionBaseSchema } from './shared';

// Owner: tool authoring facade over runtime-owned callback contracts.
// Tool definitions are built from Node-hosted tools; callback request/response
// values are still validated against the runtime/native schema at the boundary.
export const ToolContractSchema = ToolDefinitionBaseSchema;

export type ToolContract = z.infer<typeof ToolContractSchema>;
export interface ToolCallRequest {
  callId: string;
  name: string;
  args: Record<string, unknown>;
  rawArgumentsText?: string;
  argumentParseError?: string;
}
export interface ToolCallResult extends ToolCallRequest {
  output: unknown;
  isError?: boolean;
}

export function parseToolContract(value: unknown) {
  return ToolContractSchema.parse(value);
}

export function buildToolContracts(toolSet: CopilotToolSet): ToolContract[] {
  return Object.entries(toolSet).map(([name, tool]) =>
    parseToolContract({
      name,
      description: tool.description,
      parameters: ensureToolJsonSchema(tool, name),
    })
  );
}
