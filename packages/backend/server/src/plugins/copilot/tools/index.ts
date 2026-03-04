import { ToolSet } from 'ai';

import { createBlobReadTool } from './blob-read';
import { createCodeArtifactTool } from './code-artifact';
import { createConversationSummaryTool } from './conversation-summary';
import { createDocComposeTool } from './doc-compose';
import { createDocEditTool } from './doc-edit';
import { createDocKeywordSearchTool } from './doc-keyword-search';
import { createDocReadTool } from './doc-read';
import { createDocSemanticSearchTool } from './doc-semantic-search';
import {
  createDocCreateTool,
  createDocUpdateMetaTool,
  createDocUpdateTool,
} from './doc-write';
import { createExaCrawlTool } from './exa-crawl';
import { createExaSearchTool } from './exa-search';
import { createSectionEditTool } from './section-edit';

export interface CustomAITools extends ToolSet {
  blob_read: ReturnType<typeof createBlobReadTool>;
  code_artifact: ReturnType<typeof createCodeArtifactTool>;
  conversation_summary: ReturnType<typeof createConversationSummaryTool>;
  doc_edit: ReturnType<typeof createDocEditTool>;
  doc_semantic_search: ReturnType<typeof createDocSemanticSearchTool>;
  doc_keyword_search: ReturnType<typeof createDocKeywordSearchTool>;
  doc_read: ReturnType<typeof createDocReadTool>;
  doc_create: ReturnType<typeof createDocCreateTool>;
  doc_update: ReturnType<typeof createDocUpdateTool>;
  doc_update_meta: ReturnType<typeof createDocUpdateMetaTool>;
  doc_compose: ReturnType<typeof createDocComposeTool>;
  section_edit: ReturnType<typeof createSectionEditTool>;
  web_search_exa: ReturnType<typeof createExaSearchTool>;
  web_crawl_exa: ReturnType<typeof createExaCrawlTool>;
}

export * from './blob-read';
export * from './code-artifact';
export * from './conversation-summary';
export * from './doc-compose';
export * from './doc-edit';
export * from './doc-keyword-search';
export * from './doc-read';
export * from './doc-semantic-search';
export * from './doc-write';
export * from './error';
export * from './exa-crawl';
export * from './exa-search';
export * from './section-edit';
