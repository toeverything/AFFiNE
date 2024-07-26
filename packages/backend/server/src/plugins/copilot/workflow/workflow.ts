import { Logger } from '@nestjs/common';

import { CopilotChatOptions } from '../types';
import { NodeExecuteState } from './executor';
import { WorkflowNode } from './node';
import type { WorkflowGraphInstances, WorkflowNodeState } from './types';
import { WorkflowNodeType } from './types';

export enum GraphExecutorState {
  EnterNode = 'EnterNode',
  EmitContent = 'EmitContent',
  EmitAttachment = 'EmitAttachment',
  ExitNode = 'ExitNode',
}

export type GraphExecutorStatus = { status: GraphExecutorState } & (
  | { status: GraphExecutorState.EnterNode; node: WorkflowNode }
  | { status: GraphExecutorState.EmitContent; content: string }
  | { status: GraphExecutorState.EmitAttachment; attachment: string }
  | { status: GraphExecutorState.ExitNode; node: WorkflowNode }
);

export class WorkflowGraphExecutor {
  private readonly logger = new Logger(WorkflowGraphExecutor.name);
  private readonly rootNode: WorkflowNode;

  constructor(workflow: WorkflowGraphInstances) {
    const startNode = workflow.get('start');
    if (!startNode) {
      throw new Error(`No start node found in graph`);
    }
    this.rootNode = startNode;
  }

  async *runGraph(
    params: Record<string, string>,
    options?: CopilotChatOptions
  ): AsyncIterable<GraphExecutorStatus> {
    let currentNode: WorkflowNode | undefined = this.rootNode;
    const lastParams: WorkflowNodeState = { ...params };

    while (currentNode) {
      let result = '';
      let nextNode: WorkflowNode | undefined;

      for await (const ret of currentNode.next(lastParams, options)) {
        if (ret.type === NodeExecuteState.StartRun) {
          yield { status: GraphExecutorState.EnterNode, node: currentNode };
        } else if (ret.type === NodeExecuteState.EndRun) {
          yield { status: GraphExecutorState.ExitNode, node: currentNode };
          nextNode = ret.nextNode;
          break;
        } else if (ret.type === NodeExecuteState.Params) {
          Object.assign(lastParams, ret.params);
          if (currentNode.config.nodeType === WorkflowNodeType.Basic) {
            const { type, promptName } = currentNode.config;
            this.logger.verbose(
              `[${currentNode.name}][${type}][${promptName}]: update params - '${JSON.stringify(ret.params)}'`
            );
          }
        } else if (ret.type === NodeExecuteState.Content) {
          if (!currentNode.hasEdges) {
            // pass through content as a stream response if node is end node
            yield {
              status: GraphExecutorState.EmitContent,
              content: ret.content,
            };
          } else {
            result += ret.content;
          }
        } else if (
          ret.type === NodeExecuteState.Attachment &&
          !currentNode.hasEdges
        ) {
          // pass through content as a stream response if node is end node
          yield {
            status: GraphExecutorState.EmitAttachment,
            attachment: ret.attachment,
          };
        }
      }

      if (currentNode.config.nodeType === WorkflowNodeType.Basic && result) {
        const { type, promptName } = currentNode.config;
        this.logger.verbose(
          `[${currentNode.name}][${type}][${promptName}]: update content - '${lastParams.content}' -> '${result}'`
        );
      }

      currentNode = nextNode;
      if (result && lastParams.content !== result) {
        lastParams.content = result;
      }
    }
  }
}
