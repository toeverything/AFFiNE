import { ActionWrapper } from '../chat-panel/actions/action-wrapper';
import { ActionImage } from '../chat-panel/actions/image';
import { ActionImageToText } from '../chat-panel/actions/image-to-text';
import { ActionMakeReal } from '../chat-panel/actions/make-real';
import { ActionMindmap } from '../chat-panel/actions/mindmap';
import { ActionSlides } from '../chat-panel/actions/slides';
import { ActionText } from '../chat-panel/actions/text';
import { AILoading } from '../chat-panel/ai-loading';
import { ChatMessageAction } from '../chat-panel/message/action';
import { ChatMessageAssistant } from '../chat-panel/message/assistant';
import { ChatMessageUser } from '../chat-panel/message/user';
import { AIChatAddContext } from '../components/ai-chat-add-context';
import { ChatPanelAddPopover } from '../components/ai-chat-chips/add-popover';
import { ChatPanelAttachmentChip } from '../components/ai-chat-chips/attachment-chip';
import { ChatPanelCandidatesPopover } from '../components/ai-chat-chips/candidates-popover';
import { ChatPanelChips } from '../components/ai-chat-chips/chat-panel-chips';
import { ChatPanelChip } from '../components/ai-chat-chips/chip';
import { ChatPanelCollectionChip } from '../components/ai-chat-chips/collection-chip';
import { ChatPanelDocChip } from '../components/ai-chat-chips/doc-chip';
import { ChatPanelFileChip } from '../components/ai-chat-chips/file-chip';
import { ChatPanelSelectedChip } from '../components/ai-chat-chips/selected-chip';
import { ChatPanelTagChip } from '../components/ai-chat-chips/tag-chip';
import { AIChatComposer } from '../components/ai-chat-composer';
import { AIChatContent } from '../components/ai-chat-content';
import { ChatPanelSplitView } from '../components/ai-chat-content/split-view';
import { AIChatInput } from '../components/ai-chat-input';
import { AIChatEmbeddingStatusTooltip } from '../components/ai-chat-input/embedding-status-tooltip';
import { ChatInputPreference } from '../components/ai-chat-input/preference-popup';
import { AIChatMessages } from '../components/ai-chat-messages/ai-chat-messages';
import { AIChatToolbar, AISessionHistory } from '../components/ai-chat-toolbar';
import { AIHistoryClear } from '../components/ai-history-clear';
import { AssistantAvatar } from '../components/ai-message-content/assistant-avatar';
import { ChatActionList } from '../components/chat-action-list';
import { ChatCopyMore } from '../components/copy-more';
import { ImagePreviewGrid } from '../components/image-preview-grid';
import { effects as componentPlaygroundEffects } from '../components/playground';
import { AIChatBlockPeekView } from '../peek-view/chat-block-peek-view';
import { DateTime } from '../peek-view/date-time';
import { registerAISharedEffects } from './shared';

let appRegistered = false;

export function registerAIAppEffects() {
  if (appRegistered) return;
  appRegistered = true;

  registerAISharedEffects();
  componentPlaygroundEffects();

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
  customElements.define('chat-assistant-avatar', AssistantAvatar);
  customElements.define('chat-message-action', ChatMessageAction);
  customElements.define('chat-message-assistant', ChatMessageAssistant);
  customElements.define('chat-message-user', ChatMessageUser);
  customElements.define('ai-chat-block-peek-view', AIChatBlockPeekView);
  customElements.define('date-time', DateTime);
  customElements.define('chat-panel-split-view', ChatPanelSplitView);
}
