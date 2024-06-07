import { Logger } from '@nestjs/common';

import { PromptService } from '../prompt';
import { CopilotProviderService } from '../providers';
import { CopilotChatOptions } from '../types';
import { WorkflowNode } from './node';
import {
  WorkflowGraph,
  WorkflowNodeState,
  WorkflowNodeType,
  WorkflowResultType,
} from './types';

export class CopilotWorkflow {
  private readonly logger = new Logger(CopilotWorkflow.name);
  private readonly rootNode: WorkflowNode;

  constructor(
    private readonly prompt: PromptService,
    private readonly provider: CopilotProviderService,
    workflow: WorkflowGraph
  ) {
    const startNode = workflow.get('start');
    if (!startNode) {
      throw new Error(`No start node found in graph`);
    }
    this.rootNode = startNode;
  }

  async *runGraph(
    params: Record<string, string>,
    options?: CopilotChatOptions
  ): AsyncIterable<string> {
    let currentNode: WorkflowNode | undefined = this.rootNode;
    const lastParams: WorkflowNodeState = { ...params };

    while (currentNode) {
      let result = '';
      let nextNode: WorkflowNode | undefined;

      await currentNode.initNode(this.prompt, this.provider);

      for await (const ret of currentNode.next(lastParams, options)) {
        if (ret.type === WorkflowResultType.EndRun) {
          nextNode = ret.nextNode;
          break;
        } else if (ret.type === WorkflowResultType.Params) {
          Object.assign(lastParams, ret.params);
          if (currentNode.config.nodeType === WorkflowNodeType.Basic) {
            const { type, promptName } = currentNode.config;
            this.logger.verbose(
              `[${currentNode.name}][${type}][${promptName}]: update params - '${JSON.stringify(ret.params)}'`
            );
          }
        } else if (ret.type === WorkflowResultType.Content) {
          if (ret.passthrough) {
            // pass through content as a stream response
            yield ret.content;
          } else {
            result += ret.content;
          }
        }
      }

      if (currentNode.config.nodeType === WorkflowNodeType.Basic && result) {
        const { type, promptName } = currentNode.config;
        this.logger.verbose(
          `[${currentNode.name}][${type}][${promptName}]: update content - '${lastParams.content}' -> '${result}'`
        );
      }

      currentNode = nextNode;
      if (result) lastParams.content = result;
    }
  }
}
