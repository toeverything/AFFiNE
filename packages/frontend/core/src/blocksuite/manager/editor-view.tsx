import type { ConfirmModalProps, ElementOrFactory } from '@affine/component';
import { patchForAudioEmbedView } from '@affine/core/blocksuite/extensions/audio/audio-view';
import { patchDatabaseBlockConfigService } from '@affine/core/blocksuite/extensions/database-block-config-service';
import { patchDocModeService } from '@affine/core/blocksuite/extensions/doc-mode-service';
import { patchDocUrlExtensions } from '@affine/core/blocksuite/extensions/doc-url';
import { patchNotificationService } from '@affine/core/blocksuite/extensions/notification-service';
import { patchOpenDocExtension } from '@affine/core/blocksuite/extensions/open-doc';
import { patchQuickSearchService } from '@affine/core/blocksuite/extensions/quick-search-service';
import {
  patchReferenceRenderer,
  type ReferenceReactRenderer,
} from '@affine/core/blocksuite/extensions/reference-renderer';
import { patchSideBarService } from '@affine/core/blocksuite/extensions/side-bar-service';
import {
  AffinePageReference,
  AffineSharedPageReference,
} from '@affine/core/components/affine/reference-link';
import { DocService, DocsService } from '@affine/core/modules/doc';
import { EditorService } from '@affine/core/modules/editor';
import { toDocSearchParams } from '@affine/core/modules/navigation';
import { WorkspaceService } from '@affine/core/modules/workspace';
import {
  type ViewExtensionContext,
  ViewExtensionProvider,
} from '@blocksuite/affine/ext-loader';
import { FrameworkProvider } from '@toeverything/infra';
import type { TemplateResult } from 'lit';
import { z } from 'zod';

const optionsSchema = z.object({
  // services
  framework: z.instanceof(FrameworkProvider),

  // react renderer
  reactToLit: z
    .function()
    .args(z.custom<ElementOrFactory>(), z.boolean().optional())
    .returns(z.custom<TemplateResult>()),
  confirmModal: z.object({
    openConfirmModal: z
      .function()
      .args(z.custom<ConfirmModalProps>().optional(), z.any().optional()),
    closeConfirmModal: z.function(),
  }),
});

export type AffineEditorViewOptions = z.infer<typeof optionsSchema>;

export class AffineEditorViewExtension extends ViewExtensionProvider<AffineEditorViewOptions> {
  override name = 'affine-editor-view';

  override schema = optionsSchema;

  private readonly _getCustomReferenceRenderer = (
    framework: FrameworkProvider
  ): ReferenceReactRenderer => {
    const workspaceService = framework.get(WorkspaceService);
    return function customReference(reference) {
      const data = reference.delta.attributes?.reference;
      if (!data) return <span />;

      const pageId = data.pageId;
      if (!pageId) return <span />;

      // title alias
      const title = data.title;
      const params = toDocSearchParams(data.params);

      if (workspaceService.workspace.openOptions.isSharedMode) {
        return (
          <AffineSharedPageReference
            docCollection={workspaceService.workspace.docCollection}
            pageId={pageId}
            params={params}
            title={title}
          />
        );
      }

      return (
        <AffinePageReference pageId={pageId} params={params} title={title} />
      );
    };
  };

  override setup(
    context: ViewExtensionContext,
    options?: AffineEditorViewOptions
  ) {
    super.setup(context, options);
    if (!options) {
      return;
    }
    const {
      framework,

      reactToLit,
      confirmModal,
    } = options;

    const docService = framework.get(DocService);
    const docsService = framework.get(DocsService);
    const editorService = framework.get(EditorService);

    const referenceRenderer = this._getCustomReferenceRenderer(framework);

    context
      .register([
        patchReferenceRenderer(reactToLit, referenceRenderer),
        patchNotificationService(confirmModal),
        patchOpenDocExtension(),
        patchSideBarService(framework),
        patchDocModeService(docService, docsService, editorService),
      ])
      .register(patchDocUrlExtensions(framework))
      .register(patchQuickSearchService(framework))
      .register([
        patchDatabaseBlockConfigService(),
        patchForAudioEmbedView(reactToLit),
      ]);
  }
}
