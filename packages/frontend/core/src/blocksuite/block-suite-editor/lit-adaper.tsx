import { useConfirmModal, useLitPortalFactory } from '@affine/component';
import {
  type EdgelessEditor,
  LitDocEditor,
  LitDocTitle,
  LitEdgelessEditor,
  type PageEditor,
} from '@affine/core/blocksuite/editors';
import { useEnableAI } from '@affine/core/components/hooks/affine/use-enable-ai';
import { PublicUserService } from '@affine/core/modules/cloud';
import type { DocCustomPropertyInfo } from '@affine/core/modules/db';
import { DocService, DocsService } from '@affine/core/modules/doc';
import type {
  DatabaseRow,
  DatabaseValueCell,
} from '@affine/core/modules/doc-info/types';
import { EditorService } from '@affine/core/modules/editor';
import { EditorSettingService } from '@affine/core/modules/editor-setting';
import { FeatureFlagService } from '@affine/core/modules/feature-flag';
import { JournalService } from '@affine/core/modules/journal';
import { toURLSearchParams } from '@affine/core/modules/navigation';
import { useInsidePeekView } from '@affine/core/modules/peek-view';
import { PeekViewService } from '@affine/core/modules/peek-view/services/peek-view';
import { MemberSearchService } from '@affine/core/modules/permissions';
import { WorkspaceService } from '@affine/core/modules/workspace';
import track from '@affine/track';
import type { DocTitle } from '@blocksuite/affine/fragments/doc-title';
import type { DocMode } from '@blocksuite/affine/model';
import type { Store } from '@blocksuite/affine/store';
import {
  useFramework,
  useLiveData,
  useService,
  useServices,
} from '@toeverything/infra';
import type React from 'react';
import {
  forwardRef,
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
} from 'react';

import {
  AffinePageReference,
  AffineSharedPageReference,
} from '../../components/affine/reference-link';
import {
  type DefaultOpenProperty,
  DocPropertiesTable,
} from '../../components/doc-properties';
import {
  patchForAudioEmbedView,
  patchForPDFEmbedView,
} from '../extensions/attachment-embed-view';
import { patchDatabaseBlockConfigService } from '../extensions/database-block-config-service';
import { patchDocModeService } from '../extensions/doc-mode-service';
import { patchDocUrlExtensions } from '../extensions/doc-url';
import { EdgelessClipboardAIChatConfig } from '../extensions/edgeless-clipboard';
import { patchForClipboardInElectron } from '../extensions/electron-clipboard';
import { enableEditorExtension } from '../extensions/entry/enable-editor';
import { enableMobileExtension } from '../extensions/entry/enable-mobile';
import { enablePreviewExtension } from '../extensions/entry/enable-preview';
import { patchForEdgelessNoteConfig } from '../extensions/note-config';
import { patchNotificationService } from '../extensions/notification-service';
import { patchOpenDocExtension } from '../extensions/open-doc';
import { patchPeekViewService } from '../extensions/peek-view-service';
import { patchQuickSearchService } from '../extensions/quick-search-service';
import {
  patchReferenceRenderer,
  type ReferenceReactRenderer,
} from '../extensions/reference-renderer';
import { patchSideBarService } from '../extensions/side-bar-service';
import { patchTurboRendererExtension } from '../extensions/turbo-renderer';
import { patchUserExtensions } from '../extensions/user';
import { patchUserListExtensions } from '../extensions/user-list';
import { BiDirectionalLinkPanel } from './bi-directional-link-panel';
import { BlocksuiteEditorJournalDocTitle } from './journal-doc-title';
import { StarterBar } from './starter-bar';
import * as styles from './styles.css';

interface BlocksuiteEditorProps {
  page: Store;
  readonly?: boolean;
  shared?: boolean;
  defaultOpenProperty?: DefaultOpenProperty;
}

const usePatchSpecs = (mode: DocMode) => {
  const [reactToLit, portals] = useLitPortalFactory();
  const {
    peekViewService,
    docService,
    docsService,
    editorService,
    workspaceService,
    featureFlagService,
    memberSearchService,
    publicUserService,
  } = useServices({
    PeekViewService,
    DocService,
    DocsService,
    WorkspaceService,
    EditorService,
    FeatureFlagService,
    MemberSearchService,
    PublicUserService,
  });
  const isCloud = workspaceService.workspace.flavour !== 'local';
  const framework = useFramework();
  const referenceRenderer: ReferenceReactRenderer = useMemo(() => {
    return function customReference(reference) {
      const data = reference.delta.attributes?.reference;
      if (!data) return <span />;

      const pageId = data.pageId;
      if (!pageId) return <span />;

      // title alias
      const title = data.title;
      const params = toURLSearchParams(data.params);

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
  }, [workspaceService]);

  useMemo(() => {
    enablePreviewExtension(framework);
  }, [framework]);

  const confirmModal = useConfirmModal();

  const enableAI = useEnableAI();

  const insidePeekView = useInsidePeekView();

  const enableTurboRenderer = useLiveData(
    featureFlagService.flags.enable_turbo_renderer.$
  );

  const enablePDFEmbedPreview = useLiveData(
    featureFlagService.flags.enable_pdf_embed_preview.$
  );

  const enableAudioBlock = useLiveData(
    featureFlagService.flags.enable_audio_block.$
  );

  const patchedSpecs = useMemo(() => {
    const builder = enableEditorExtension(framework, mode, enableAI);

    builder.extend(
      [
        patchReferenceRenderer(reactToLit, referenceRenderer),
        patchForEdgelessNoteConfig(framework, reactToLit, insidePeekView),
        patchNotificationService(confirmModal),
        patchPeekViewService(peekViewService),
        patchOpenDocExtension(),
        EdgelessClipboardAIChatConfig,
        patchDocUrlExtensions(framework),
        patchQuickSearchService(framework),
        patchSideBarService(framework),
        patchDocModeService(docService, docsService, editorService),
        isCloud
          ? [
              patchUserListExtensions(memberSearchService),
              patchUserExtensions(publicUserService),
            ]
          : [],
        patchDatabaseBlockConfigService(),
        mode === 'edgeless' && enableTurboRenderer
          ? patchTurboRendererExtension()
          : [],
      ].flat()
    );

    if (enablePDFEmbedPreview) {
      builder.extend([patchForPDFEmbedView(reactToLit)]);
    }
    if (enableAudioBlock) {
      builder.extend([patchForAudioEmbedView(reactToLit)]);
    }
    if (BUILD_CONFIG.isMobileEdition) {
      enableMobileExtension(builder, framework);
    }
    if (BUILD_CONFIG.isElectron) {
      builder.extend([patchForClipboardInElectron(framework)].flat());
    }

    return builder.value;
  }, [
    framework,
    mode,
    enableAI,
    reactToLit,
    referenceRenderer,
    insidePeekView,
    confirmModal,
    peekViewService,
    docService,
    docsService,
    editorService,
    isCloud,
    memberSearchService,
    publicUserService,
    enableTurboRenderer,
    enablePDFEmbedPreview,
    enableAudioBlock,
  ]);

  return [
    patchedSpecs,
    useMemo(
      () => (
        <>
          {portals.map(p => (
            <Fragment key={p.id}>{p.portal}</Fragment>
          ))}
        </>
      ),
      [portals]
    ),
  ] as const;
};

export const BlocksuiteDocEditor = forwardRef<
  PageEditor,
  BlocksuiteEditorProps & {
    onClickBlank?: () => void;
    titleRef?: React.Ref<DocTitle>;
  }
>(function BlocksuiteDocEditor(
  {
    page,
    shared,
    onClickBlank,
    titleRef: externalTitleRef,
    defaultOpenProperty,
    readonly,
  },
  ref
) {
  const titleRef = useRef<DocTitle | null>(null);
  const docRef = useRef<PageEditor | null>(null);
  const journalService = useService(JournalService);
  const isJournal = !!useLiveData(journalService.journalDate$(page.id));

  const editorSettingService = useService(EditorSettingService);

  const onDocRef = useCallback(
    (el: PageEditor) => {
      docRef.current = el;
      if (ref) {
        if (typeof ref === 'function') {
          ref(el);
        } else {
          ref.current = el;
        }
      }
    },
    [ref]
  );

  const onTitleRef = useCallback(
    (el: DocTitle) => {
      titleRef.current = el;
      if (externalTitleRef) {
        if (typeof externalTitleRef === 'function') {
          externalTitleRef(el);
        } else {
          externalTitleRef.current = el;
        }
      }
    },
    [externalTitleRef]
  );

  const [specs, portals] = usePatchSpecs('page');

  const displayBiDirectionalLink = useLiveData(
    editorSettingService.editorSetting.settings$.selector(
      s => s.displayBiDirectionalLink
    )
  );

  const displayDocInfo = useLiveData(
    editorSettingService.editorSetting.settings$.selector(s => s.displayDocInfo)
  );

  const onPropertyChange = useCallback((property: DocCustomPropertyInfo) => {
    track.doc.inlineDocInfo.property.editProperty({
      type: property.type,
    });
  }, []);

  const onPropertyAdded = useCallback((property: DocCustomPropertyInfo) => {
    track.doc.inlineDocInfo.property.addProperty({
      type: property.type,
      control: 'at menu',
    });
  }, []);

  const onDatabasePropertyChange = useCallback(
    (_row: DatabaseRow, cell: DatabaseValueCell) => {
      track.doc.inlineDocInfo.databaseProperty.editProperty({
        type: cell.property.type$.value,
      });
    },
    []
  );

  const onPropertyInfoChange = useCallback(
    (property: DocCustomPropertyInfo, field: string) => {
      track.doc.inlineDocInfo.property.editPropertyMeta({
        type: property.type,
        field,
      });
    },
    []
  );

  return (
    <>
      <div className={styles.affineDocViewport}>
        {!isJournal ? (
          <LitDocTitle doc={page} ref={onTitleRef} />
        ) : (
          <BlocksuiteEditorJournalDocTitle page={page} />
        )}
        {!shared && displayDocInfo ? (
          <div className={styles.docPropertiesTableContainer}>
            <DocPropertiesTable
              className={styles.docPropertiesTable}
              onDatabasePropertyChange={onDatabasePropertyChange}
              onPropertyChange={onPropertyChange}
              onPropertyAdded={onPropertyAdded}
              onPropertyInfoChange={onPropertyInfoChange}
              defaultOpenProperty={defaultOpenProperty}
            />
          </div>
        ) : null}
        <LitDocEditor
          className={styles.docContainer}
          ref={onDocRef}
          doc={page}
          specs={specs}
        />
        <div
          className={styles.docEditorGap}
          data-testid="page-editor-blank"
          onClick={onClickBlank}
        ></div>
        {!readonly && !BUILD_CONFIG.isMobileEdition && (
          <StarterBar doc={page} />
        )}
        {!shared && displayBiDirectionalLink ? (
          <BiDirectionalLinkPanel />
        ) : null}
      </div>
      {portals}
    </>
  );
});
export const BlocksuiteEdgelessEditor = forwardRef<
  EdgelessEditor,
  BlocksuiteEditorProps
>(function BlocksuiteEdgelessEditor({ page }, ref) {
  const [specs, portals] = usePatchSpecs('edgeless');
  const editorRef = useRef<EdgelessEditor | null>(null);

  const onDocRef = useCallback(
    (el: EdgelessEditor) => {
      editorRef.current = el;
      if (ref) {
        if (typeof ref === 'function') {
          ref(el);
        } else {
          ref.current = el;
        }
      }
    },
    [ref]
  );

  useEffect(() => {
    if (editorRef.current) {
      editorRef.current.updateComplete
        .then(() => {
          // make sure editor can get keyboard events on showing up
          editorRef.current?.querySelector('affine-edgeless-root')?.click();
        })
        .catch(console.error);
    }
  }, []);

  return (
    <div className={styles.affineEdgelessDocViewport}>
      <LitEdgelessEditor ref={onDocRef} doc={page} specs={specs} />
      {portals}
    </div>
  );
});
