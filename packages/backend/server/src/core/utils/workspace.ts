export enum WorkspaceSettingsTab {
  members = 'workspace:members',
}

type SettingsPathParams = {
  workspaceId: string;
  tab: WorkspaceSettingsTab;
};

/**
 * To generate a workspace settings url path like
 *
 * /workspace/{workspaceId}/settings?tab={tab}
 */
export function generateWorkspaceSettingsPath(params: SettingsPathParams) {
  const search = new URLSearchParams({
    tab: params.tab,
  });
  return `/workspace/${params.workspaceId}/settings?${search.toString()}`;
}
