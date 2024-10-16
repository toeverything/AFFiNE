export * from './blocks';
export {
  migratePages as forceUpgradePages,
  migrateGuidCompatibility,
} from './migration/blocksuite'; // campatible with electron
export * from './migration/fixing';
export { migrateToSubdoc, upgradeV1ToV2 } from './migration/subdoc';
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
