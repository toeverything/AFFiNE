import { Injectable, Logger } from '@nestjs/common';

import { CopilotChatOptions } from '../providers';
import { WorkflowGraphList } from './graph';
import { WorkflowNode } from './node';
import type { WorkflowGraph, WorkflowGraphInstances } from './types';
import { type GraphExecutorStatus, WorkflowGraphExecutor } from './workflow';

@Injectable()
export class CopilotWorkflowService {
  private readonly logger = new Logger(CopilotWorkflowService.name);

  initWorkflow(graph: WorkflowGraph) {
    const workflow = new Map<string, WorkflowNode>();
    for (const nodeData of graph.graph) {
      const { edges: _, ...data } = nodeData;
      const node = new WorkflowNode(graph, data);
      workflow.set(node.id, node);
    }

    // add edges
    for (const nodeData of graph.graph) {
      const node = workflow.get(nodeData.id);
      if (!node) {
        this.logger.error(
          `Failed to init workflow ${graph.name}: node ${nodeData.id} not found`
        );
        throw new Error(`Node ${nodeData.id} not found`);
      }
      for (const edgeId of nodeData.edges) {
        const edge = workflow.get(edgeId);
        if (!edge) {
          this.logger.error(
            `Failed to init workflow ${graph.name}: edge ${edgeId} not found in node ${nodeData.id}`
          );
          throw new Error(`Edge ${edgeId} not found`);
        }
        node.addEdge(edge);
      }
    }
    return workflow;
  }

  // TODO(@darkskygit): get workflow from database
  private async getWorkflow(
    graphName: string
  ): Promise<WorkflowGraphInstances> {
    const graph = WorkflowGraphList.find(g => g.name === graphName);
    if (!graph) {
      throw new Error(`Graph ${graphName} not found`);
    }

    return this.initWorkflow(graph);
  }

  async *runGraph(
    params: Record<string, string>,
    graphName: string,
    options?: CopilotChatOptions
  ): AsyncIterable<GraphExecutorStatus> {
    const workflowGraph = await this.getWorkflow(graphName);
    const executor = new WorkflowGraphExecutor(workflowGraph);

    for await (const result of executor.runGraph(params, options)) {
      yield result;
    }
  }
}
