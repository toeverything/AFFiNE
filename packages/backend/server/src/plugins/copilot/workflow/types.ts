import type { WorkflowExecutorType } from './executor';
import type { WorkflowNode } from './node';

export enum WorkflowNodeType {
  Basic = 'basic',
  Decision = 'decision',
  Nope = 'nope',
}

export type NodeData = { id: string; name: string } & (
  | {
      nodeType: WorkflowNodeType.Basic;
      promptName: string;
      type: WorkflowExecutorType;
      // update the prompt params by output with the custom key
      paramKey?: string;
    }
  | {
      nodeType: WorkflowNodeType.Decision;
      condition:
        | ((nodeIds: string[], params: WorkflowNodeState) => string)
        | string;
    }
  // do nothing node
  | { nodeType: WorkflowNodeType.Nope }
);

export type WorkflowNodeState = Record<string, string>;

export type WorkflowGraphData = Array<NodeData & { edges: string[] }>;
export type WorkflowGraph = {
  name: string;
  // true if the graph has been modified
  modified?: boolean;
  graph: WorkflowGraphData;
};
export type WorkflowGraphs = Array<WorkflowGraph>;

export enum WorkflowResultType {
  StartRun,
  EndRun,
  Params,
  Content,
}

export type WorkflowResult =
  | { type: WorkflowResultType.StartRun; nodeId: string }
  | { type: WorkflowResultType.EndRun; nextNode?: WorkflowNode }
  | {
      type: WorkflowResultType.Params;
      params: Record<string, string | string[]>;
    }
  | {
      type: WorkflowResultType.Content;
      nodeId: string;
      content: string;
    };

export type WorkflowGraphInstances = Map<string, WorkflowNode>;
