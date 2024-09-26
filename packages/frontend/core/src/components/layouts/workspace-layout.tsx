import { toast } from '@affine/component';
import {
  pushGlobalLoadingEventAtom,
  resolveGlobalLoadingEventAtom,
} from '@affine/component/global-loading';
import { SidebarSwitch } from '@affine/core/modules/app-sidebar/views';
import { useI18n } from '@affine/i18n';
import { type DocMode, ZipTransformer } from '@blocksuite/affine/blocks';
import {
  DocsService,
  effect,
  fromPromise,
  LiveData,
  onStart,
  throwIfAborted,
  useLiveData,
  useService,
  useServices,
  WorkspaceService,
} from '@toeverything/infra';
import { useSetAtom } from 'jotai';
import type { PropsWithChildren } from 'react';
import { useEffect } from 'react';
import {
  catchError,
  EMPTY,
  finalize,
  mergeMap,
  switchMap,
  timeout,
} from 'rxjs';
import { Map as YMap } from 'yjs';

import { AIProvider } from '../../blocksuite/presets/ai';
import { AppTabsHeader } from '../../modules/app-tabs-header';
import { EditorSettingService } from '../../modules/editor-settting';
import { NavigationButtons } from '../../modules/navigation';
import { useRegisterNavigationCommands } from '../../modules/navigation/view/use-register-navigation-commands';
import { QuickSearchContainer } from '../../modules/quicksearch';
import { WorkbenchService } from '../../modules/workbench';
import { WorkspaceAIOnboarding } from '../affine/ai-onboarding';
import { AppContainer } from '../affine/app-container';
import { SyncAwareness } from '../affine/awareness';
import { useRegisterFindInPageCommands } from '../hooks/affine/use-register-find-in-page-commands';
import { useRegisterWorkspaceCommands } from '../hooks/use-register-workspace-commands';
import { OverCapacityNotification } from '../over-capacity';
import { CurrentWorkspaceModals } from '../providers/modal-provider';
import { SWRConfigProvider } from '../providers/swr-config-provider';
import { AIIsland } from '../pure/ai-island';
import { RootAppSidebar } from '../root-app-sidebar';
import { MainContainer } from '../workspace';
import { WorkspaceUpgrade } from '../workspace-upgrade';
import * as styles from './styles.css';

export const WorkspaceLayout = function WorkspaceLayout({
  children,
}: PropsWithChildren) {
  return (
    <SWRConfigProvider>
      {/* load all workspaces is costly, do not block the whole UI */}
      <CurrentWorkspaceModals />
      <WorkspaceLayoutInner>{children}</WorkspaceLayoutInner>
      {/* should show after workspace loaded */}
      <WorkspaceAIOnboarding />
      <AIIsland />
    </SWRConfigProvider>
  );
};

export const WorkspaceLayoutProviders = ({ children }: PropsWithChildren) => {
  const t = useI18n();
  const pushGlobalLoadingEvent = useSetAtom(pushGlobalLoadingEventAtom);
  const resolveGlobalLoadingEvent = useSetAtom(resolveGlobalLoadingEventAtom);
  const { workspaceService, docsService } = useServices({
    WorkspaceService,
    DocsService,
    EditorSettingService,
  });
  const currentWorkspace = workspaceService.workspace;
  const docsList = docsService.list;

  const workbench = useService(WorkbenchService).workbench;
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
          if (doc) {
            doc.resetHistory();
          }

          return { doc, mode };
        }).pipe(
          timeout(10000 /* 10s */),
          mergeMap(({ mode, doc }) => {
            if (doc) {
              docsList.setPrimaryMode(doc.id, mode as DocMode);
              workbench.openDoc(doc.id);
            }
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

  return (
    <>
      {/* This DndContext is used for drag page from all-pages list into a folder in sidebar */}
      {children}
      <QuickSearchContainer />
      <SyncAwareness />
      <OverCapacityNotification />
    </>
  );
};

const DesktopLayout = ({ children }: PropsWithChildren) => {
  return (
    <div className={styles.desktopAppViewContainer}>
      <div className={styles.desktopTabsHeader}>
        <AppTabsHeader
          left={
            <>
              <SidebarSwitch show />
              <NavigationButtons />
            </>
          }
        />
      </div>
      <div className={styles.desktopAppViewMain}>
        <RootAppSidebar />
        <MainContainer>{children}</MainContainer>
      </div>
    </div>
  );
};

const BrowserLayout = ({ children }: PropsWithChildren) => {
  return (
    <div className={styles.browserAppViewContainer}>
      <RootAppSidebar />
      <MainContainer>{children}</MainContainer>
    </div>
  );
};

const LayoutComponent = BUILD_CONFIG.isElectron ? DesktopLayout : BrowserLayout;

/**
 * Wraps the workspace layout main router view
 */
const WorkspaceLayoutUIContainer = ({ children }: PropsWithChildren) => {
  const workbench = useService(WorkbenchService).workbench;
  const currentPath = useLiveData(
    LiveData.computed(get => {
      return get(workbench.basename$) + get(workbench.location$).pathname;
    })
  );

  return (
    <AppContainer data-current-path={currentPath}>
      <LayoutComponent>{children}</LayoutComponent>
    </AppContainer>
  );
};
export const WorkspaceLayoutInner = ({ children }: PropsWithChildren) => {
  const workspace = useService(WorkspaceService).workspace;

  const upgrading = useLiveData(workspace.upgrade.upgrading$);
  const needUpgrade = useLiveData(workspace.upgrade.needUpgrade$);

  return (
    <WorkspaceLayoutProviders>
      <WorkspaceLayoutUIContainer>
        {needUpgrade || upgrading ? <WorkspaceUpgrade /> : children}
      </WorkspaceLayoutUIContainer>
    </WorkspaceLayoutProviders>
  );
};
