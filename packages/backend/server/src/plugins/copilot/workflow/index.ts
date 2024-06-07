import { Injectable, Logger } from '@nestjs/common';

import { PromptService } from '../prompt';
import { CopilotProviderService } from '../providers';
import { CopilotChatOptions } from '../types';
import { WorkflowGraphs } from './graph';
import { WorkflowNode } from './node';
import { WorkflowGraph, WorkflowGraphList } from './types';
import { CopilotWorkflow } from './workflow';

@Injectable()
export class CopilotWorkflowService {
  private readonly logger = new Logger(CopilotWorkflowService.name);
  constructor(
    private readonly prompt: PromptService,
    private readonly provider: CopilotProviderService
  ) {}

  private initWorkflow({ name, graph }: WorkflowGraphList[number]) {
    const workflow = new Map();
    for (const nodeData of graph) {
      const { edges: _, ...data } = nodeData;
      const node = new WorkflowNode(data);
      workflow.set(node.id, node);
    }

    // add edges
    for (const nodeData of graph) {
      const node = workflow.get(nodeData.id);
      if (!node) {
        this.logger.error(
          `Failed to init workflow ${name}: node ${nodeData.id} not found`
        );
        throw new Error(`Node ${nodeData.id} not found`);
      }
      for (const edgeId of nodeData.edges) {
        const edge = workflow.get(edgeId);
        if (!edge) {
          this.logger.error(
            `Failed to init workflow ${name}: edge ${edgeId} not found in node ${nodeData.id}`
          );
          throw new Error(`Edge ${edgeId} not found`);
        }
        node.addEdge(edge);
      }
    }
    return workflow;
  }

  // todo: get workflow from database
  private async getWorkflow(graphName: string): Promise<WorkflowGraph> {
    const graph = WorkflowGraphs.find(g => g.name === graphName);
    if (!graph) {
      throw new Error(`Graph ${graphName} not found`);
    }

    return this.initWorkflow(graph);
  }

  async *runGraph(
    params: Record<string, string>,
    graphName: string,
    options?: CopilotChatOptions
  ): AsyncIterable<string> {
    const workflowGraph = await this.getWorkflow(graphName);
    const workflow = new CopilotWorkflow(
      this.prompt,
      this.provider,
      workflowGraph
    );

    for await (const result of workflow.runGraph(params, options)) {
      yield result;
    }
  }
}
