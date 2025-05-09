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
import { buildDocDisplayMetaExtension } from '@affine/core/blocksuite/extensions/display-meta';
import { getEditorConfigExtension } from '@affine/core/blocksuite/extensions/editor-config';
import { patchFileSizeLimitExtension } from '@affine/core/blocksuite/extensions/file-size-limit';
import { getFontConfigExtension } from '@affine/core/blocksuite/extensions/font-config';
import { patchPeekViewService } from '@affine/core/blocksuite/extensions/peek-view-service';
import { getTelemetryExtension } from '@affine/core/blocksuite/extensions/telemetry';
import {
  getPreviewThemeExtension,
  getThemeExtension,
} from '@affine/core/blocksuite/extensions/theme';
import { PeekViewService } from '@affine/core/modules/peek-view';
import {
  type ViewExtensionContext,
  ViewExtensionProvider,
} from '@blocksuite/affine/ext-loader';
import { ToolbarModuleExtension } from '@blocksuite/affine/shared/services';
import { BlockFlavourIdentifier } from '@blocksuite/affine/std';
import { FrameworkProvider } from '@toeverything/infra';
import { z } from 'zod';

const optionsSchema = z.object({
  enableAI: z.boolean().optional(),
  framework: z.instanceof(FrameworkProvider).optional(),
});

export class AffineCommonViewExtension extends ViewExtensionProvider<
  z.infer<typeof optionsSchema>
> {
  override name = 'affine-view-extensions';

  override schema = optionsSchema;

  private _setupTheme(
    context: ViewExtensionContext,
    framework: FrameworkProvider
  ) {
    if (this.isPreview(context.scope)) {
      context.register(getPreviewThemeExtension(framework));
    } else {
      context.register(getThemeExtension(framework));
    }
  }

  private _setupAI(
    context: ViewExtensionContext,
    framework: FrameworkProvider
  ) {
    context.register(AIChatBlockSpec);
    context.register(AITranscriptionBlockSpec);
    context.register([
      AICodeBlockWatcher,
      ToolbarModuleExtension({
        id: BlockFlavourIdentifier('custom:affine:image'),
        config: imageToolbarAIEntryConfig(),
      }),
    ]);
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
        getAIEdgelessRootWatcher(framework),
        // In note
        ToolbarModuleExtension({
          id: BlockFlavourIdentifier('custom:affine:surface:*'),
          config: edgelessToolbarAIEntryConfig(),
        }),
      ]);
    }
    if (context.scope === 'page') {
      context.register(getAIPageRootWatcher(framework));
    }
  }

  override setup(
    context: ViewExtensionContext,
    options?: z.infer<typeof optionsSchema>
  ) {
    super.setup(context);
    const { framework, enableAI } = options || {};
    if (framework) {
      context.register(patchPeekViewService(framework.get(PeekViewService)));
      context.register([
        getFontConfigExtension(),
        buildDocDisplayMetaExtension(framework),
      ]);
      context.register(getTelemetryExtension());
      this._setupTheme(context, framework);
      if (context.scope === 'edgeless' || context.scope === 'page') {
        context.register(getEditorConfigExtension(framework));
        context.register(patchFileSizeLimitExtension(framework));
      }
      if (enableAI) {
        this._setupAI(context, framework);
      }
    }
  }
}
