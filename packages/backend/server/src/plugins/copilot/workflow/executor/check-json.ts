import { Injectable } from '@nestjs/common';

import { WorkflowNodeData, WorkflowNodeType, WorkflowParams } from '../types';
import { NodeExecuteResult, NodeExecuteState, NodeExecutorType } from './types';
import { AutoRegisteredWorkflowExecutor } from './utils';

@Injectable()
export class CopilotCheckJsonExecutor extends AutoRegisteredWorkflowExecutor {
  constructor() {
    super();
  }

  private async initExecutor(
    data: WorkflowNodeData
  ): Promise<WorkflowNodeData & { nodeType: WorkflowNodeType.Basic }> {
    if (data.nodeType !== WorkflowNodeType.Basic) {
      throw new Error(
        `Executor ${this.type} not support ${data.nodeType} node`
      );
    }
    return data;
  }

  override get type() {
    return NodeExecutorType.CheckJson;
  }

  private checkJson(
    content?: string | string[] | Record<string, any>
  ): boolean {
    try {
      if (content && typeof content === 'string') {
        JSON.parse(content);
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  override async *next(
    data: WorkflowNodeData,
    params: WorkflowParams
  ): AsyncIterable<NodeExecuteResult> {
    const { paramKey, id } = await this.initExecutor(data);

    const ret = String(this.checkJson(params.content));
    if (paramKey) {
      yield { type: NodeExecuteState.Params, params: { [paramKey]: ret } };
    } else {
      yield { type: NodeExecuteState.Content, nodeId: id, content: ret };
    }
  }
}
