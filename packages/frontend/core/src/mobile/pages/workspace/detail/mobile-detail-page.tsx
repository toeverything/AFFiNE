import { useThemeColorV2 } from '@affine/component';
import { PageDetailLoading } from '@affine/component/page-detail-skeleton';
import type { AffineEditorContainer } from '@affine/core/blocksuite/block-suite-editor';
import { AffineErrorBoundary } from '@affine/core/components/affine/affine-error-boundary';
import { useGuard } from '@affine/core/components/guard';
import { useActiveBlocksuiteEditor } from '@affine/core/components/hooks/use-block-suite-editor';
import { useNavigateHelper } from '@affine/core/components/hooks/use-navigate-helper';
import { PageDetailEditor } from '@affine/core/components/page-detail-editor';
import { DetailPageWrapper } from '@affine/core/desktop/pages/workspace/detail-page/detail-page-wrapper';
import { PageHeader } from '@affine/core/mobile/components';
import { AIButtonService } from '@affine/core/modules/ai-button';
import { ServerService } from '@affine/core/modules/cloud';
import { DocService } from '@affine/core/modules/doc';
import { DocDisplayMetaService } from '@affine/core/modules/doc-display-meta';
import { EditorService } from '@affine/core/modules/editor';
import { FeatureFlagService } from '@affine/core/modules/feature-flag';
import { GlobalContextService } from '@affine/core/modules/global-context';
import { JournalService } from '@affine/core/modules/journal';
import { WorkbenchService } from '@affine/core/modules/workbench';
import { ViewService } from '@affine/core/modules/workbench/services/view';
import { WorkspaceService } from '@affine/core/modules/workspace';
import { i18nTime } from '@affine/i18n';
import { DisposableGroup } from '@blocksuite/affine/global/disposable';
import { RefNodeSlotsProvider } from '@blocksuite/affine/inlines/reference';
import {
  customImageProxyMiddleware,
  ImageProxyService,
} from '@blocksuite/affine/shared/adapters';
import {
  FrameworkScope,
  useLiveData,
  useService,
  useServices,
} from '@toeverything/infra';
import { cssVarV2 } from '@toeverything/theme/v2';
import clsx from 'clsx';
import dayjs from 'dayjs';
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';

import { AppTabs } from '../../../components';
import { globalVars } from '../../../styles/variables.css';
import { JournalConflictBlock } from './journal-conflict-block';
import { JournalDatePicker } from './journal-date-picker';
import * as styles from './mobile-detail-page.css';
import {
  getImmersiveZoomToolbarBottom,
  getLandscapeWindowMeasurement,
  isImmersiveTapTarget,
  isLandscapeWindow,
  isTapWithinSlop,
  shouldEnableEdgelessImmersive,
  shouldLockEdgelessDocumentScroll,
  shouldShowMobileDetailPageTitle,
  shouldTrackMobileDetailPageTitleScroll,
} from './mobile-detail-page.immersive';
import { PageHeaderMenuButton } from './page-header-more-button';
import { PageHeaderShareButton } from './page-header-share-button';

type ImmersiveTapHandlers = {
  onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerUp: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerCancel: () => void;
};

const DetailPageImpl = ({
  immersive,
  chromeVisible,
  immersiveTapHandlers,
}: {
  immersive: boolean;
  chromeVisible: boolean;
  immersiveTapHandlers?: ImmersiveTapHandlers;
}) => {
  const {
    editorService,
    docService,
    workspaceService,
    globalContextService,
    featureFlagService,
    aIButtonService,
  } = useServices({
    WorkbenchService,
    ViewService,
    EditorService,
    DocService,
    WorkspaceService,
    GlobalContextService,
    FeatureFlagService,
    AIButtonService,
  });
  const editor = editorService.editor;
  const workspace = workspaceService.workspace;
  const docCollection = workspace.docCollection;
  const globalContext = globalContextService.globalContext;
  const doc = docService.doc;

  const mode = useLiveData(editor.mode$);

  const isInTrash = useLiveData(doc.meta$.map(meta => meta.trash));
  const { openPage, jumpToPageBlock } = useNavigateHelper();
  const scrollViewportRef = useRef<HTMLDivElement | null>(null);

  const editorContainer = useLiveData(editor.editorContainer$);

  const enableKeyboardToolbar =
    featureFlagService.flags.enable_mobile_keyboard_toolbar.value;
  const enableEdgelessEditing =
    featureFlagService.flags.enable_mobile_edgeless_editing.value;
  const enableAIButton = useLiveData(
    featureFlagService.flags.enable_mobile_ai_button.$
  );

  // TODO(@eyhn): remove jotai here
  const [_, setActiveBlockSuiteEditor] = useActiveBlocksuiteEditor();

  useEffect(() => {
    setActiveBlockSuiteEditor(editorContainer);
  }, [editorContainer, setActiveBlockSuiteEditor]);

  useEffect(() => {
    globalContext.docId.set(doc.id);
    globalContext.isDoc.set(true);

    return () => {
      globalContext.docId.set(null);
      globalContext.isDoc.set(false);
    };
  }, [doc, globalContext]);

  useEffect(() => {
    globalContext.docMode.set(mode);

    return () => {
      globalContext.docMode.set(null);
    };
  }, [doc, globalContext, mode]);

  useEffect(() => {
    if (!enableAIButton) return;
    aIButtonService.presentAIButton(true);

    return () => {
      aIButtonService.presentAIButton(false);
    };
  }, [aIButtonService, enableAIButton]);

  useEffect(() => {
    globalContext.isTrashDoc.set(!!isInTrash);

    return () => {
      globalContext.isTrashDoc.set(null);
    };
  }, [globalContext, isInTrash]);

  const server = useService(ServerService).server;

  const onLoad = useCallback(
    (editorContainer: AffineEditorContainer) => {
      // provide image proxy endpoint to blocksuite
      const imageProxyUrl = new URL(
        BUILD_CONFIG.imageProxyUrl,
        server.baseUrl
      ).toString();

      editorContainer.std.clipboard.use(
        customImageProxyMiddleware(imageProxyUrl)
      );
      editorContainer.doc
        .get(ImageProxyService)
        .setImageProxyURL(imageProxyUrl);

      // provide page mode and updated date to blocksuite
      const refNodeService =
        editorContainer.std.getOptional(RefNodeSlotsProvider);
      const disposable = new DisposableGroup();
      if (refNodeService) {
        disposable.add(
          refNodeService.docLinkClicked.subscribe(({ pageId, params }) => {
            if (params) {
              const { mode, blockIds, elementIds } = params;
              return jumpToPageBlock(
                docCollection.id,
                pageId,
                mode,
                blockIds,
                elementIds
              );
            }

            return openPage(docCollection.id, pageId);
          })
        );
      }

      editor.bindEditorContainer(
        editorContainer,
        editorContainer.docTitle,
        scrollViewportRef.current
      );

      return () => {
        disposable.dispose();
      };
    },
    [docCollection.id, editor, jumpToPageBlock, openPage, server]
  );

  const canEdit = useGuard('Doc_Update', doc.id);

  const readonly =
    !canEdit ||
    isInTrash ||
    !enableKeyboardToolbar ||
    (mode === 'edgeless' && !enableEdgelessEditing);

  const immersiveZoomToolbarBottom = getImmersiveZoomToolbarBottom({
    immersive,
    chromeVisible,
    tabBarOffset: globalVars.appTabSafeArea,
  });
  const lockDocumentScroll = shouldLockEdgelessDocumentScroll(mode);

  const immersiveViewportStyle = immersiveZoomToolbarBottom
    ? ({
        '--affine-edgeless-zoom-toolbar-bottom': immersiveZoomToolbarBottom,
      } as CSSProperties)
    : undefined;

  return (
    <FrameworkScope scope={editor.scope}>
      <div className={styles.mainContainer}>
        <div
          data-mode={mode}
          data-lock-document-scroll={lockDocumentScroll ? 'true' : undefined}
          ref={scrollViewportRef}
          style={immersiveViewportStyle}
          className={clsx(
            'affine-page-viewport',
            styles.affineDocViewport,
            styles.editorContainer
          )}
          onPointerDown={immersiveTapHandlers?.onPointerDown}
          onPointerUp={immersiveTapHandlers?.onPointerUp}
          onPointerCancel={immersiveTapHandlers?.onPointerCancel}
        >
          <AffineErrorBoundary key={doc.id} className={styles.errorBoundary}>
            <PageDetailEditor onLoad={onLoad} readonly={readonly} />
          </AffineErrorBoundary>
        </div>
      </div>
    </FrameworkScope>
  );
};

const getSkeleton = (back: boolean) => (
  <>
    <PageHeader back={back} className={styles.header} />
    <PageDetailLoading />
  </>
);
const getNotFound = (back: boolean) => (
  <>
    <PageHeader back={back} className={styles.header} />
    Page Not Found (TODO)
  </>
);
const skeleton = getSkeleton(false);
const skeletonWithBack = getSkeleton(true);
const notFound = getNotFound(false);
const notFoundWithBack = getNotFound(true);

const getShouldShowTitle = () =>
  shouldShowMobileDetailPageTitle(window.scrollY);

const LANDSCAPE_MEASUREMENT_MAX_RETRIES = 4;

const getIsLandscape = () =>
  isLandscapeWindow({
    width: window.innerWidth,
    height: window.innerHeight,
    matchesLandscape: window.matchMedia('(orientation: landscape)').matches,
  });

const MobileDetailPageHeader = ({
  date,
  fromTab,
  title,
  allJournalDates,
  handleDateChange,
  trackScrollTitle,
}: {
  date?: string;
  fromTab: boolean;
  title?: string;
  allJournalDates: Set<string | null | undefined>;
  handleDateChange: (date: string) => void;
  trackScrollTitle: boolean;
}) => {
  const [showTitle, setShowTitle] = useState(getShouldShowTitle);

  useEffect(() => {
    if (!trackScrollTitle) {
      return;
    }

    let frame = 0;

    const updateShowTitle = () => {
      frame = 0;
      setShowTitle(prev => {
        const next = getShouldShowTitle();
        return prev === next ? prev : next;
      });
    };

    const handleScroll = () => {
      if (frame) {
        return;
      }

      frame = window.requestAnimationFrame(updateShowTitle);
    };

    window.addEventListener('scroll', handleScroll);
    handleScroll();

    return () => {
      if (frame) {
        window.cancelAnimationFrame(frame);
      }
      window.removeEventListener('scroll', handleScroll);
    };
  }, [trackScrollTitle]);

  return (
    <PageHeader
      back={!fromTab}
      className={styles.header}
      contentClassName={styles.headerContent}
      suffix={
        <>
          <PageHeaderShareButton />
          <PageHeaderMenuButton />
        </>
      }
      bottom={
        date ? (
          <JournalDatePicker
            date={date}
            onChange={handleDateChange}
            withDotDates={allJournalDates}
            className={styles.journalDatePicker}
          />
        ) : null
      }
      bottomSpacer={94}
    >
      <span data-show={!!date || showTitle} className={styles.headerTitle}>
        {date
          ? i18nTime(dayjs(date), { absolute: { accuracy: 'month' } })
          : title}
      </span>
    </PageHeader>
  );
};

const MobileDetailPageContent = ({
  pageId,
  date,
  fromTab,
  title,
  allJournalDates,
  handleDateChange,
}: {
  pageId: string;
  date?: string;
  fromTab: boolean;
  title?: string;
  allJournalDates: Set<string | null | undefined>;
  handleDateChange: (date: string) => void;
}) => {
  const editor = useService(EditorService).editor;
  const mode = useLiveData(editor.mode$);
  const [isLandscape, setIsLandscape] = useState(getIsLandscape);
  const [chromeVisible, setChromeVisible] = useState(true);
  const tapStateRef = useRef<{
    pointerId: number;
    clientX: number;
    clientY: number;
    tappable: boolean;
  } | null>(null);

  const immersive = shouldEnableEdgelessImmersive({ mode, isLandscape });
  const trackScrollTitle = shouldTrackMobileDetailPageTitleScroll(mode);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(orientation: landscape)');
    let frame = 0;
    let disposed = false;
    let remainingRetries = 0;

    const sampleLandscape = () => {
      frame = 0;

      if (disposed) {
        return;
      }

      const measurement = getLandscapeWindowMeasurement({
        width: window.innerWidth,
        height: window.innerHeight,
        matchesLandscape: mediaQuery.matches,
      });

      setIsLandscape(prev => {
        const next = measurement.isLandscape;
        return prev === next ? prev : next;
      });

      if (!measurement.settled && remainingRetries > 0) {
        remainingRetries -= 1;
        frame = window.requestAnimationFrame(sampleLandscape);
      }
    };

    const updateLandscape = () => {
      if (frame) {
        window.cancelAnimationFrame(frame);
      }

      remainingRetries = LANDSCAPE_MEASUREMENT_MAX_RETRIES;
      frame = window.requestAnimationFrame(sampleLandscape);
    };

    updateLandscape();
    window.addEventListener('resize', updateLandscape);
    mediaQuery.addEventListener('change', updateLandscape);

    return () => {
      disposed = true;
      if (frame) {
        window.cancelAnimationFrame(frame);
      }
      window.removeEventListener('resize', updateLandscape);
      mediaQuery.removeEventListener('change', updateLandscape);
    };
  }, []);

  useEffect(() => {
    setChromeVisible(!immersive);
    tapStateRef.current = null;
  }, [immersive, pageId]);

  useEffect(() => {
    if (!immersive || !chromeVisible) {
      return;
    }

    const timeout = window.setTimeout(() => {
      setChromeVisible(false);
    }, 3000);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [chromeVisible, immersive]);

  const immersiveTapHandlers = useMemo<ImmersiveTapHandlers | undefined>(() => {
    if (!immersive) {
      return undefined;
    }

    return {
      onPointerDown: event => {
        tapStateRef.current = {
          pointerId: event.pointerId,
          clientX: event.clientX,
          clientY: event.clientY,
          tappable: isImmersiveTapTarget(event.target),
        };
      },
      onPointerUp: event => {
        const tapState = tapStateRef.current;
        tapStateRef.current = null;

        if (
          !tapState ||
          tapState.pointerId !== event.pointerId ||
          !tapState.tappable ||
          !isTapWithinSlop(tapState, event)
        ) {
          return;
        }

        setChromeVisible(visible => !visible);
      },
      onPointerCancel: () => {
        tapStateRef.current = null;
      },
    };
  }, [immersive]);

  return (
    <>
      {(!immersive || chromeVisible) && (
        <MobileDetailPageHeader
          date={date}
          fromTab={fromTab}
          title={title}
          allJournalDates={allJournalDates}
          handleDateChange={handleDateChange}
          trackScrollTitle={trackScrollTitle}
        />
      )}
      <JournalConflictBlock date={date} />
      <DetailPageImpl
        immersive={immersive}
        chromeVisible={chromeVisible}
        immersiveTapHandlers={immersiveTapHandlers}
      />
      <AppTabs
        background={cssVarV2('layer/background/primary')}
        hidden={immersive && !chromeVisible}
      />
    </>
  );
};

const MobileDetailPage = ({
  pageId,
  date,
}: {
  pageId: string;
  date?: string;
}) => {
  const docDisplayMetaService = useService(DocDisplayMetaService);
  const journalService = useService(JournalService);
  const workbench = useService(WorkbenchService).workbench;
  const title = useLiveData(docDisplayMetaService.title$(pageId));

  const canAccess = useGuard('Doc_Read', pageId);

  const allJournalDates = useLiveData(journalService.allJournalDates$);

  const location = useLiveData(workbench.location$);
  const fromTab = location.search.includes('fromTab');

  const handleDateChange = useCallback(
    (date: string) => {
      const docs = journalService.journalsByDate$(date).value;
      if (docs.length > 0) {
        workbench.openDoc(
          { docId: docs[0].id, fromTab: fromTab ? 'true' : undefined },
          { replaceHistory: true }
        );
      } else {
        workbench.open(`/journals?date=${date}`);
      }
    },
    [fromTab, journalService, workbench]
  );

  return (
    <div className={styles.root}>
      <DetailPageWrapper
        skeleton={date ? skeleton : skeletonWithBack}
        notFound={date ? notFound : notFoundWithBack}
        pageId={pageId}
        canAccess={canAccess}
      >
        <MobileDetailPageContent
          key={pageId}
          pageId={pageId}
          date={date}
          fromTab={fromTab}
          title={title}
          allJournalDates={allJournalDates}
          handleDateChange={handleDateChange}
        />
      </DetailPageWrapper>
    </div>
  );
};

export const Component = () => {
  useThemeColorV2('layer/background/primary');
  const journalService = useService(JournalService);
  const params = useParams();
  const pageId = params.pageId;
  const journalDate = useLiveData(journalService.journalDate$(pageId ?? ''));

  if (!pageId) {
    return null;
  }

  return <MobileDetailPage pageId={pageId} date={journalDate} />;
};
