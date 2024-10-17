import {
  type Framework,
  GlobalCache,
  WorkspaceScope,
} from '@toeverything/infra';

import { NoteExplorer } from './entities/explore-note';
import { ExplorerSection } from './entities/explore-section';
import { ExplorerService } from './services/explorer';
export { ExplorerService } from './services/explorer';
export type { CollapsibleSectionName } from './types';
export { CollapsibleSection } from './views/layouts/collapsible-section';
export { ExplorerMobileContext } from './views/mobile.context';
export { ExplorerCollections } from './views/sections/collections';
export { ExplorerFavorites } from './views/sections/favorites';
export { ExplorerMigrationFavorites } from './views/sections/migration-favorites';
export { ExplorerOrganize } from './views/sections/organize';

export function configureExplorerModule(framework: Framework) {
  framework
    .scope(WorkspaceScope)
    .service(ExplorerService)
    .entity(ExplorerSection, [GlobalCache])
    .entity(NoteExplorer, [GlobalCache]);
}
