import { Menu } from '@affine/component/ui/menu';
import { WorkspaceFlavour } from '@affine/env/workspace';
import {
  initEmptyPage,
  useLiveData,
  useService,
  WorkspacesService,
} from '@toeverything/infra';
import {
  lazy,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { type LoaderFunction, useSearchParams } from 'react-router-dom';

import { createFirstAppData } from '../bootstrap/first-app-data';
import { UserWithWorkspaceList } from '../components/pure/workspace-slider-bar/user-with-workspace-list';
import { WorkspaceFallback } from '../components/workspace';
import { useNavigateHelper } from '../hooks/use-navigate-helper';
import { AuthService } from '../modules/cloud';
import { WorkspaceSubPath } from '../shared';

const AllWorkspaceModals = lazy(() =>
  import('../providers/modal-provider').then(({ AllWorkspaceModals }) => ({
    default: AllWorkspaceModals,
  }))
);

export const loader: LoaderFunction = async () => {
  return null;
};

export const Component = () => {
  // navigating and creating may be slow, to avoid flickering, we show workspace fallback
  const [navigating, setNavigating] = useState(true);
  const [creating, setCreating] = useState(false);
  const authService = useService(AuthService);
  const loggedIn = useLiveData(
    authService.session.status$.map(s => s === 'authenticated')
  );

  const workspacesService = useService(WorkspacesService);
  const list = useLiveData(workspacesService.list.workspaces$);
  const listIsLoading = useLiveData(workspacesService.list.isLoading$);

  const { openPage } = useNavigateHelper();
  const [searchParams] = useSearchParams();

  const createOnceRef = useRef(false);

  const createCloudWorkspace = useCallback(() => {
    if (createOnceRef.current) return;
    createOnceRef.current = true;
    workspacesService
      .create(WorkspaceFlavour.AFFINE_CLOUD, async workspace => {
        workspace.meta.setName('AFFiNE Cloud');
        const page = workspace.createDoc();
        initEmptyPage(page);
      })
      .then(workspace => openPage(workspace.id, WorkspaceSubPath.ALL))
      .catch(err => console.error('Failed to create cloud workspace', err));
  }, [openPage, workspacesService]);

  useLayoutEffect(() => {
    if (listIsLoading) {
      return;
    }

    // check is user logged in && has cloud workspace
    if (searchParams.get('initCloud') === 'true' && loggedIn) {
      searchParams.delete('initCloud');
      if (list.every(w => w.flavour !== WorkspaceFlavour.AFFINE_CLOUD)) {
        createCloudWorkspace();
        return;
      }
    }

    if (list.length === 0) {
      setNavigating(false);
      return;
    }

    // open last workspace
    const lastId = localStorage.getItem('last_workspace_id');

    const openWorkspace = list.find(w => w.id === lastId) ?? list[0];
    openPage(openWorkspace.id, WorkspaceSubPath.ALL);
  }, [
    createCloudWorkspace,
    list,
    openPage,
    searchParams,
    listIsLoading,
    loggedIn,
    navigating,
  ]);

  useEffect(() => {
    setCreating(true);
    createFirstAppData(workspacesService)
      .then(workspaceMeta => {
        if (workspaceMeta) {
          openPage(workspaceMeta.id, WorkspaceSubPath.ALL);
        }
      })
      .catch(err => {
        console.error('Failed to create first app data', err);
      })
      .finally(() => {
        setCreating(false);
      });
  }, [openPage, workspacesService]);

  if (navigating || creating) {
    return <WorkspaceFallback></WorkspaceFallback>;
  }

  // TODO: We need a no workspace page
  return (
    <>
      <div
        style={{
          position: 'fixed',
          left: '50%',
          top: '50%',
        }}
      >
        <Menu
          rootOptions={{
            open: true,
          }}
          items={<UserWithWorkspaceList />}
          contentOptions={{
            style: {
              width: 300,
              transform: 'translate(-50%, -50%)',
              borderRadius: '8px',
              boxShadow: 'var(--affine-shadow-2)',
              backgroundColor: 'var(--affine-background-overlay-panel-color)',
              padding: '16px 12px',
            },
          }}
        >
          <div></div>
        </Menu>
      </div>
      <AllWorkspaceModals />
    </>
  );
};
