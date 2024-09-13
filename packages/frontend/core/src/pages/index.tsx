import { apis } from '@affine/electron-api';
import { WorkspaceFlavour } from '@affine/env/workspace';
import {
  useLiveData,
  useService,
  WorkspacesService,
} from '@toeverything/infra';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { type LoaderFunction, useSearchParams } from 'react-router-dom';

import {
  buildShowcaseWorkspace,
  createFirstAppData,
} from '../bootstrap/first-app-data';
import { AppFallback } from '../components/affine/app-container';
import { useNavigateHelper } from '../components/hooks/use-navigate-helper';
import { WorkspaceNavigator } from '../components/workspace-selector';
import { AuthService } from '../modules/cloud';

export const loader: LoaderFunction = async () => {
  return null;
};

export const Component = ({
  defaultIndexRoute = 'all',
}: {
  defaultIndexRoute?: string;
}) => {
  // navigating and creating may be slow, to avoid flickering, we show workspace fallback
  const [navigating, setNavigating] = useState(true);
  const [creating, setCreating] = useState(false);
  const authService = useService(AuthService);

  const loggedIn = useLiveData(
    authService.session.status$.map(s => s === 'authenticated')
  );

  const workspacesService = useService(WorkspacesService);
  const list = useLiveData(workspacesService.list.workspaces$);
  const listIsLoading = useLiveData(workspacesService.list.isRevalidating$);

  const { openPage, jumpToPage } = useNavigateHelper();
  const [searchParams] = useSearchParams();

  const createOnceRef = useRef(false);

  const createCloudWorkspace = useCallback(() => {
    if (createOnceRef.current) return;
    createOnceRef.current = true;
    buildShowcaseWorkspace(
      workspacesService,
      WorkspaceFlavour.AFFINE_CLOUD,
      'AFFiNE Cloud'
    )
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

    // check is user logged in && has cloud workspace
    if (searchParams.get('initCloud') === 'true') {
      if (loggedIn) {
        if (list.every(w => w.flavour !== WorkspaceFlavour.AFFINE_CLOUD)) {
          createCloudWorkspace();
          return;
        }

        // open first cloud workspace
        const openWorkspace =
          list.find(w => w.flavour === WorkspaceFlavour.AFFINE_CLOUD) ??
          list[0];
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
      openPage(openWorkspace.id, defaultIndexRoute);
    }
  }, [
    createCloudWorkspace,
    list,
    openPage,
    searchParams,
    listIsLoading,
    loggedIn,
    navigating,
    defaultIndexRoute,
  ]);

  useEffect(() => {
    apis?.ui.pingAppLayoutReady().catch(console.error);
  }, []);

  useEffect(() => {
    setCreating(true);
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
  }, [jumpToPage, openPage, workspacesService]);

  if (navigating || creating) {
    return <AppFallback></AppFallback>;
  }

  // TODO(@eyhn): We need a no workspace page
  return (
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
  );
};
