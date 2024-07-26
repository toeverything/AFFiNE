import { CopilotChatOptions } from '../../types';
import type { WorkflowNode } from '../node';
import { WorkflowNodeData, WorkflowParams } from '../types';

export enum NodeExecutorType {
  ChatText = 'ChatText',
  ChatImage = 'ChatImage',
  CheckJson = 'CheckJson',
  CheckHtml = 'CheckHtml',
}

export enum NodeExecuteState {
  StartRun,
  EndRun,
  Params,
  Content,
  Attachment,
}

export type NodeExecuteResult =
  | { type: NodeExecuteState.StartRun; nodeId: string }
  | { type: NodeExecuteState.EndRun; nextNode?: WorkflowNode }
  | { type: NodeExecuteState.Params; params: WorkflowParams }
  | { type: NodeExecuteState.Content; nodeId: string; content: string }
  | { type: NodeExecuteState.Attachment; nodeId: string; attachment: string };

export abstract class NodeExecutor {
  abstract get type(): NodeExecutorType;
  abstract next(
    data: WorkflowNodeData,
    params: WorkflowParams,
    options?: CopilotChatOptions
  ): AsyncIterable<NodeExecuteResult>;
}
