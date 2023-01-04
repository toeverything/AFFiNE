export interface Workspace {
  name: string; // 名称
  id: string; //唯一标识
  isPublish?: boolean; // 是否公开
  isLocal?: boolean; // 是否全部数据都在本地
  avatar?: string; // 封面
  type: 'local' | 'cloud' | 'share'; // cloud: 云端（本次暂不支持），local: 本地，share: 分享
  workspaceOwner?: User; // 本地工作空间的拥有者
}

interface User {
  name: string;
  id: string;
  email: string;
  avatar: string;
}

export function getWorkspaceList(): Workspace[] {
  const workspacesMeta = JSON.parse(
    localStorage.getItem('affine-workspace') ?? '[]'
  );
  return workspacesMeta;
}

export function getPagesByWorkspaceId(workspaceId: string) {
  if (!workspaceId) return [];
  const workspacesMeta = [];
  for (let i = 0; i < 10; i++) {
    workspacesMeta.push({
      id: 'page-' + i,
      name: 'page ' + i,
    });
  }
}

export function addWorkSpace(workspaceData: Workspace) {
  const workspacesMeta = getWorkspaceList();
  workspacesMeta.push(workspaceData);
  localStorage.setItem('affine-workspace', JSON.stringify(workspacesMeta));
}

export function deleteWorkspaceById(workspaceId: string) {
  const workspacesMeta = getWorkspaceList();
  const newWorkspacesMeta = workspacesMeta.filter(() => {
    return workspaceId !== workspaceId;
  });
  localStorage.setItem('affine-workspace', JSON.stringify(newWorkspacesMeta));
}

export function updateWorkspaceById(
  workspaceId: string,
  workspaceData: Workspace
) {
  const workspacesMeta = getWorkspaceList();
  const newWorkspacesMeta = workspacesMeta.map((workspace: Workspace) => {
    if (workspace.id === workspaceId) {
      return workspaceData;
    }
    return workspace;
  });
  localStorage.setItem('affine-workspace', JSON.stringify(newWorkspacesMeta));
}
export function createWorkspace(workspaceName: string) {
  const workspaceData = {
    name: workspaceName,
    id: 'workspace-' + Date.now(),
    isPublish: false,
    isLocal: true,
    avatar: '',
    type: 'local',
  } as Workspace;
  const workspacesMeta = getWorkspaceList();
  workspacesMeta.push(workspaceData);
  localStorage.setItem('affine-workspace', JSON.stringify(workspacesMeta));
}
