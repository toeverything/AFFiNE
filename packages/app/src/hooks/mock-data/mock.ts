export interface Workspace {
  name: string; // 名称
  id: string; //唯一标识
  isPublish?: boolean; // 是否公开
  isLocal?: boolean; // 是否全部数据都在本地
  avatar?: string; // 封面
  type: 'local' | 'cloud' | 'join'; // cloud: 云端（本次暂不支持），local: 本地，join : 加入别人的
  workspaceOwner?: User; // 本地工作空间的拥有者
}

export interface User {
  name: string;
  id: string;
  email: string;
  avatar: string;
}

export function updateWorkspaceMeta(
  workspaceId: string,
  workspaceData: { name?: string; avatar?: string }
) {
  const workspacesMeta = getWorkspaces();
  const newWorkspacesMeta = workspacesMeta.map((workspace: Workspace) => {
    if (workspace.id === workspaceId) {
      workspaceData.name && (workspace.name = workspaceData.name);
      workspaceData.avatar && (workspace.avatar = workspaceData.avatar);
      return workspaceData;
    }
    return workspace;
  });
  localStorage.setItem('affine-workspace', JSON.stringify(newWorkspacesMeta));
  const activeWorkspace = getActiveWorkspace();
  workspaceData.name && (activeWorkspace.name = workspaceData.name);
  workspaceData.avatar && (activeWorkspace.avatar = workspaceData.avatar);
  setActiveWorkspace(activeWorkspace);
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
  const workspacesMeta = getWorkspaces();
  workspacesMeta.push(workspaceData);
  localStorage.setItem('affine-workspace', JSON.stringify(workspacesMeta));
  setActiveWorkspace(workspaceData);
}

export function getWorkspaces(): Workspace[] {
  const workspacesMeta = JSON.parse(
    localStorage.getItem('affine-workspace') ?? '[]'
  );
  return workspacesMeta;
}

export function deleteWorkspace(workspaceId: string) {
  const workspacesMeta = getWorkspaces();
  const newWorkspacesMeta = workspacesMeta.filter(() => {
    return workspaceId !== workspaceId;
  });
  localStorage.setItem('affine-workspace', JSON.stringify(newWorkspacesMeta));
}

export function getMembers(id: string): User[] {
  const memberMap = JSON.parse(localStorage.getItem('affine-member') ?? '{}');
  return memberMap[id] || [];
}

export function leaveWorkspace(id: string) {
  return true;
}

export function setWorkspacePublish(id: string, isPublish: boolean): boolean {
  const workspacesMeta = getWorkspaces();
  const newWorkspacesMeta = workspacesMeta.map((workspace: Workspace) => {
    if (workspace.id === id) {
      workspace.isPublish = isPublish;
    }
    return workspace;
  });
  localStorage.setItem('affine-workspace', JSON.stringify(newWorkspacesMeta));
  return isPublish;
}

export function getWorkspaceById(id: string) {
  const workspacesMeta = getWorkspaces();
  return workspacesMeta.find((workspace: Workspace) => {
    return workspace.id === id;
  });
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

export function getActiveWorkspace(): Workspace {
  return JSON.parse(localStorage.getItem('affine-active-workspace') ?? '{}');
}

export function setActiveWorkspace(workspaceData: Workspace) {
  localStorage.setItem(
    'affine-active-workspace',
    JSON.stringify(workspaceData)
  );
}

export function getUserInfo(): User {
  return JSON.parse(localStorage.getItem('affine-user') ?? 'null');
}

export function Login(): void {
  localStorage.setItem(
    'affine-user',
    JSON.stringify({
      name: 'Diamond',
      id: 'ttt',
      email: 'diamond.shx@gmail.com',
      avatar: 'string',
    })
  );
}

export function SignOut(): void {
  localStorage.removeItem('affine-user');
}
