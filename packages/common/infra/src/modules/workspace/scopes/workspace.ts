import { Scope } from '../../../framework';
import type { WorkspaceOpenOptions } from '../open-options';
import type { WorkspaceEngineProvider } from '../providers/flavour';

export type { DocCollection } from '@blocksuite/affine/store';

export class WorkspaceScope extends Scope<{
  openOptions: WorkspaceOpenOptions;
  engineProvider: WorkspaceEngineProvider;
}> {}
