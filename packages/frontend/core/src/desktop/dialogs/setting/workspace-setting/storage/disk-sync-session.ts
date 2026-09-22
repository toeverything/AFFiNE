export function shouldReloadDiskSyncSession(
  enabled: boolean,
  previousFolder: string | null,
  nextFolder: string | null
) {
  return enabled && previousFolder !== nextFolder;
}
