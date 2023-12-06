export * from './initialization';
export * from './migration/blob';
export { migratePages as forceUpgradePages } from './migration/blocksuite'; // campatible with electron
export * from './migration/fixing';
export { migrateToSubdoc } from './migration/subdoc';
export * from './migration/workspace';

/**
 * @deprecated
 * Use workspace meta data to determine the workspace version.
 */
export enum WorkspaceVersion {
  // v1 is treated as undefined
  SubDoc = 2,
  DatabaseV3 = 3,
  Surface = 4,
}
