import { Injectable } from '@nestjs/common';

import { ChatPrompt, PromptService } from '../../prompt';
import { CopilotProviderService } from '../../providers';
import { CopilotChatOptions, CopilotTextProvider } from '../../types';
import {
  NodeData,
  WorkflowNodeType,
  WorkflowResult,
  WorkflowResultType,
} from '../types';
import { WorkflowExecutorType } from './types';
import { AutoRegisteredWorkflowExecutor } from './utils';

@Injectable()
export class CopilotChatTextExecutor extends AutoRegisteredWorkflowExecutor {
  constructor(
    private readonly promptService: PromptService,
    private readonly providerService: CopilotProviderService
  ) {
    super();
  }

  private async initExecutor(
    data: NodeData
  ): Promise<
    [
      NodeData & { nodeType: WorkflowNodeType.Basic },
      ChatPrompt,
      CopilotTextProvider,
    ]
  > {
    if (data.nodeType !== WorkflowNodeType.Basic) {
      throw new Error(
        `Executor ${this.type} not support ${data.nodeType} node`
      );
    }

    const prompt = await this.promptService.get(data.promptName);
    if (!prompt) {
      throw new Error(
        `Prompt ${data.promptName} not found when running workflow node ${data.name}`
      );
    }
    const provider = await this.providerService.getProviderByModel(
      prompt.model
    );
    if (provider && 'generateText' in provider) {
      return [data, prompt, provider];
    }

    throw new Error(
      `Provider not found for model ${prompt.model} when running workflow node ${data.name}`
    );
  }

  override get type() {
    return WorkflowExecutorType.ChatText;
  }

  override async *next(
    data: NodeData,
    params: Record<string, string>,
    options?: CopilotChatOptions
  ): AsyncIterable<WorkflowResult> {
    const [{ paramKey, id }, prompt, provider] = await this.initExecutor(data);

    const finalMessage = prompt.finish(params);
    if (paramKey) {
      // update params with custom key
      yield {
        type: WorkflowResultType.Params,
        params: {
          [paramKey]: await provider.generateText(
            finalMessage,
            prompt.model,
            options
          ),
        },
      };
    } else {
      for await (const content of provider.generateTextStream(
        finalMessage,
        prompt.model,
        options
      )) {
        yield {
          type: WorkflowResultType.Content,
          nodeId: id,
          content,
        };
      }
    }
  }
}
