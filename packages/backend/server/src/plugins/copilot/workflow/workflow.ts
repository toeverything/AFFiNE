import { Logger } from '@nestjs/common';

import { PromptService } from '../prompt';
import { CopilotProviderService } from '../providers';
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

  async *runGraph(initContent: string): AsyncIterable<string | undefined> {
    let currentNode: WorkflowNode | undefined = this.rootNode;
    const lastParams: WorkflowNodeState = { content: initContent };

    while (currentNode) {
      let result = '';
      let nextNode: WorkflowNode | undefined;

      await currentNode.initNode(this.prompt, this.provider);

      for await (const ret of currentNode.next(lastParams)) {
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
          // pass through content as a stream response
          if (ret.passthrough) {
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
