import { CopilotChatOptions } from '../../types';
import { NodeData, WorkflowResult } from '../types';

export enum WorkflowExecutorType {
  ChatText = 'ChatText',
}

export abstract class WorkflowExecutor {
  abstract get type(): WorkflowExecutorType;
  abstract next(
    data: NodeData,
    params: Record<string, string | string[]>,
    options?: CopilotChatOptions
  ): AsyncIterable<WorkflowResult>;
}
