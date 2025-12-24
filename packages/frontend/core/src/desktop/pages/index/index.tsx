import { DefaultServerService } from '@affine/core/modules/cloud';
import { DesktopApiService } from '@affine/core/modules/desktop-api';
import { WorkspacesService } from '@affine/core/modules/workspace';
import {
  buildShowcaseWorkspace,
  createFirstAppData,
} from '@affine/core/utils/first-app-data';
import { ServerFeature } from '@affine/graphql';
import {
  useLiveData,
  useService,
  useServiceOptional,
} from '@toeverything/infra';
import {
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { useSearchParams } from 'react-router-dom';

import {
  RouteLogic,
  useNavigateHelper,
} from '../../../components/hooks/use-navigate-helper';
import { WorkspaceNavigator } from '../../../components/workspace-selector';
import { AuthService } from '../../../modules/cloud';
import { AppContainer } from '../../components/app-container';

/**
 * index page
 *
 * query string:
 * - initCloud: boolean, if true, when user is logged in, create a cloud workspace
 */
export const Component = ({
  defaultIndexRoute = 'all',
  children,
  fallback,
}: {
  defaultIndexRoute?: string;
  children?: ReactNode;
  fallback?: ReactNode;
}) => {
  // navigating and creating may be slow, to avoid flickering, we show workspace fallback
  const [navigating, setNavigating] = useState(true);
  const [creating, setCreating] = useState(false);
  const authService = useService(AuthService);
  const defaultServerService = useService(DefaultServerService);

  const loggedIn = useLiveData(
    authService.session.status$.map(s => s === 'authenticated')
  );
  const enableLocalWorkspace =
    useLiveData(
      defaultServerService.server.config$.selector(
        c =>
          c.features.includes(ServerFeature.LocalWorkspace) ||
          BUILD_CONFIG.isNative
      )
    ) ?? true;

  const workspacesService = useService(WorkspacesService);
  const list = useLiveData(workspacesService.list.workspaces$);
  const listIsLoading = useLiveData(workspacesService.list.isRevalidating$);

  const { openPage, jumpToPage, jumpToSignIn } = useNavigateHelper();
  const [searchParams] = useSearchParams();

  const createOnceRef = useRef(false);

  const createCloudWorkspace = useCallback(() => {
    if (createOnceRef.current) return;
    createOnceRef.current = true;
    // TODO: support selfhosted
    buildShowcaseWorkspace(workspacesService, 'affine-cloud', 'AFFiNE Cloud')
      .then(({ meta, defaultDocId }) => {
        if (defaultDocId) {
          jumpToPage(meta.id, defaultDocId);
        } else {
          openPage(meta.id, defaultIndexRoute);
        }
      })
      .catch(err => console.error('Failed to create cloud workspace', err));
  }, [defaultIndexRoute, jumpToPage, openPage, workspacesService]);

  useLayoutEffect(() => {
    if (!navigating) {
      return;
    }

    if (listIsLoading) {
      return;
    }

    if (!enableLocalWorkspace && !loggedIn) {
      localStorage.removeItem('last_workspace_id');
      jumpToSignIn();
      return;
    }

    // check is user logged in && has cloud workspace
    if (searchParams.get('initCloud') === 'true') {
      if (loggedIn) {
        if (list.every(w => w.flavour !== 'affine-cloud')) {
          createCloudWorkspace();
          return;
        }

        // open first cloud workspace
        const openWorkspace =
          list.find(w => w.flavour === 'affine-cloud') ?? list[0];
        openPage(openWorkspace.id, defaultIndexRoute);
      } else {
        return;
      }
    } else {
      if (list.length === 0) {
        setNavigating(false);
        return;
      }
      // open last workspace
      const lastId = localStorage.getItem('last_workspace_id');

      const openWorkspace = list.find(w => w.id === lastId) ?? list[0];
      openPage(openWorkspace.id, defaultIndexRoute, RouteLogic.REPLACE);
    }
  }, [
    enableLocalWorkspace,
    createCloudWorkspace,
    list,
    openPage,
    searchParams,
    jumpToSignIn,
    listIsLoading,
    loggedIn,
    navigating,
    defaultIndexRoute,
  ]);

  const desktopApi = useServiceOptional(DesktopApiService);

  useEffect(() => {
    desktopApi?.handler.ui.pingAppLayoutReady().catch(console.error);
  }, [desktopApi]);

  useEffect(() => {
    if (listIsLoading || list.length > 0 || !enableLocalWorkspace) {
      return;
    }

    createFirstAppData(workspacesService)
      .then(createdWorkspace => {
        if (createdWorkspace) {
          if (createdWorkspace.defaultPageId) {
            jumpToPage(
              createdWorkspace.meta.id,
              createdWorkspace.defaultPageId
            );
          } else {
            openPage(createdWorkspace.meta.id, 'all');
          }
        }
      })
      .catch(err => {
        console.error('Failed to create first app data', err);
      })
      .finally(() => {
        setCreating(false);
      });
  }, [
    jumpToPage,
    jumpToSignIn,
    openPage,
    workspacesService,
    loggedIn,
    listIsLoading,
    list,
    enableLocalWorkspace,
  ]);

  if (navigating || creating) {
    return fallback ?? <AppContainer fallback />;
  }

  // TODO(@eyhn): We need a no workspace page
  return (
    children ?? (
      <div
        style={{
          position: 'fixed',
          left: 'calc(50% - 150px)',
          top: '50%',
        }}
      >
        <WorkspaceNavigator
          open={true}
          menuContentOptions={{
            forceMount: true,
          }}
        />
      </div>
    )
  );
};
