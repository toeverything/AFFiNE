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

const sharedRegistries = new WeakSet<CustomElementRegistry>();

export function registerAISharedEffects() {
  const registry = customElements;
  if (sharedRegistries.has(registry)) return;
  sharedRegistries.add(registry);

  registerMiniMindmapBlocks();
  tooltipEffects();

  customElements.define('ai-error-wrapper', AIErrorWrapper);
  customElements.define('ai-slides-renderer', AISlidesRenderer);
  customElements.define('ai-answer-wrapper', AIAnswerWrapper);
  customElements.define('chat-content-images', ChatContentImages);
  customElements.define('chat-content-pure-text', ChatContentPureText);
  customElements.define('chat-content-rich-text', ChatContentRichText);
  customElements.define(
    'chat-content-stream-objects',
    ChatContentStreamObjects
  );
  customElements.define('text-renderer', TextRenderer);
  customElements.define('tool-call-card', ToolCallCard);
  customElements.define('tool-result-card', ToolResultCard);
  customElements.define('tool-call-failed', ToolFailedCard);
  customElements.define('doc-semantic-search-result', DocSemanticSearchResult);
  customElements.define('doc-keyword-search-result', DocKeywordSearchResult);
  customElements.define('doc-read-result', DocReadResult);
  customElements.define('doc-write-tool', DocWriteTool);
  customElements.define('web-crawl-tool', WebCrawlTool);
  customElements.define('web-search-tool', WebSearchTool);
  customElements.define('section-edit-tool', SectionEditTool);
  customElements.define('doc-compose-tool', DocComposeTool);
  customElements.define('code-artifact-tool', CodeArtifactTool);
  customElements.define('code-highlighter', CodeHighlighter);
  customElements.define('artifact-preview-panel', ArtifactPreviewPanel);
  customElements.define('doc-edit-tool', DocEditTool);
  customElements.define('artifact-skeleton', ArtifactSkeleton);
}
