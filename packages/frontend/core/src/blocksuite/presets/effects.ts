import { TextRenderer } from './_common/components/text-renderer';
import { AskAIButton } from './ai/_common/components/ask-ai-button';
import { AskAIPanel } from './ai/_common/components/ask-ai-panel';
import { ChatActionList } from './ai/_common/components/chat-action-list';
import { ChatCopyMore } from './ai/_common/components/copy-more';
import { ChatPanel } from './ai/chat-panel';
import { ActionWrapper } from './ai/chat-panel/actions/action-wrapper';
import { ChatText } from './ai/chat-panel/actions/chat-text';
import { ActionImage } from './ai/chat-panel/actions/image';
import { ActionImageToText } from './ai/chat-panel/actions/image-to-text';
import { ActionMakeReal } from './ai/chat-panel/actions/make-real';
import { ActionMindmap } from './ai/chat-panel/actions/mindmap';
import { ActionSlides } from './ai/chat-panel/actions/slides';
import { ActionText } from './ai/chat-panel/actions/text';
import { AILoading } from './ai/chat-panel/ai-loading';
import { ChatCards } from './ai/chat-panel/chat-cards';
import { ChatPanelInput } from './ai/chat-panel/chat-panel-input';
import { ChatPanelMessages } from './ai/chat-panel/chat-panel-messages';
import { AIErrorWrapper } from './ai/messages/error';
import { AISlidesRenderer } from './ai/messages/slides-renderer';
import { AIAnswerWrapper } from './ai/messages/wrapper';
import { ChatBlockInput } from './ai/peek-view/chat-block-input';
import { AIChatBlockPeekView } from './ai/peek-view/chat-block-peek-view';
import { DateTime } from './ai/peek-view/date-time';
import { AIChatBlockComponent } from './blocks/ai-chat-block/ai-chat-block';
import { EdgelessAIChatBlockComponent } from './blocks/ai-chat-block/ai-chat-edgeless-block';
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

export function registerBlocksuitePresetsCustomComponents() {
  customElements.define('ask-ai-button', AskAIButton);
  customElements.define('ask-ai-panel', AskAIPanel);
  customElements.define('chat-action-list', ChatActionList);
  customElements.define('chat-copy-more', ChatCopyMore);
  customElements.define('action-wrapper', ActionWrapper);
  customElements.define('chat-text', ChatText);
  customElements.define('action-image-to-text', ActionImageToText);
  customElements.define('action-image', ActionImage);
  customElements.define('action-make-real', ActionMakeReal);
  customElements.define('action-mindmap', ActionMindmap);
  customElements.define('action-slides', ActionSlides);
  customElements.define('action-text', ActionText);
  customElements.define('ai-loading', AILoading);
  customElements.define('chat-cards', ChatCards);
  customElements.define('chat-panel-input', ChatPanelInput);
  customElements.define('chat-panel-messages', ChatPanelMessages);
  customElements.define('chat-panel', ChatPanel);
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
  customElements.define('image-placeholder', ImagePlaceholder);
  customElements.define('chat-image', ChatImage);
  customElements.define('chat-images', ChatImages);
  customElements.define('user-info', UserInfo);
  customElements.define('text-renderer', TextRenderer);
}
