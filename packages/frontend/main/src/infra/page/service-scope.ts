import { createScope, type ServiceScope } from '../di';
import { WorkspaceScope } from '../workspace';

export const PageScope: ServiceScope = createScope('page', WorkspaceScope);
