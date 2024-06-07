import type { WorkflowNode } from './node';

export enum WorkflowNodeType {
  Basic,
  Decision,
}

export type NodeData = { id: string; name: string } & (
  | {
      nodeType: WorkflowNodeType.Basic;
      promptName: string;
      type: 'text' | 'image';
      // update the prompt params by output with the custom key
      paramKey?: string;
    }
  | { nodeType: WorkflowNodeType.Decision; condition: string }
);

export type WorkflowNodeState = Record<string, string>;

export type WorkflowGraphData = Array<NodeData & { edges: string[] }>;
export type WorkflowGraphList = Array<{
  name: string;
  graph: WorkflowGraphData;
}>;

export enum WorkflowResultType {
  StartRun,
  EndRun,
  Params,
  Content,
}

export type WorkflowResult =
  | { type: WorkflowResultType.StartRun; nodeId: string }
  | { type: WorkflowResultType.EndRun; nextNode: WorkflowNode }
  | {
      type: WorkflowResultType.Params;
      params: Record<string, string | string[]>;
    }
  | {
      type: WorkflowResultType.Content;
      nodeId: string;
      content: string;
      // if is the end of the workflow, pass through the content to stream response
      passthrough?: boolean;
    };

export type WorkflowGraph = Map<string, WorkflowNode>;
