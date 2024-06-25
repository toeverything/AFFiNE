import path, { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Logger } from '@nestjs/common';
import Piscina from 'piscina';

import { CopilotChatOptions } from '../types';
import type { NodeExecuteResult, NodeExecutor } from './executor';
import { getWorkflowExecutor, NodeExecuteState } from './executor';
import type {
  WorkflowGraph,
  WorkflowNodeData,
  WorkflowNodeState,
} from './types';
import { WorkflowNodeType } from './types';

export class WorkflowNode {
  private readonly logger = new Logger(WorkflowNode.name);
  private readonly edges: WorkflowNode[] = [];
  private readonly parents: WorkflowNode[] = [];
  private readonly executor: NodeExecutor | null = null;
  private readonly condition:
    | ((params: WorkflowNodeState) => Promise<any>)
    | null = null;

  constructor(
    graph: WorkflowGraph,
    private readonly data: WorkflowNodeData
  ) {
    if (data.nodeType === WorkflowNodeType.Basic) {
      this.executor = getWorkflowExecutor(data.type);
    } else if (data.nodeType === WorkflowNodeType.Decision) {
      // prepare decision condition, reused in each run
      const iife = `return (${data.condition})(nodeIds, params)`;
      // only eval the condition in worker if graph has been modified
      if (graph.modified) {
        const worker = new Piscina({
          filename: path.resolve(
            dirname(fileURLToPath(import.meta.url)),
            'worker.mjs'
          ),
          minThreads: 2,
          // empty envs from parent process
          env: {},
          argv: [],
          execArgv: [],
        });
        this.condition = (params: WorkflowNodeState) =>
          worker.run({
            iife,
            nodeIds: this.edges.map(node => node.id),
            params,
          });
      } else {
        const func =
          typeof data.condition === 'function'
            ? data.condition
            : new Function('nodeIds', 'params', iife);
        this.condition = (params: WorkflowNodeState) =>
          func(
            this.edges.map(node => node.id),
            params
          );
      }
    }
  }

  get id(): string {
    return this.data.id;
  }

  get name(): string {
    return this.data.name;
  }

  get config(): WorkflowNodeData {
    return Object.assign({}, this.data);
  }

  get parent(): WorkflowNode[] {
    return this.parents;
  }

  // if is the end of the workflow, pass through the content to stream response
  get hasEdges(): boolean {
    return !!this.edges.length;
  }

  private set parent(node: WorkflowNode) {
    if (!this.parents.includes(node)) {
      this.parents.push(node);
    }
  }

  addEdge(node: WorkflowNode): number {
    if (this.data.nodeType === WorkflowNodeType.Basic) {
      if (this.edges.length > 0) {
        throw new Error(`Basic block can only have one edge`);
      }
    } else if (
      this.data.nodeType === WorkflowNodeType.Decision &&
      !this.data.condition
    ) {
      throw new Error(`Decision block must have a condition`);
    } else if (this.data.nodeType === WorkflowNodeType.Nope) {
      throw new Error(`Nope block cannot have edges`);
    }
    node.parent = this;
    this.edges.push(node);
    return this.edges.length;
  }

  private async evaluateCondition(
    params: WorkflowNodeState
  ): Promise<string | undefined> {
    // early return if no edges
    if (this.edges.length === 0) return undefined;
    try {
      const result = await this.condition?.(params);
      if (typeof result === 'string') return result;
      // choose default edge if condition falsy
      return this.edges[0].id;
    } catch (e) {
      this.logger.error(
        `Failed to evaluate condition for node ${this.name}: ${e}`
      );
      throw e;
    }
  }

  async *next(
    params: WorkflowNodeState,
    options?: CopilotChatOptions
  ): AsyncIterable<NodeExecuteResult> {
    yield { type: NodeExecuteState.StartRun, nodeId: this.id };

    // choose next node in graph
    let nextNode: WorkflowNode | undefined = this.edges[0];
    if (this.data.nodeType === WorkflowNodeType.Decision) {
      const nextNodeId = await this.evaluateCondition(params);
      // return empty to choose default edge
      if (nextNodeId) {
        nextNode = this.edges.find(node => node.id === nextNodeId);
        if (!nextNode) {
          throw new Error(`No edge found for condition ${this.data.condition}`);
        }
      }
    } else if (this.data.nodeType === WorkflowNodeType.Basic) {
      if (!this.executor) {
        throw new Error(`Node ${this.name} not initialized`);
      }

      yield* this.executor.next(this.data, params, options);
    } else {
      yield {
        type: NodeExecuteState.Content,
        nodeId: this.id,
        content: params.content,
      };
    }

    yield { type: NodeExecuteState.EndRun, nextNode };
  }
}
