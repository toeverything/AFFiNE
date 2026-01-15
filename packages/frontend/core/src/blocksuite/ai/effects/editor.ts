import { AIChatBlockComponent } from '../blocks/ai-chat-block/ai-chat-block';
import { EdgelessAIChatBlockComponent } from '../blocks/ai-chat-block/ai-chat-edgeless-block';
import { LitTranscriptionBlock } from '../blocks/ai-chat-block/ai-transcription-block';
import {
  AIChatBlockMessage,
  AIChatBlockMessages,
} from '../blocks/ai-chat-block/components/ai-chat-messages';
import {
  ChatImage,
  ChatImages,
} from '../blocks/ai-chat-block/components/chat-images';
import { ImagePlaceholder } from '../blocks/ai-chat-block/components/image-placeholder';
import { UserInfo } from '../blocks/ai-chat-block/components/user-info';
import { effects as componentAiItemEffects } from '../components/ai-item';
import { AIScrollableTextRenderer } from '../components/ai-scrollable-text-renderer';
import { AskAIButton } from '../components/ask-ai-button';
import { AskAIIcon } from '../components/ask-ai-icon';
import { AskAIPanel } from '../components/ask-ai-panel';
import { AskAIToolbarButton } from '../components/ask-ai-toolbar';
import {
  AFFINE_AI_PANEL_WIDGET,
  AffineAIPanelWidget,
} from '../widgets/ai-panel/ai-panel';
import {
  AIPanelAnswer,
  AIPanelDivider,
  AIPanelError,
  AIPanelGenerating,
  AIPanelInput,
} from '../widgets/ai-panel/components';
import { AIFinishTip } from '../widgets/ai-panel/components/finish-tip';
import { GeneratingPlaceholder } from '../widgets/ai-panel/components/generating-placeholder';
import {
  AFFINE_BLOCK_DIFF_WIDGET_FOR_BLOCK,
  AffineBlockDiffWidgetForBlock,
} from '../widgets/block-diff/block';
import { BlockDiffOptions } from '../widgets/block-diff/options';
import {
  AFFINE_BLOCK_DIFF_WIDGET_FOR_PAGE,
  AffineBlockDiffWidgetForPage,
} from '../widgets/block-diff/page';
import {
  AFFINE_BLOCK_DIFF_PLAYGROUND,
  AFFINE_BLOCK_DIFF_PLAYGROUND_MODAL,
  BlockDiffPlayground,
  BlockDiffPlaygroundModal,
} from '../widgets/block-diff/playground';
import {
  AFFINE_EDGELESS_COPILOT_WIDGET,
  EdgelessCopilotWidget,
} from '../widgets/edgeless-copilot';
import { EdgelessCopilotPanel } from '../widgets/edgeless-copilot-panel';
import { EdgelessCopilotToolbarEntry } from '../widgets/edgeless-copilot-panel/toolbar-entry';
import { registerAISharedEffects } from './shared';

const editorRegistries = new WeakSet<CustomElementRegistry>();

export function registerAIEditorEffects() {
  const registry = customElements;
  if (editorRegistries.has(registry)) return;
  editorRegistries.add(registry);

  registerAISharedEffects();
  componentAiItemEffects();

  customElements.define('ask-ai-icon', AskAIIcon);
  customElements.define('ask-ai-button', AskAIButton);
  customElements.define('ask-ai-toolbar-button', AskAIToolbarButton);
  customElements.define('ask-ai-panel', AskAIPanel);
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
  customElements.define('generating-placeholder', GeneratingPlaceholder);
  customElements.define('ai-finish-tip', AIFinishTip);
  customElements.define('ai-panel-divider', AIPanelDivider);
  customElements.define('ai-panel-answer', AIPanelAnswer);
  customElements.define('ai-panel-input', AIPanelInput);
  customElements.define('ai-panel-generating', AIPanelGenerating);
  customElements.define('ai-panel-error', AIPanelError);
  customElements.define('ai-block-diff-options', BlockDiffOptions);
  customElements.define(AFFINE_BLOCK_DIFF_PLAYGROUND, BlockDiffPlayground);
  customElements.define(
    AFFINE_BLOCK_DIFF_PLAYGROUND_MODAL,
    BlockDiffPlaygroundModal
  );
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
}
