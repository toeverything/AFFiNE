import { effects as tooltipEffects } from '@blocksuite/affine-components/tooltip';

import { AIChatBlockComponent } from './blocks/ai-chat-block/ai-chat-block';
import { EdgelessAIChatBlockComponent } from './blocks/ai-chat-block/ai-chat-edgeless-block';
import { LitTranscriptionBlock } from './blocks/ai-chat-block/ai-transcription-block';
import {
  AIChatBlockMessage,
  AIChatBlockMessages,
} from './blocks/ai-chat-block/components/ai-chat-messages';
import {
  ChatImage,
  ChatImages,
} from './blocks/ai-chat-block/components/chat-images';
import { ImagePlaceholder } from './blocks/ai-chat-block/components/image-placeholder';
import { UserInfo } from './blocks/ai-chat-block/components/user-info';
import { ChatPanel } from './chat-panel';
import { ActionWrapper } from './chat-panel/actions/action-wrapper';
import { ActionImage } from './chat-panel/actions/image';
import { ActionImageToText } from './chat-panel/actions/image-to-text';
import { ActionMakeReal } from './chat-panel/actions/make-real';
import { ActionMindmap } from './chat-panel/actions/mindmap';
import { ActionSlides } from './chat-panel/actions/slides';
import { ActionText } from './chat-panel/actions/text';
import { AILoading } from './chat-panel/ai-loading';
import { AIChatPanelTitle } from './chat-panel/ai-title';
import { ChatMessageAction } from './chat-panel/message/action';
import { ChatMessageAssistant } from './chat-panel/message/assistant';
import { ChatMessageUser } from './chat-panel/message/user';
import { ChatPanelSplitView } from './chat-panel/split-view';
import { ArtifactSkeleton } from './components/ai-artifact-skeleton';
import { AIChatAddContext } from './components/ai-chat-add-context';
import { ChatPanelAddPopover } from './components/ai-chat-chips/add-popover';
import { ChatPanelAttachmentChip } from './components/ai-chat-chips/attachment-chip';
import { ChatPanelCandidatesPopover } from './components/ai-chat-chips/candidates-popover';
import { ChatPanelChips } from './components/ai-chat-chips/chat-panel-chips';
import { ChatPanelChip } from './components/ai-chat-chips/chip';
import { ChatPanelCollectionChip } from './components/ai-chat-chips/collection-chip';
import { ChatPanelDocChip } from './components/ai-chat-chips/doc-chip';
import { ChatPanelFileChip } from './components/ai-chat-chips/file-chip';
import { ChatPanelSelectedChip } from './components/ai-chat-chips/selected-chip';
import { ChatPanelTagChip } from './components/ai-chat-chips/tag-chip';
import { AIChatComposer } from './components/ai-chat-composer';
import { AIChatContent } from './components/ai-chat-content';
import { AIChatInput } from './components/ai-chat-input';
import { AIChatEmbeddingStatusTooltip } from './components/ai-chat-input/embedding-status-tooltip';
import { ChatInputPreference } from './components/ai-chat-input/preference-popup';
import { AIChatMessages } from './components/ai-chat-messages/ai-chat-messages';
import { AIChatToolbar, AISessionHistory } from './components/ai-chat-toolbar';
import { AIHistoryClear } from './components/ai-history-clear';
import { effects as componentAiItemEffects } from './components/ai-item';
import { AssistantAvatar } from './components/ai-message-content/assistant-avatar';
import { ChatContentImages } from './components/ai-message-content/images';
import { ChatContentPureText } from './components/ai-message-content/pure-text';
import { ChatContentRichText } from './components/ai-message-content/rich-text';
import { ChatContentStreamObjects } from './components/ai-message-content/stream-objects';
import { AIScrollableTextRenderer } from './components/ai-scrollable-text-renderer';
import { ArtifactPreviewPanel } from './components/ai-tools/artifacts-preview-panel';
import {
  CodeArtifactTool,
  CodeHighlighter,
} from './components/ai-tools/code-artifact';
import { DocComposeTool } from './components/ai-tools/doc-compose';
import { DocEditTool } from './components/ai-tools/doc-edit';
import { DocKeywordSearchResult } from './components/ai-tools/doc-keyword-search-result';
import { DocReadResult } from './components/ai-tools/doc-read-result';
import { DocSemanticSearchResult } from './components/ai-tools/doc-semantic-search-result';
import { SectionEditTool } from './components/ai-tools/section-edit';
import { ToolCallCard } from './components/ai-tools/tool-call-card';
import { ToolFailedCard } from './components/ai-tools/tool-failed-card';
import { ToolResultCard } from './components/ai-tools/tool-result-card';
import { WebCrawlTool } from './components/ai-tools/web-crawl';
import { WebSearchTool } from './components/ai-tools/web-search';
import { AskAIButton } from './components/ask-ai-button';
import { AskAIIcon } from './components/ask-ai-icon';
import { AskAIPanel } from './components/ask-ai-panel';
import { AskAIToolbarButton } from './components/ask-ai-toolbar';
import { ChatActionList } from './components/chat-action-list';
import { ChatCopyMore } from './components/copy-more';
import { ImagePreviewGrid } from './components/image-preview-grid';
import { effects as componentPlaygroundEffects } from './components/playground';
import { TextRenderer } from './components/text-renderer';
import { AIErrorWrapper } from './messages/error';
import { AISlidesRenderer } from './messages/slides-renderer';
import { AIAnswerWrapper } from './messages/wrapper';
import { registerMiniMindmapBlocks } from './mini-mindmap';
import { AIChatBlockPeekView } from './peek-view/chat-block-peek-view';
import { DateTime } from './peek-view/date-time';
import {
  AFFINE_AI_PANEL_WIDGET,
  AffineAIPanelWidget,
} from './widgets/ai-panel/ai-panel';
import {
  AIPanelAnswer,
  AIPanelDivider,
  AIPanelError,
  AIPanelGenerating,
  AIPanelInput,
} from './widgets/ai-panel/components';
import { AIFinishTip } from './widgets/ai-panel/components/finish-tip';
import { GeneratingPlaceholder } from './widgets/ai-panel/components/generating-placeholder';
import {
  AFFINE_BLOCK_DIFF_WIDGET_FOR_BLOCK,
  AffineBlockDiffWidgetForBlock,
} from './widgets/block-diff/block';
import { BlockDiffOptions } from './widgets/block-diff/options';
import {
  AFFINE_BLOCK_DIFF_WIDGET_FOR_PAGE,
  AffineBlockDiffWidgetForPage,
} from './widgets/block-diff/page';
import {
  AFFINE_BLOCK_DIFF_PLAYGROUND,
  AFFINE_BLOCK_DIFF_PLAYGROUND_MODAL,
  BlockDiffPlayground,
  BlockDiffPlaygroundModal,
} from './widgets/block-diff/playground';
import {
  AFFINE_EDGELESS_COPILOT_WIDGET,
  EdgelessCopilotWidget,
} from './widgets/edgeless-copilot';
import { EdgelessCopilotPanel } from './widgets/edgeless-copilot-panel';
import { EdgelessCopilotToolbarEntry } from './widgets/edgeless-copilot-panel/toolbar-entry';

export function registerAIEffects() {
  registerMiniMindmapBlocks();
  componentAiItemEffects();
  componentPlaygroundEffects();
  tooltipEffects();

  customElements.define('ask-ai-icon', AskAIIcon);
  customElements.define('ask-ai-button', AskAIButton);
  customElements.define('ask-ai-toolbar-button', AskAIToolbarButton);
  customElements.define('ask-ai-panel', AskAIPanel);
  customElements.define('chat-action-list', ChatActionList);
  customElements.define('chat-copy-more', ChatCopyMore);
  customElements.define('image-preview-grid', ImagePreviewGrid);
  customElements.define('action-wrapper', ActionWrapper);
  customElements.define('action-image-to-text', ActionImageToText);
  customElements.define('action-image', ActionImage);
  customElements.define('action-make-real', ActionMakeReal);
  customElements.define('action-mindmap', ActionMindmap);
  customElements.define('action-slides', ActionSlides);
  customElements.define('action-text', ActionText);
  customElements.define('ai-loading', AILoading);
  customElements.define('ai-chat-content', AIChatContent);
  customElements.define('ai-chat-toolbar', AIChatToolbar);
  customElements.define('ai-session-history', AISessionHistory);
  customElements.define('ai-chat-messages', AIChatMessages);
  customElements.define('chat-panel', ChatPanel);
  customElements.define('ai-chat-panel-title', AIChatPanelTitle);
  customElements.define('ai-chat-input', AIChatInput);
  customElements.define('ai-chat-add-context', AIChatAddContext);
  customElements.define(
    'ai-chat-embedding-status-tooltip',
    AIChatEmbeddingStatusTooltip
  );
  customElements.define('ai-chat-composer', AIChatComposer);
  customElements.define('chat-panel-chips', ChatPanelChips);
  customElements.define('ai-history-clear', AIHistoryClear);
  customElements.define('chat-panel-add-popover', ChatPanelAddPopover);
  customElements.define('chat-input-preference', ChatInputPreference);
  customElements.define(
    'chat-panel-candidates-popover',
    ChatPanelCandidatesPopover
  );
  customElements.define('chat-panel-doc-chip', ChatPanelDocChip);
  customElements.define('chat-panel-file-chip', ChatPanelFileChip);
  customElements.define('chat-panel-tag-chip', ChatPanelTagChip);
  customElements.define('chat-panel-collection-chip', ChatPanelCollectionChip);
  customElements.define('chat-panel-selected-chip', ChatPanelSelectedChip);
  customElements.define('chat-panel-attachment-chip', ChatPanelAttachmentChip);
  customElements.define('chat-panel-chip', ChatPanelChip);
  customElements.define('ai-error-wrapper', AIErrorWrapper);
  customElements.define('ai-slides-renderer', AISlidesRenderer);
  customElements.define('ai-answer-wrapper', AIAnswerWrapper);
  customElements.define('ai-chat-block-peek-view', AIChatBlockPeekView);
  customElements.define('date-time', DateTime);
  customElements.define(
    'affine-edgeless-ai-chat',
    EdgelessAIChatBlockComponent
  );
  customElements.define('affine-ai-chat', AIChatBlockComponent);
  customElements.define('ai-chat-block-message', AIChatBlockMessage);
  customElements.define('ai-chat-block-messages', AIChatBlockMessages);
  customElements.define(
    'ai-scrollable-text-renderer',
    AIScrollableTextRenderer
  );
  customElements.define('image-placeholder', ImagePlaceholder);
  customElements.define('chat-image', ChatImage);
  customElements.define('chat-images', ChatImages);
  customElements.define('user-info', UserInfo);
  customElements.define('text-renderer', TextRenderer);

  customElements.define('generating-placeholder', GeneratingPlaceholder);
  customElements.define('ai-finish-tip', AIFinishTip);
  customElements.define('ai-panel-divider', AIPanelDivider);
  customElements.define('ai-panel-answer', AIPanelAnswer);
  customElements.define('ai-panel-input', AIPanelInput);
  customElements.define('ai-panel-generating', AIPanelGenerating);
  customElements.define('ai-panel-error', AIPanelError);
  customElements.define('chat-assistant-avatar', AssistantAvatar);
  customElements.define('chat-content-images', ChatContentImages);
  customElements.define('chat-content-pure-text', ChatContentPureText);
  customElements.define('chat-content-rich-text', ChatContentRichText);
  customElements.define(
    'chat-content-stream-objects',
    ChatContentStreamObjects
  );
  customElements.define('chat-message-action', ChatMessageAction);
  customElements.define('chat-message-assistant', ChatMessageAssistant);
  customElements.define('chat-message-user', ChatMessageUser);
  customElements.define('ai-block-diff-options', BlockDiffOptions);
  customElements.define(AFFINE_BLOCK_DIFF_PLAYGROUND, BlockDiffPlayground);
  customElements.define(
    AFFINE_BLOCK_DIFF_PLAYGROUND_MODAL,
    BlockDiffPlaygroundModal
  );

  customElements.define('tool-call-card', ToolCallCard);
  customElements.define('tool-result-card', ToolResultCard);
  customElements.define('tool-call-failed', ToolFailedCard);
  customElements.define('doc-semantic-search-result', DocSemanticSearchResult);
  customElements.define('doc-keyword-search-result', DocKeywordSearchResult);
  customElements.define('doc-read-result', DocReadResult);
  customElements.define('web-crawl-tool', WebCrawlTool);
  customElements.define('web-search-tool', WebSearchTool);
  customElements.define('section-edit-tool', SectionEditTool);
  customElements.define('doc-compose-tool', DocComposeTool);
  customElements.define('code-artifact-tool', CodeArtifactTool);
  customElements.define('code-highlighter', CodeHighlighter);
  customElements.define('artifact-preview-panel', ArtifactPreviewPanel);
  customElements.define('doc-edit-tool', DocEditTool);

  customElements.define(AFFINE_AI_PANEL_WIDGET, AffineAIPanelWidget);
  customElements.define(AFFINE_EDGELESS_COPILOT_WIDGET, EdgelessCopilotWidget);
  customElements.define(
    AFFINE_BLOCK_DIFF_WIDGET_FOR_BLOCK,
    AffineBlockDiffWidgetForBlock
  );
  customElements.define(
    AFFINE_BLOCK_DIFF_WIDGET_FOR_PAGE,
    AffineBlockDiffWidgetForPage
  );

  customElements.define('edgeless-copilot-panel', EdgelessCopilotPanel);
  customElements.define(
    'edgeless-copilot-toolbar-entry',
    EdgelessCopilotToolbarEntry
  );

  customElements.define('transcription-block', LitTranscriptionBlock);
  customElements.define('chat-panel-split-view', ChatPanelSplitView);
  customElements.define('artifact-skeleton', ArtifactSkeleton);
}
