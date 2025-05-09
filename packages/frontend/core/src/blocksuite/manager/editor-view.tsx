import type { ConfirmModalProps, ElementOrFactory } from '@affine/component';
import {
  patchForAudioEmbedView,
  patchForPDFEmbedView,
} from '@affine/core/blocksuite/extensions/attachment-embed-view';
import { patchDatabaseBlockConfigService } from '@affine/core/blocksuite/extensions/database-block-config-service';
import { patchDocModeService } from '@affine/core/blocksuite/extensions/doc-mode-service';
import { patchDocUrlExtensions } from '@affine/core/blocksuite/extensions/doc-url';
import {
  patchForEdgelessNoteConfig,
  patchForEmbedSyncedDocConfig,
} from '@affine/core/blocksuite/extensions/edgeless-block-header';
import { EdgelessClipboardAIChatConfig } from '@affine/core/blocksuite/extensions/edgeless-clipboard';
import { patchForClipboardInElectron } from '@affine/core/blocksuite/extensions/electron-clipboard';
import { patchNotificationService } from '@affine/core/blocksuite/extensions/notification-service';
import { patchOpenDocExtension } from '@affine/core/blocksuite/extensions/open-doc';
import { patchQuickSearchService } from '@affine/core/blocksuite/extensions/quick-search-service';
import {
  patchReferenceRenderer,
  type ReferenceReactRenderer,
} from '@affine/core/blocksuite/extensions/reference-renderer';
import { patchSideBarService } from '@affine/core/blocksuite/extensions/side-bar-service';
import { turboRendererExtension } from '@affine/core/blocksuite/extensions/turbo-renderer';
import { patchUserExtensions } from '@affine/core/blocksuite/extensions/user';
import { patchUserListExtensions } from '@affine/core/blocksuite/extensions/user-list';
import {
  AffinePageReference,
  AffineSharedPageReference,
} from '@affine/core/components/affine/reference-link';
import { PublicUserService } from '@affine/core/modules/cloud';
import { DocService, DocsService } from '@affine/core/modules/doc';
import { EditorService } from '@affine/core/modules/editor';
import { toDocSearchParams } from '@affine/core/modules/navigation';
import { MemberSearchService } from '@affine/core/modules/permissions';
import { WorkspaceService } from '@affine/core/modules/workspace';
import {
  type ViewExtensionContext,
  ViewExtensionProvider,
} from '@blocksuite/affine/ext-loader';
import { FrameworkProvider } from '@toeverything/infra';
import type { TemplateResult } from 'lit';
import { z } from 'zod';

import {
  KeyboardToolbarExtension,
  mobileCodeConfig,
  mobileParagraphConfig,
  MobileSpecsPatches,
} from '../extensions/mobile-config';

const optionsSchema = z.object({
  // env
  isCloud: z.boolean(),
  isInPeekView: z.boolean(),

  // flags
  enableTurboRenderer: z.boolean(),
  enablePDFEmbedPreview: z.boolean(),

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
    super.setup(context);
    if (!options) {
      return;
    }
    const {
      isCloud,
      isInPeekView,

      enableTurboRenderer,
      enablePDFEmbedPreview,

      framework,

      reactToLit,
      confirmModal,
    } = options;
    const isEdgeless = this.isEdgeless(context.scope);
    const isMobileEdition = BUILD_CONFIG.isMobileEdition;
    const isElectron = BUILD_CONFIG.isElectron;

    const docService = framework.get(DocService);
    const docsService = framework.get(DocsService);
    const editorService = framework.get(EditorService);
    const memberSearchService = framework.get(MemberSearchService);
    const publicUserService = framework.get(PublicUserService);

    const referenceRenderer = this._getCustomReferenceRenderer(framework);

    context.register([
      patchReferenceRenderer(reactToLit, referenceRenderer),
      patchNotificationService(confirmModal),
      patchOpenDocExtension(),
      EdgelessClipboardAIChatConfig,
      patchSideBarService(framework),
      patchDocModeService(docService, docsService, editorService),
    ]);
    context.register(patchDocUrlExtensions(framework));
    context.register(patchQuickSearchService(framework));
    context.register([
      patchForEmbedSyncedDocConfig(reactToLit),
      patchForEdgelessNoteConfig(framework, reactToLit, isInPeekView),
      patchDatabaseBlockConfigService(),
      patchForAudioEmbedView(reactToLit),
    ]);
    if (isCloud) {
      context.register([
        patchUserListExtensions(memberSearchService),
        patchUserExtensions(publicUserService),
      ]);
    }
    if (isEdgeless && enableTurboRenderer) {
      context.register(turboRendererExtension);
    }
    if (enablePDFEmbedPreview) {
      context.register(patchForPDFEmbedView(reactToLit));
    }
    if (isMobileEdition) {
      context.register([
        KeyboardToolbarExtension(framework),
        MobileSpecsPatches,
        mobileParagraphConfig,
        mobileCodeConfig,
      ]);
    }
    if (isElectron) {
      context.register(patchForClipboardInElectron(framework));
    }
  }
}
