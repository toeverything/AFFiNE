export function shouldShowDiskSyncPanel(
  isElectron: boolean,
  appBuildType: string
) {
  return isElectron && appBuildType === 'canary';
}

export function shouldReloadDiskSyncSession(
  enabled: boolean,
  previousFolder: string | null,
  nextFolder: string | null
) {
  return enabled && previousFolder !== nextFolder;
}
