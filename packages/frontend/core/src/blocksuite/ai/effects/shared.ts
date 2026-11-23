import { effects as tooltipEffects } from '@blocksuite/affine-components/tooltip';

import { ArtifactSkeleton } from '../components/ai-artifact-skeleton';
import { ChatContentImages } from '../components/ai-message-content/images';
import { ChatContentPureText } from '../components/ai-message-content/pure-text';
import { ChatContentRichText } from '../components/ai-message-content/rich-text';
import { ChatContentStreamObjects } from '../components/ai-message-content/stream-objects';
import { ArtifactPreviewPanel } from '../components/ai-tools/artifacts-preview-panel';
import {
  CodeArtifactTool,
  CodeHighlighter,
} from '../components/ai-tools/code-artifact';
import { DocComposeTool } from '../components/ai-tools/doc-compose';
import { DocEditTool } from '../components/ai-tools/doc-edit';
import { DocKeywordSearchResult } from '../components/ai-tools/doc-keyword-search-result';
import { DocReadResult } from '../components/ai-tools/doc-read-result';
import { DocSemanticSearchResult } from '../components/ai-tools/doc-semantic-search-result';
import { DocWriteTool } from '../components/ai-tools/doc-write';
import { SectionEditTool } from '../components/ai-tools/section-edit';
import { ToolCallCard } from '../components/ai-tools/tool-call-card';
import { ToolFailedCard } from '../components/ai-tools/tool-failed-card';
import { ToolResultCard } from '../components/ai-tools/tool-result-card';
import { WebCrawlTool } from '../components/ai-tools/web-crawl';
import { WebSearchTool } from '../components/ai-tools/web-search';
import { TextRenderer } from '../components/text-renderer';
import { AIErrorWrapper } from '../messages/error';
import { AISlidesRenderer } from '../messages/slides-renderer';
import { AIAnswerWrapper } from '../messages/wrapper';
import { registerMiniMindmapBlocks } from '../mini-mindmap';
import {
  type SharedEffectElementTag,
  sharedEffectElementTags,
} from './registry';

const sharedRegistries = new WeakSet<CustomElementRegistry>();
const sharedElements = {
  'ai-error-wrapper': AIErrorWrapper,
  'ai-slides-renderer': AISlidesRenderer,
  'ai-answer-wrapper': AIAnswerWrapper,
  'chat-content-images': ChatContentImages,
  'chat-content-pure-text': ChatContentPureText,
  'chat-content-rich-text': ChatContentRichText,
  'chat-content-stream-objects': ChatContentStreamObjects,
  'text-renderer': TextRenderer,
  'tool-call-card': ToolCallCard,
  'tool-result-card': ToolResultCard,
  'tool-call-failed': ToolFailedCard,
  'doc-semantic-search-result': DocSemanticSearchResult,
  'doc-keyword-search-result': DocKeywordSearchResult,
  'doc-read-result': DocReadResult,
  'doc-write-tool': DocWriteTool,
  'web-crawl-tool': WebCrawlTool,
  'web-search-tool': WebSearchTool,
  'section-edit-tool': SectionEditTool,
  'doc-compose-tool': DocComposeTool,
  'code-artifact-tool': CodeArtifactTool,
  'code-highlighter': CodeHighlighter,
  'artifact-preview-panel': ArtifactPreviewPanel,
  'doc-edit-tool': DocEditTool,
  'artifact-skeleton': ArtifactSkeleton,
} satisfies Record<SharedEffectElementTag, CustomElementConstructor>;

export function registerAISharedEffects() {
  const registry = customElements;
  if (sharedRegistries.has(registry)) return;
  sharedRegistries.add(registry);

  registerMiniMindmapBlocks();
  tooltipEffects();

  for (const tag of sharedEffectElementTags) {
    customElements.define(tag, sharedElements[tag]);
  }
}
