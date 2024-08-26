import { Injectable } from '@nestjs/common';
import { XMLValidator } from 'fast-xml-parser';
import { HtmlValidate } from 'html-validate/node';

import { WorkflowNodeData, WorkflowNodeType, WorkflowParams } from '../types';
import { NodeExecuteResult, NodeExecuteState, NodeExecutorType } from './types';
import { AutoRegisteredWorkflowExecutor } from './utils';

@Injectable()
export class CopilotCheckHtmlExecutor extends AutoRegisteredWorkflowExecutor {
  private readonly html = new HtmlValidate();

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
    return NodeExecutorType.CheckHtml;
  }

  private async checkHtml(
    content?: string | string[] | Record<string, any>,
    strict?: boolean
  ): Promise<boolean> {
    try {
      if (content && typeof content === 'string') {
        const ret = XMLValidator.validate(content);
        if (ret === true) {
          if (strict) {
            const report = await this.html.validateString(content, {
              extends: ['html-validate:standard'],
            });
            return report.valid;
          }
          return true;
        }
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

    const ret = String(await this.checkHtml(params.content, !!params.strict));
    if (paramKey) {
      yield { type: NodeExecuteState.Params, params: { [paramKey]: ret } };
    } else {
      yield { type: NodeExecuteState.Content, nodeId: id, content: ret };
    }
  }
}
