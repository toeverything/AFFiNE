import {
  type Framework,
  GlobalCache,
  WorkspaceScope,
} from '@toeverything/infra';

import { ExplorerSection } from './entities/explore-section';
import { ExplorerService } from './services/explorer';
export { ExplorerService } from './services/explorer';
export type { CollapsibleSectionName } from './types';
export { CollapsibleSection } from './views/layouts/collapsible-section';
export { ExplorerCollections } from './views/sections/collections';
export { ExplorerFavorites } from './views/sections/favorites';
export { ExplorerMigrationFavorites } from './views/sections/migration-favorites';
export { ExplorerOrganize } from './views/sections/organize';
// for mobile
export { ExplorerTreeRoot } from './views/tree';
export { ExplorerTreeContext } from './views/tree/context';
export type {
  BaseExplorerTreeNodeProps,
  ExplorerTreeNodeIcon,
} from './views/tree/node';
export type { NodeOperation } from './views/tree/types';

export function configureExplorerModule(framework: Framework) {
  framework
    .scope(WorkspaceScope)
    .service(ExplorerService)
    .entity(ExplorerSection, [GlobalCache]);
}
