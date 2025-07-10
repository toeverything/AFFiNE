import { ToolSet } from 'ai';

import { createCodeArtifactTool } from './code-artifact';
import { createConversationSummaryTool } from './conversation-summary';
import { createDocComposeTool } from './doc-compose';
import { createDocEditTool } from './doc-edit';
import { createDocKeywordSearchTool } from './doc-keyword-search';
import { createDocReadTool } from './doc-read';
import { createDocSemanticSearchTool } from './doc-semantic-search';
import { createExaCrawlTool } from './exa-crawl';
import { createExaSearchTool } from './exa-search';

export interface CustomAITools extends ToolSet {
  code_artifact: ReturnType<typeof createCodeArtifactTool>;
  conversation_summary: ReturnType<typeof createConversationSummaryTool>;
  doc_edit: ReturnType<typeof createDocEditTool>;
  doc_semantic_search: ReturnType<typeof createDocSemanticSearchTool>;
  doc_keyword_search: ReturnType<typeof createDocKeywordSearchTool>;
  doc_read: ReturnType<typeof createDocReadTool>;
  doc_compose: ReturnType<typeof createDocComposeTool>;
  web_search_exa: ReturnType<typeof createExaSearchTool>;
  web_crawl_exa: ReturnType<typeof createExaCrawlTool>;
}

export * from './code-artifact';
export * from './conversation-summary';
export * from './doc-compose';
export * from './doc-edit';
export * from './doc-keyword-search';
export * from './doc-read';
export * from './doc-semantic-search';
export * from './error';
export * from './exa-crawl';
export * from './exa-search';
