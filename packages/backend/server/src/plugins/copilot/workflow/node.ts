import { ChatPrompt, PromptService } from '../prompt';
import { CopilotProviderService } from '../providers';
import { CopilotAllProvider, CopilotChatOptions } from '../types';
import {
  NodeData,
  WorkflowNodeState,
  WorkflowNodeType,
  WorkflowResult,
  WorkflowResultType,
} from './types';

export class WorkflowNode {
  private readonly edges: WorkflowNode[] = [];
  private readonly parents: WorkflowNode[] = [];
  private prompt: ChatPrompt | null = null;
  private provider: CopilotAllProvider | null = null;

  constructor(private readonly data: NodeData) {}

  get id(): string {
    return this.data.id;
  }

  get name(): string {
    return this.data.name;
  }

  get config(): NodeData {
    return Object.assign({}, this.data);
  }

  get parent(): WorkflowNode[] {
    return this.parents;
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
    } else if (!this.data.condition) {
      throw new Error(`Decision block must have a condition`);
    }
    node.parent = this;
    this.edges.push(node);
    return this.edges.length;
  }

  async initNode(prompt: PromptService, provider: CopilotProviderService) {
    if (this.prompt && this.provider) return;

    if (this.data.nodeType === WorkflowNodeType.Basic) {
      this.prompt = await prompt.get(this.data.promptName);
      if (!this.prompt) {
        throw new Error(
          `Prompt ${this.data.promptName} not found when running workflow node ${this.name}`
        );
      }
      this.provider = await provider.getProviderByModel(this.prompt.model);
      if (!this.provider) {
        throw new Error(
          `Provider not found for model ${this.prompt.model} when running workflow node ${this.name}`
        );
      }
    }
  }

  private async evaluateCondition(
    _condition?: string
  ): Promise<string | undefined> {
    // todo: evaluate condition to impl decision block
    return this.edges[0]?.id;
  }

  async *next(
    params: WorkflowNodeState,
    options?: CopilotChatOptions
  ): AsyncIterable<WorkflowResult> {
    if (!this.prompt || !this.provider) {
      throw new Error(`Node ${this.name} not initialized`);
    }

    yield { type: WorkflowResultType.StartRun, nodeId: this.id };

    // choose next node in graph
    let nextNode: WorkflowNode | undefined = this.edges[0];
    if (this.data.nodeType === WorkflowNodeType.Decision) {
      const nextNodeId = await this.evaluateCondition(this.data.condition);
      // return empty to choose default edge
      if (nextNodeId) {
        nextNode = this.edges.find(node => node.id === nextNodeId);
        if (!nextNode) {
          throw new Error(`No edge found for condition ${this.data.condition}`);
        }
      }
    } else {
      // pass through content as a stream response if no next node
      const passthrough = !nextNode;
      if (this.data.type === 'text' && 'generateText' in this.provider) {
        if (this.data.paramKey) {
          // update params with custom key
          yield {
            type: WorkflowResultType.Params,
            params: {
              [this.data.paramKey]: await this.provider.generateText(
                this.prompt.finish(params),
                this.prompt.model,
                options
              ),
            },
          };
        } else {
          for await (const content of this.provider.generateTextStream(
            this.prompt.finish(params),
            this.prompt.model,
            options
          )) {
            yield {
              type: WorkflowResultType.Content,
              nodeId: this.id,
              content,
              passthrough,
            };
          }
        }
      } else if (
        this.data.type === 'image' &&
        'generateImages' in this.provider
      ) {
        if (this.data.paramKey) {
          yield {
            type: WorkflowResultType.Params,
            params: {
              [this.data.paramKey]: await this.provider.generateImages(
                this.prompt.finish(params),
                this.prompt.model,
                options
              ),
            },
          };
        } else {
          for await (const content of this.provider.generateImagesStream(
            this.prompt.finish(params),
            this.prompt.model,
            options
          )) {
            yield {
              type: WorkflowResultType.Content,
              nodeId: this.id,
              content,
              passthrough,
            };
          }
        }
      }
    }

    yield { type: WorkflowResultType.EndRun, nextNode };
  }
}
