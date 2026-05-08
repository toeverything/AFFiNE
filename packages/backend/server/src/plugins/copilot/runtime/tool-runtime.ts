import { Injectable } from '@nestjs/common';

import { Config } from '../../../base';
import { DocReader, DocWriter } from '../../../core/doc';
import { AccessController } from '../../../core/permission';
import { Models } from '../../../models';
import { IndexerService } from '../../indexer';
import type { NodeTextMiddleware } from '../config';
import { CopilotContextService } from '../context/service';
import {
  type CopilotChatOptions,
  type CopilotChatTools,
} from '../providers/types';
import {
  buildBlobContentGetter,
  buildDocContentGetter,
  buildDocCreateHandler,
  buildDocKeywordSearchGetter,
  buildDocSearchGetter,
  buildDocUpdateHandler,
  buildDocUpdateMetaHandler,
  type CopilotTool,
  type CopilotToolSet,
  createBlobReadTool,
  createCodeArtifactTool,
  createConversationSummaryTool,
  createDocComposeTool,
  createDocCreateTool,
  createDocKeywordSearchTool,
  createDocReadTool,
  createDocSemanticSearchTool,
  createDocUpdateMetaTool,
  createDocUpdateTool,
  createExaCrawlTool,
  createExaSearchTool,
  createSectionEditTool,
} from '../tools';
import { PromptRuntime } from './prompt-runtime';
import type { ToolLoopBackend } from './tool/bridge';
import { createNativeToolLoopAdapter } from './tool/native-adapter';

export type ProviderSpecificToolResolver = (
  toolName: CopilotChatTools,
  model: string
) => [string, CopilotTool?] | undefined;

@Injectable()
export class ToolRuntime {
  constructor(
    private readonly config: Config,
    private readonly ac: AccessController,
    private readonly context: CopilotContextService,
    private readonly docReader: DocReader,
    private readonly docWriter: DocWriter,
    private readonly models: Models,
    private readonly promptRuntime: PromptRuntime,
    private readonly indexerService: IndexerService
  ) {}

  async getTools(
    options: CopilotChatOptions,
    model: string,
    resolveProviderSpecificTool?: ProviderSpecificToolResolver
  ): Promise<CopilotToolSet> {
    const tools: CopilotToolSet = {};
    if (!options?.tools?.length) {
      return tools;
    }
    const runPromptText = (
      promptName: string,
      params: Record<string, unknown>
    ) =>
      this.promptRuntime.runText(promptName, params, {
        providerOptions: {
          user: options.user,
          session: options.session,
          workspace: options.workspace,
          byokLeaseId: options.byokLeaseId,
          billingUnitId: options.billingUnitId,
          quotaBackedRoutesAllowed: options.quotaBackedRoutesAllowed,
          featureKind: options.featureKind,
        },
      });

    for (const tool of options.tools) {
      const toolDef = resolveProviderSpecificTool?.(tool, model);
      if (toolDef) {
        if (toolDef[1]) {
          tools[toolDef[0]] = toolDef[1];
        }
        continue;
      }

      if (
        !(env.dev || env.namespaces.canary) &&
        ['docCreate', 'docUpdate', 'docUpdateMeta'].includes(tool)
      ) {
        continue;
      }

      switch (tool) {
        case 'blobRead': {
          const docContext = options.session
            ? await this.context.getBySessionId(options.session)
            : null;
          const getBlobContent = buildBlobContentGetter(this.ac, docContext);
          tools.blob_read = createBlobReadTool(
            getBlobContent.bind(null, options)
          );
          break;
        }
        case 'codeArtifact': {
          tools.code_artifact = createCodeArtifactTool(runPromptText);
          break;
        }
        case 'conversationSummary': {
          tools.conversation_summary = createConversationSummaryTool(
            options.session,
            runPromptText
          );
          break;
        }
        case 'docSemanticSearch': {
          const searchDocs = buildDocSearchGetter(
            this.ac,
            this.context,
            options.session,
            this.models
          );
          tools.doc_semantic_search = createDocSemanticSearchTool(
            searchDocs.bind(null, options)
          );
          break;
        }
        case 'docKeywordSearch': {
          if (this.config.indexer.enabled) {
            const searchDocs = buildDocKeywordSearchGetter(
              this.ac,
              this.indexerService,
              this.models
            );
            tools.doc_keyword_search = createDocKeywordSearchTool(
              searchDocs.bind(null, options)
            );
          }
          break;
        }
        case 'docRead': {
          const getDoc = buildDocContentGetter(
            this.ac,
            this.docReader,
            this.models
          );
          tools.doc_read = createDocReadTool(getDoc.bind(null, options));
          break;
        }
        case 'docCreate': {
          const createDoc = buildDocCreateHandler(this.ac, this.docWriter);
          tools.doc_create = createDocCreateTool(createDoc.bind(null, options));
          break;
        }
        case 'docUpdate': {
          const updateDoc = buildDocUpdateHandler(this.ac, this.docWriter);
          tools.doc_update = createDocUpdateTool(updateDoc.bind(null, options));
          break;
        }
        case 'docUpdateMeta': {
          const updateDocMeta = buildDocUpdateMetaHandler(
            this.ac,
            this.docWriter
          );
          tools.doc_update_meta = createDocUpdateMetaTool(
            updateDocMeta.bind(null, options)
          );
          break;
        }
        case 'webSearch': {
          tools.web_search_exa = createExaSearchTool(this.config);
          tools.web_crawl_exa = createExaCrawlTool(this.config);
          break;
        }
        case 'docCompose': {
          tools.doc_compose = createDocComposeTool(runPromptText);
          break;
        }
        case 'sectionEdit': {
          tools.section_edit = createSectionEditTool(runPromptText);
          break;
        }
      }
    }

    return tools;
  }

  createNativeAdapter(
    backend: ToolLoopBackend,
    tools: CopilotToolSet,
    options: {
      maxSteps?: number;
      nodeTextMiddleware?: NodeTextMiddleware[];
    } = {}
  ) {
    return createNativeToolLoopAdapter(backend, tools, options);
  }
}
