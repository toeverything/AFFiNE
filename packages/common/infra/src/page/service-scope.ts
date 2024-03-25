import type { ServiceScope } from '../di';
import { createScope } from '../di';
import { WorkspaceScope } from '../workspace';

export const PageScope: ServiceScope = createScope('page', WorkspaceScope);
