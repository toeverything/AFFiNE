import { Injectable } from '@nestjs/common';

import type { NodeTextMiddleware } from '../../config';
import type {
  CopilotChatOptions,
  CopilotChatTools,
} from '../../providers/types';
import type { CopilotTool, CopilotToolSet } from '../../tools';
import type { ToolLoopBackend } from '../tool/bridge';
import { ToolRuntime } from '../tool-runtime';

export type ProviderSpecificToolResolver = (
  toolName: CopilotChatTools,
  model: string
) => [string, CopilotTool?] | undefined;

@Injectable()
export class ToolExecutorHost {
  constructor(private readonly runtime: ToolRuntime) {}

  async getTools(
    options: CopilotChatOptions,
    model: string,
    resolveProviderSpecificTool?: ProviderSpecificToolResolver
  ): Promise<CopilotToolSet> {
    return await this.runtime.getTools(
      options,
      model,
      resolveProviderSpecificTool
    );
  }

  createNativeAdapter(
    backend: ToolLoopBackend,
    tools: CopilotToolSet,
    options: {
      maxSteps?: number;
      nodeTextMiddleware?: NodeTextMiddleware[];
    } = {}
  ) {
    return this.runtime.createNativeAdapter(backend, tools, options);
  }
}
