import { Scope } from '../../../framework';
import type { WorkspaceOpenOptions } from '../open-options';
import type { WorkspaceFlavourProvider } from '../providers/flavour';

export type { DocCollection } from '@blocksuite/store';

export class WorkspaceScope extends Scope<{
  openOptions: WorkspaceOpenOptions;
  flavourProvider: WorkspaceFlavourProvider;
}> {}
