import { Injectable } from '@nestjs/common';

import { ChatPrompt, PromptService } from '../../prompt';
import {
  CopilotChatOptions,
  CopilotProvider,
  CopilotProviderFactory,
} from '../../providers';
import { WorkflowNodeData, WorkflowNodeType } from '../types';
import { NodeExecuteResult, NodeExecuteState, NodeExecutorType } from './types';
import { AutoRegisteredWorkflowExecutor } from './utils';

@Injectable()
export class CopilotChatTextExecutor extends AutoRegisteredWorkflowExecutor {
  constructor(
    private readonly promptService: PromptService,
    private readonly providerFactory: CopilotProviderFactory
  ) {
    super();
  }

  private async initExecutor(
    data: WorkflowNodeData
  ): Promise<
    [
      WorkflowNodeData & { nodeType: WorkflowNodeType.Basic },
      ChatPrompt,
      CopilotProvider,
    ]
  > {
    if (data.nodeType !== WorkflowNodeType.Basic) {
      throw new Error(
        `Executor ${this.type} not support ${data.nodeType} node`
      );
    }

    if (!data.promptName) {
      throw new Error(
        `Prompt name not found when running workflow node ${data.name}`
      );
    }
    const prompt = await this.promptService.get(data.promptName);
    if (!prompt) {
      throw new Error(
        `Prompt ${data.promptName} not found when running workflow node ${data.name}`
      );
    }
    const provider = await this.providerFactory.getProviderByModel(
      prompt.model
    );
    if (provider && 'text' in provider) {
      return [data, prompt, provider];
    }

    throw new Error(
      `Provider not found for model ${prompt.model} when running workflow node ${data.name}`
    );
  }

  override get type() {
    return NodeExecutorType.ChatText;
  }

  override async *next(
    data: WorkflowNodeData,
    params: Record<string, string>,
    options?: CopilotChatOptions
  ): AsyncIterable<NodeExecuteResult> {
    const [{ paramKey, paramToucher, id }, prompt, provider] =
      await this.initExecutor(data);

    const finalMessage = prompt.finish(params);
    const config = { ...prompt.config, ...options };
    if (paramKey) {
      // update params with custom key
      const result = {
        [paramKey]: await provider.text(
          { modelId: prompt.model },
          finalMessage,
          config
        ),
      };
      yield {
        type: NodeExecuteState.Params,
        params: paramToucher?.(result) ?? result,
      };
    } else {
      for await (const content of provider.streamText(
        { modelId: prompt.model },
        finalMessage,
        config
      )) {
        yield { type: NodeExecuteState.Content, nodeId: id, content };
      }
    }
  }
}
