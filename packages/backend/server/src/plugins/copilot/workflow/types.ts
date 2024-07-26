import type { NodeExecutorType } from './executor';
import type { WorkflowNode } from './node';

// ===================== node =====================

export enum WorkflowNodeType {
  Basic = 'basic',
  Decision = 'decision',
  Nope = 'nope',
}

export type WorkflowNodeData = { id: string; name: string } & (
  | {
      nodeType: WorkflowNodeType.Basic;
      type: NodeExecutorType;
      promptName?: string;
      // update the prompt params by output with the custom key
      paramKey?: string;
      paramToucher?: (params: WorkflowParams) => WorkflowParams;
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

export type WorkflowGraphInstances = Map<string, WorkflowNode>;

// ===================== graph =====================

export type WorkflowGraphDefinition = Array<
  WorkflowNodeData & { edges: string[] }
>;
export type WorkflowGraph = {
  name: string;
  // true if the graph has been modified
  modified?: boolean;
  graph: WorkflowGraphDefinition;
};
export type WorkflowGraphs = Array<WorkflowGraph>;

// ===================== executor =====================

export type WorkflowParams = Record<
  string,
  string | string[] | Record<string, any>
>;
export type WorkflowNodeState = Record<string, string>;
