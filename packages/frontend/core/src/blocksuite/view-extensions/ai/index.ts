import { toolbarAIEntryConfig } from '@affine/core/blocksuite/ai';
import { AIChatBlockSpec } from '@affine/core/blocksuite/ai/blocks';
import { AITranscriptionBlockSpec } from '@affine/core/blocksuite/ai/blocks/ai-chat-block/ai-transcription-block';
import { edgelessToolbarAIEntryConfig } from '@affine/core/blocksuite/ai/entries/edgeless';
import { imageToolbarAIEntryConfig } from '@affine/core/blocksuite/ai/entries/image-toolbar/setup-image-toolbar';
import { AICodeBlockWatcher } from '@affine/core/blocksuite/ai/extensions/ai-code';
import { getAIEdgelessRootWatcher } from '@affine/core/blocksuite/ai/extensions/ai-edgeless-root';
import { getAIPageRootWatcher } from '@affine/core/blocksuite/ai/extensions/ai-page-root';
import { AiSlashMenuConfigExtension } from '@affine/core/blocksuite/ai/extensions/ai-slash-menu';
import { CopilotTool } from '@affine/core/blocksuite/ai/tool/copilot-tool';
import { aiPanelWidget } from '@affine/core/blocksuite/ai/widgets/ai-panel/ai-panel';
import { edgelessCopilotWidget } from '@affine/core/blocksuite/ai/widgets/edgeless-copilot';
import {
  type ViewExtensionContext,
  ViewExtensionProvider,
} from '@blocksuite/affine/ext-loader';
import { ToolbarModuleExtension } from '@blocksuite/affine/shared/services';
import { BlockFlavourIdentifier } from '@blocksuite/affine/std';
import { FrameworkProvider } from '@toeverything/infra';
import { z } from 'zod';

import {
  BlockDiffService,
  BlockDiffWatcher,
} from '../../ai/services/block-diff';
import { blockDiffWidgetForBlock } from '../../ai/widgets/block-diff/block';
import { blockDiffWidgetForPage } from '../../ai/widgets/block-diff/page';
import { blockDiffPlayground } from '../../ai/widgets/block-diff/playground';
import { EdgelessClipboardAIChatConfig } from './edgeless-clipboard';

const optionsSchema = z.object({
  enable: z.boolean().optional(),
  framework: z.instanceof(FrameworkProvider).optional(),
});

type AIViewOptions = z.infer<typeof optionsSchema>;

export class AIViewExtension extends ViewExtensionProvider<AIViewOptions> {
  override name = 'affine-ai-view-extension';

  override schema = optionsSchema;

  override setup(context: ViewExtensionContext, options?: AIViewOptions) {
    super.setup(context, options);
    if (!options?.enable) return;
    const framework = options.framework;
    if (!framework) return;

    context
      .register(AIChatBlockSpec)
      .register(AITranscriptionBlockSpec)
      .register(EdgelessClipboardAIChatConfig)
      .register(AICodeBlockWatcher)
      .register(
        ToolbarModuleExtension({
          id: BlockFlavourIdentifier('custom:affine:image'),
          config: imageToolbarAIEntryConfig(),
        })
      );

    if (context.scope === 'edgeless' || context.scope === 'page') {
      context.register([
        aiPanelWidget,
        AiSlashMenuConfigExtension(),
        ToolbarModuleExtension({
          id: BlockFlavourIdentifier('custom:affine:note'),
          config: toolbarAIEntryConfig(),
        }),
      ]);
    }
    if (context.scope === 'edgeless') {
      context.register([
        CopilotTool,
        edgelessCopilotWidget,
        getAIEdgelessRootWatcher(),
        // In note
        ToolbarModuleExtension({
          id: BlockFlavourIdentifier('custom:affine:surface:*'),
          config: edgelessToolbarAIEntryConfig(),
        }),
      ]);
    }
    if (context.scope === 'page') {
      context.register([
        blockDiffWidgetForPage,
        blockDiffWidgetForBlock,
        getAIPageRootWatcher(),
        BlockDiffService,
        BlockDiffWatcher,
      ]);

      if (process.env.NODE_ENV === 'development') {
        context.register([blockDiffPlayground]);
      }
    }
  }
}
