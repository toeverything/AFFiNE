import { toast } from '@affine/component';
import {
  pushGlobalLoadingEventAtom,
  resolveGlobalLoadingEventAtom,
} from '@affine/component/global-loading';
import { useI18n } from '@affine/i18n';
import { ZipTransformer } from '@blocksuite/blocks';
import { assertExists } from '@blocksuite/global/utils';
import {
  DndContext,
  DragOverlay,
  MouseSensor,
  useDndContext,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  type DocMode,
  DocsService,
  effect,
  fromPromise,
  onStart,
  throwIfAborted,
  useLiveData,
  useService,
  WorkspaceService,
} from '@toeverything/infra';
import { useAtomValue, useSetAtom } from 'jotai';
import type { PropsWithChildren, ReactNode } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  catchError,
  EMPTY,
  finalize,
  mergeMap,
  switchMap,
  timeout,
} from 'rxjs';
import { Map as YMap } from 'yjs';

import { openSettingModalAtom } from '../atoms';
import { AIProvider } from '../blocksuite/presets/ai';
import { AppContainer } from '../components/affine/app-container';
import { SyncAwareness } from '../components/affine/awareness';
import { appSidebarResizingAtom } from '../components/app-sidebar';
import { usePageHelper } from '../components/blocksuite/block-suite-page-list/utils';
import type { DraggableTitleCellData } from '../components/page-list';
import { RootAppSidebar } from '../components/root-app-sidebar';
import { MainContainer } from '../components/workspace';
import { WorkspaceUpgrade } from '../components/workspace-upgrade';
import { useAppSettingHelper } from '../hooks/affine/use-app-setting-helper';
import {
  resolveDragEndIntent,
  useGlobalDNDHelper,
} from '../hooks/affine/use-global-dnd-helper';
import { useRegisterFindInPageCommands } from '../hooks/affine/use-register-find-in-page-commands';
import { useNavigateHelper } from '../hooks/use-navigate-helper';
import { useRegisterWorkspaceCommands } from '../hooks/use-register-workspace-commands';
import { useRegisterNavigationCommands } from '../modules/navigation/view/use-register-navigation-commands';
import { QuickSearchContainer } from '../modules/quicksearch';
import { CMDKQuickSearchService } from '../modules/quicksearch/services/cmdk';
import { WorkbenchService } from '../modules/workbench';
import {
  AllWorkspaceModals,
  CurrentWorkspaceModals,
} from '../providers/modal-provider';
import { SWRConfigProvider } from '../providers/swr-config-provider';
import { pathGenerator } from '../shared';
import { mixpanel } from '../utils';
import * as styles from './styles.css';

export const WorkspaceLayout = function WorkspaceLayout({
  children,
}: PropsWithChildren) {
  return (
    <SWRConfigProvider>
      {/* load all workspaces is costly, do not block the whole UI */}
      <AllWorkspaceModals />
      <CurrentWorkspaceModals />
      <WorkspaceLayoutInner>{children}</WorkspaceLayoutInner>
      {/* should show after workspace loaded */}
    </SWRConfigProvider>
  );
};

export const WorkspaceLayoutInner = ({ children }: PropsWithChildren) => {
  const t = useI18n();
  const pushGlobalLoadingEvent = useSetAtom(pushGlobalLoadingEventAtom);
  const resolveGlobalLoadingEvent = useSetAtom(resolveGlobalLoadingEventAtom);
  const currentWorkspace = useService(WorkspaceService).workspace;
  const docsList = useService(DocsService).list;
  const { openPage } = useNavigateHelper();
  const pageHelper = usePageHelper(currentWorkspace.docCollection);

  const upgrading = useLiveData(currentWorkspace.upgrade.upgrading$);
  const needUpgrade = useLiveData(currentWorkspace.upgrade.needUpgrade$);

  const workbench = useService(WorkbenchService).workbench;

  const basename = useLiveData(workbench.basename$);

  const currentPath = useLiveData(
    workbench.location$.map(location => basename + location.pathname)
  );

  useEffect(() => {
    const insertTemplate = effect(
      switchMap(({ template, mode }: { template: string; mode: string }) => {
        return fromPromise(async abort => {
          const templateZip = await fetch(template, { signal: abort });
          const templateBlob = await templateZip.blob();
          throwIfAborted(abort);
          const [doc] = await ZipTransformer.importDocs(
            currentWorkspace.docCollection,
            templateBlob
          );
          doc.resetHistory();

          return { doc, mode };
        }).pipe(
          timeout(10000 /* 10s */),
          mergeMap(({ mode, doc }) => {
            docsList.setMode(doc.id, mode as DocMode);
            workbench.openDoc(doc.id);
            return EMPTY;
          }),
          onStart(() => {
            pushGlobalLoadingEvent({
              key: 'insert-template',
            });
          }),
          catchError(err => {
            console.error(err);
            toast(t['com.affine.ai.template-insert.failed']());
            return EMPTY;
          }),
          finalize(() => {
            resolveGlobalLoadingEvent('insert-template');
          })
        );
      })
    );

    const disposable = AIProvider.slots.requestInsertTemplate.on(
      ({ template, mode }) => {
        insertTemplate({ template, mode });
      }
    );
    return () => {
      disposable.dispose();
      insertTemplate.unsubscribe();
    };
  }, [
    currentWorkspace.docCollection,
    docsList,
    pushGlobalLoadingEvent,
    resolveGlobalLoadingEvent,
    t,
    workbench,
  ]);

  useRegisterWorkspaceCommands();
  useRegisterNavigationCommands();
  useRegisterFindInPageCommands();

  useEffect(() => {
    // hotfix for blockVersions
    // this is a mistake in the
    //    0.8.0 ~ 0.8.1
    //    0.8.0-beta.0 ~ 0.8.0-beta.3
    //    0.8.0-canary.17 ~ 0.9.0-canary.3
    const meta = currentWorkspace.docCollection.doc.getMap('meta');
    const blockVersions = meta.get('blockVersions');
    if (
      !(blockVersions instanceof YMap) &&
      blockVersions !== null &&
      blockVersions !== undefined &&
      typeof blockVersions === 'object'
    ) {
      meta.set(
        'blockVersions',
        new YMap(Object.entries(blockVersions as Record<string, number>))
      );
    }
  }, [currentWorkspace.docCollection.doc]);

  const handleCreatePage = useCallback(() => {
    return pageHelper.createPage();
  }, [pageHelper]);

  const cmdkQuickSearchService = useService(CMDKQuickSearchService);
  const handleOpenQuickSearchModal = useCallback(() => {
    cmdkQuickSearchService.toggle();
    mixpanel.track('QuickSearchOpened', {
      segment: 'navigation panel',
      control: 'search button',
    });
  }, [cmdkQuickSearchService]);

  const setOpenSettingModalAtom = useSetAtom(openSettingModalAtom);

  const handleOpenSettingModal = useCallback(() => {
    setOpenSettingModalAtom({
      activeTab: 'appearance',
      open: true,
    });
    mixpanel.track('SettingsViewed', {
      // page:
      segment: 'navigation panel',
      module: 'general list',
      control: 'settings button',
    });
  }, [setOpenSettingModalAtom]);

  const resizing = useAtomValue(appSidebarResizingAtom);

  const sensors = useSensors(
    useSensor(
      MouseSensor,
      useMemo(
        /* useMemo is necessary to avoid re-render */
        () => ({
          activationConstraint: {
            distance: 10,
          },
        }),
        []
      )
    )
  );

  const { handleDragEnd } = useGlobalDNDHelper();
  const { appSettings } = useAppSettingHelper();

  return (
    <>
      {/* This DndContext is used for drag page from all-pages list into a folder in sidebar */}
      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
        <AppContainer data-current-path={currentPath} resizing={resizing}>
          <RootAppSidebar
            isPublicWorkspace={false}
            onOpenQuickSearchModal={handleOpenQuickSearchModal}
            onOpenSettingModal={handleOpenSettingModal}
            currentWorkspace={currentWorkspace}
            openPage={useCallback(
              (pageId: string) => {
                assertExists(currentWorkspace);
                return openPage(currentWorkspace.id, pageId);
              },
              [currentWorkspace, openPage]
            )}
            createPage={handleCreatePage}
            paths={pathGenerator}
          />

          <MainContainer clientBorder={appSettings.clientBorder}>
            {needUpgrade || upgrading ? <WorkspaceUpgrade /> : children}
          </MainContainer>
        </AppContainer>
        <GlobalDragOverlay />
      </DndContext>
      <QuickSearchContainer />
      <SyncAwareness />
    </>
  );
};

function GlobalDragOverlay() {
  const { active, over } = useDndContext();
  const [preview, setPreview] = useState<ReactNode>();

  useEffect(() => {
    if (active) {
      const data = active.data.current as DraggableTitleCellData;
      setPreview(data.preview);
    }
    // do not update content since it may disappear because of virtual rendering
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active?.id]);

  const intent = resolveDragEndIntent(active, over);

  const overDropZone =
    intent === 'pin:add' ||
    intent === 'collection:add' ||
    intent === 'trash:move-to';

  const accent =
    intent === 'pin:remove'
      ? 'warning'
      : intent === 'trash:move-to'
        ? 'error'
        : 'normal';

  const sorting = intent === 'pin:reorder';

  return createPortal(
    <DragOverlay adjustScale={false} dropAnimation={null}>
      {preview ? (
        <div
          data-over-drop={overDropZone}
          data-sorting={sorting}
          data-accent={accent}
          className={styles.dragOverlay}
        >
          {preview}
        </div>
      ) : null}
    </DragOverlay>,
    document.body
  );
}
