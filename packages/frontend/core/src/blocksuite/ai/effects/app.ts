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
import { type AppEffectElementTag, appEffectElementTags } from './registry';
import { registerAISharedEffects } from './shared';

const appRegistries = new WeakSet<CustomElementRegistry>();
const appElements = {
  'chat-action-list': ChatActionList,
  'chat-copy-more': ChatCopyMore,
  'image-preview-grid': ImagePreviewGrid,
  'action-wrapper': ActionWrapper,
  'action-image-to-text': ActionImageToText,
  'action-image': ActionImage,
  'action-make-real': ActionMakeReal,
  'action-mindmap': ActionMindmap,
  'action-slides': ActionSlides,
  'action-text': ActionText,
  'ai-loading': AILoading,
  'ai-chat-content': AIChatContent,
  'ai-chat-toolbar': AIChatToolbar,
  'ai-session-history': AISessionHistory,
  'ai-chat-messages': AIChatMessages,
  'ai-chat-input': AIChatInput,
  'ai-chat-add-context': AIChatAddContext,
  'ai-chat-embedding-status-tooltip': AIChatEmbeddingStatusTooltip,
  'ai-chat-composer': AIChatComposer,
  'chat-panel-chips': ChatPanelChips,
  'ai-history-clear': AIHistoryClear,
  'chat-panel-add-popover': ChatPanelAddPopover,
  'chat-input-preference': ChatInputPreference,
  'chat-panel-candidates-popover': ChatPanelCandidatesPopover,
  'chat-panel-doc-chip': ChatPanelDocChip,
  'chat-panel-file-chip': ChatPanelFileChip,
  'chat-panel-tag-chip': ChatPanelTagChip,
  'chat-panel-collection-chip': ChatPanelCollectionChip,
  'chat-panel-selected-chip': ChatPanelSelectedChip,
  'chat-panel-attachment-chip': ChatPanelAttachmentChip,
  'chat-panel-chip': ChatPanelChip,
  'chat-assistant-avatar': AssistantAvatar,
  'chat-message-action': ChatMessageAction,
  'chat-message-assistant': ChatMessageAssistant,
  'chat-message-user': ChatMessageUser,
  'ai-chat-block-peek-view': AIChatBlockPeekView,
  'date-time': DateTime,
  'chat-panel-split-view': ChatPanelSplitView,
} satisfies Record<AppEffectElementTag, CustomElementConstructor>;

export function registerAIAppEffects() {
  const registry = customElements;
  if (appRegistries.has(registry)) return;
  appRegistries.add(registry);

  registerAISharedEffects();
  componentPlaygroundEffects();

  for (const tag of appEffectElementTags) {
    customElements.define(tag, appElements[tag]);
  }
}
