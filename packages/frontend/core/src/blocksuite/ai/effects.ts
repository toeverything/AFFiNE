import { SpecProvider } from '@blocksuite/affine/shared/utils';

import { AIChatBlockComponent } from './blocks/ai-chat-block/ai-chat-block';
import { EdgelessAIChatBlockComponent } from './blocks/ai-chat-block/ai-chat-edgeless-block';
import { LitTranscriptionBlock } from './blocks/ai-chat-block/ai-transcription-block';
import {
  AIChatMessage,
  AIChatMessages,
} from './blocks/ai-chat-block/components/ai-chat-messages';
import {
  ChatImage,
  ChatImages,
} from './blocks/ai-chat-block/components/chat-images';
import { ImagePlaceholder } from './blocks/ai-chat-block/components/image-placeholder';
import { UserInfo } from './blocks/ai-chat-block/components/user-info';
import { AIChatBlockSchemaExtension } from './blocks/ai-chat-block/model';
import { ChatPanel } from './chat-panel';
import { ActionWrapper } from './chat-panel/actions/action-wrapper';
import { ActionImage } from './chat-panel/actions/image';
import { ActionImageToText } from './chat-panel/actions/image-to-text';
import { ActionMakeReal } from './chat-panel/actions/make-real';
import { ActionMindmap } from './chat-panel/actions/mindmap';
import { ActionSlides } from './chat-panel/actions/slides';
import { ActionText } from './chat-panel/actions/text';
import { AILoading } from './chat-panel/ai-loading';
import { ChatPanelChips } from './chat-panel/chat-panel-chips';
import { ChatPanelInput } from './chat-panel/chat-panel-input';
import { ChatPanelMessages } from './chat-panel/chat-panel-messages';
import { ChatPanelAddPopover } from './chat-panel/components/add-popover';
import { ChatPanelChip } from './chat-panel/components/chip';
import { ChatPanelCollectionChip } from './chat-panel/components/collection-chip';
import { ChatPanelDocChip } from './chat-panel/components/doc-chip';
import { ChatPanelFileChip } from './chat-panel/components/file-chip';
import { ChatPanelTagChip } from './chat-panel/components/tag-chip';
import { AssistantAvatar } from './chat-panel/content/assistant-avatar';
import { ChatContentImages } from './chat-panel/content/images';
import { ChatContentPureText } from './chat-panel/content/pure-text';
import { ChatContentRichText } from './chat-panel/content/rich-text';
import { ChatMessageAction } from './chat-panel/message/action';
import { ChatMessageAssistant } from './chat-panel/message/assistant';
import { ChatMessageUser } from './chat-panel/message/user';
import { effects as componentAiItemEffects } from './components/ai-item';
import { AIScrollableTextRenderer } from './components/ai-scrollable-text-renderer';
import { AskAIButton } from './components/ask-ai-button';
import { AskAIIcon } from './components/ask-ai-icon';
import { AskAIPanel } from './components/ask-ai-panel';
import { AskAIToolbarButton } from './components/ask-ai-toolbar';
import { ChatActionList } from './components/chat-action-list';
import { ChatCopyMore } from './components/copy-more';
import { ImagePreviewGrid } from './components/image-preview-grid';
import { TextRenderer } from './components/text-renderer';
import { AIErrorWrapper } from './messages/error';
import { AISlidesRenderer } from './messages/slides-renderer';
import { AIAnswerWrapper } from './messages/wrapper';
import { registerMiniMindmapBlocks } from './mini-mindmap';
import { ChatBlockInput } from './peek-view/chat-block-input';
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
  AFFINE_EDGELESS_COPILOT_WIDGET,
  EdgelessCopilotWidget,
} from './widgets/edgeless-copilot';
import { EdgelessCopilotPanel } from './widgets/edgeless-copilot-panel';
import { EdgelessCopilotToolbarEntry } from './widgets/edgeless-copilot-panel/toolbar-entry';

export function registerAIEffects() {
  registerMiniMindmapBlocks();
  componentAiItemEffects();

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
  customElements.define('chat-panel-input', ChatPanelInput);
  customElements.define('chat-panel-messages', ChatPanelMessages);
  customElements.define('chat-panel', ChatPanel);
  customElements.define('chat-panel-chips', ChatPanelChips);
  customElements.define('chat-panel-add-popover', ChatPanelAddPopover);
  customElements.define('chat-panel-doc-chip', ChatPanelDocChip);
  customElements.define('chat-panel-file-chip', ChatPanelFileChip);
  customElements.define('chat-panel-tag-chip', ChatPanelTagChip);
  customElements.define('chat-panel-collection-chip', ChatPanelCollectionChip);
  customElements.define('chat-panel-chip', ChatPanelChip);
  customElements.define('ai-error-wrapper', AIErrorWrapper);
  customElements.define('ai-slides-renderer', AISlidesRenderer);
  customElements.define('ai-answer-wrapper', AIAnswerWrapper);
  customElements.define('chat-block-input', ChatBlockInput);
  customElements.define('ai-chat-block-peek-view', AIChatBlockPeekView);
  customElements.define('date-time', DateTime);
  customElements.define(
    'affine-edgeless-ai-chat',
    EdgelessAIChatBlockComponent
  );
  customElements.define('affine-ai-chat', AIChatBlockComponent);
  customElements.define('ai-chat-message', AIChatMessage);
  customElements.define('ai-chat-messages', AIChatMessages);
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
  customElements.define('chat-message-action', ChatMessageAction);
  customElements.define('chat-message-assistant', ChatMessageAssistant);
  customElements.define('chat-message-user', ChatMessageUser);

  customElements.define(AFFINE_AI_PANEL_WIDGET, AffineAIPanelWidget);
  customElements.define(AFFINE_EDGELESS_COPILOT_WIDGET, EdgelessCopilotWidget);

  customElements.define('edgeless-copilot-panel', EdgelessCopilotPanel);
  customElements.define(
    'edgeless-copilot-toolbar-entry',
    EdgelessCopilotToolbarEntry
  );

  customElements.define('transcription-block', LitTranscriptionBlock);

  SpecProvider._.extendSpec('store', [AIChatBlockSchemaExtension]);
}
