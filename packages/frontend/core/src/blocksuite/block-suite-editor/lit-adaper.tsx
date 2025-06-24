// eslint-disable-next-line @typescript-eslint/no-restricted-imports
import 'katex/dist/katex.min.css';

import { useConfirmModal, useLitPortalFactory } from '@affine/component';
import {
  type EdgelessEditor,
  LitDocEditor,
  LitDocTitle,
  LitEdgelessEditor,
  type PageEditor,
} from '@affine/core/blocksuite/editors';
import { getViewManager } from '@affine/core/blocksuite/manager/view';
import { useEnableAI } from '@affine/core/components/hooks/affine/use-enable-ai';
import type { DocCustomPropertyInfo } from '@affine/core/modules/db';
import type {
  DatabaseRow,
  DatabaseValueCell,
} from '@affine/core/modules/doc-info/types';
import { EditorSettingService } from '@affine/core/modules/editor-setting';
import { FeatureFlagService } from '@affine/core/modules/feature-flag';
import { JournalService } from '@affine/core/modules/journal';
import { useInsidePeekView } from '@affine/core/modules/peek-view';
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
  type DefaultOpenProperty,
  WorkspacePropertiesTable,
} from '../../components/properties';
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
  const { workspaceService, featureFlagService } = useServices({
    WorkspaceService,
    FeatureFlagService,
  });
  const isCloud = workspaceService.workspace.flavour !== 'local';
  const framework = useFramework();

  const confirmModal = useConfirmModal();

  const enableAI = useEnableAI();

  const isInPeekView = useInsidePeekView();

  const enableTurboRenderer = useLiveData(
    featureFlagService.flags.enable_turbo_renderer.$
  );

  const enablePDFEmbedPreview = useLiveData(
    featureFlagService.flags.enable_pdf_embed_preview.$
  );

  const patchedSpecs = useMemo(() => {
    const manager = getViewManager()
      .config.init()
      .foundation(framework)
      .ai(enableAI, framework)
      .theme(framework)
      .editorConfig(framework)
      .editorView({
        framework,
        reactToLit,
        confirmModal,
      })
      .cloud(framework, isCloud)
      .turboRenderer(enableTurboRenderer)
      .pdf(enablePDFEmbedPreview, reactToLit)
      .edgelessBlockHeader({
        framework,
        isInPeekView,
        reactToLit,
      })
      .database(framework)
      .linkedDoc(framework)
      .paragraph(enableAI)
      .mobile(framework)
      .electron(framework)
      .linkPreview(framework)
      .codeBlockHtmlPreview(framework).value;

    if (BUILD_CONFIG.isMobileEdition) {
      if (mode === 'page') {
        return manager.get('mobile-page');
      } else {
        return manager.get('mobile-edgeless');
      }
    } else {
      return manager.get(mode);
    }
  }, [
    confirmModal,
    enableAI,
    enablePDFEmbedPreview,
    enableTurboRenderer,
    framework,
    isInPeekView,
    isCloud,
    mode,
    reactToLit,
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
            <WorkspacePropertiesTable
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
          editorRef.current
            ?.querySelector<HTMLElement>('affine-edgeless-root')
            ?.click();
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
