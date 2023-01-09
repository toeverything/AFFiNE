import { createContext, useContext, useEffect, useState } from 'react';
import type { PropsWithChildren } from 'react';
import { getWorkspaces, User, Workspace } from '@/hooks/mock-data/mock';

type TemporaryContextValue = {
  workspaceMetaList: Workspace[];
  currentWorkspace: Workspace | null;
  user: User | null;

  updateWorkspaceMeta: (
    workspaceId: string,
    workspaceData: {
      name?: string;
      avatar?: string;
      isPublish?: boolean;
      type?: 'local' | 'cloud' | 'join';
    }
  ) => void;

  createWorkspace: (workspaceName: string) => Workspace;

  deleteWorkspace: (workspaceId: string) => void;

  setWorkspacePublish: (id: string, isPublish: boolean) => void;

  setActiveWorkspace: (workspaceData: Workspace) => void;

  login: () => void;

  signOut: () => void;
};
type TemporaryContextProps = PropsWithChildren<Record<string, unknown>>;

export const TemporaryContext = createContext<TemporaryContextValue>({
  workspaceMetaList: [],
  currentWorkspace: null,
  user: null,

  // eslint-disable-next-line @typescript-eslint/no-empty-function
  updateWorkspaceMeta: () => {},

  createWorkspace: () => {
    return {} as Workspace;
  },
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  deleteWorkspace: () => {},
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  setWorkspacePublish: () => {},
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  setActiveWorkspace: () => {},
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  login: () => {},
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  signOut: () => {},
});

export const useTemporaryHelper = () => useContext(TemporaryContext);

export const TemporaryHelperProvider = ({
  children,
}: PropsWithChildren<TemporaryContextProps>) => {
  const [workspaceMetaList, setWorkspaceMetaList] = useState<Workspace[]>([]);
  const [currentWorkspace, setCurrentWorkspace] = useState<Workspace | null>(
    null
  );
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    setWorkspaceMetaList(getWorkspaces());
    setCurrentWorkspace(
      JSON.parse(localStorage.getItem('affine-active-workspace') ?? '{}')
    );
  }, []);

  return (
    <TemporaryContext.Provider
      value={{
        workspaceMetaList,
        currentWorkspace,
        user,

        updateWorkspaceMeta: (workspaceId, workspaceData) => {
          const workspacesMeta = getWorkspaces();
          const newWorkspacesMeta = workspacesMeta.map(
            (workspace: Workspace) => {
              if (workspace.id === workspaceId) {
                const workspaceObj = Object.assign(workspace, workspaceData);
                return workspaceObj;
              }
              return workspace;
            }
          );
          localStorage.setItem(
            'affine-workspace',
            JSON.stringify(newWorkspacesMeta)
          );
          setWorkspaceMetaList(newWorkspacesMeta);
          if (workspaceId === currentWorkspace?.id) {
            setCurrentWorkspace(
              // eslint-disable-next-line @typescript-eslint/ban-ts-comment
              // @ts-ignore
              newWorkspacesMeta.find(v => v.id === currentWorkspace.id)
            );
          }
        },
        createWorkspace: workspaceName => {
          const workspaceData = {
            name: workspaceName,
            id: 'workspace-' + Date.now(),
            isPublish: false,
            isLocal: true,
            avatar: '',
            type: 'local',
          } as Workspace;
          const workspacesMeta = getWorkspaces();
          workspacesMeta.push(workspaceData);
          localStorage.setItem(
            'affine-workspace',
            JSON.stringify(workspacesMeta)
          );

          setWorkspaceMetaList([...workspacesMeta]);
          return workspaceData;
        },
        deleteWorkspace: workspaceId => {
          const workspacesMeta = getWorkspaces();
          const newWorkspacesMeta = workspacesMeta.filter(() => {
            return workspaceId !== workspaceId;
          });
          localStorage.setItem(
            'affine-workspace',
            JSON.stringify(newWorkspacesMeta)
          );
          setWorkspaceMetaList(workspacesMeta);
        },

        setWorkspacePublish: (id, isPublish) => {
          const workspacesMeta = getWorkspaces();
          const newWorkspacesMeta = workspacesMeta.map(
            (workspace: Workspace) => {
              if (workspace.id === id) {
                workspace.isPublish = isPublish;
              }
              return workspace;
            }
          );
          localStorage.setItem(
            'affine-workspace',
            JSON.stringify(newWorkspacesMeta)
          );
          setWorkspaceMetaList(workspacesMeta);
        },
        setActiveWorkspace(workspaceData) {
          localStorage.setItem(
            'affine-active-workspace',
            JSON.stringify(workspaceData)
          );
          setCurrentWorkspace(workspaceData);
        },

        login: () => {
          const userInfo = {
            name: 'Diamond',
            id: 'ttt',
            email: 'diamond.shx@gmail.com',
            avatar: 'string',
          };
          localStorage.setItem('affine-user', JSON.stringify(userInfo));
          setUser(userInfo);
        },

        signOut(): void {
          localStorage.removeItem('affine-user');
          setUser(null);
        },
      }}
    >
      {children}
    </TemporaryContext.Provider>
  );
};

export default TemporaryHelperProvider;
