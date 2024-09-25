import { createIdentifier, type Memento } from '@toeverything/infra';

export interface AppSidebarLocalState extends Memento {}

export const AppSidebarLocalState = createIdentifier<AppSidebarLocalState>(
  'AppSidebarLocalState'
);
