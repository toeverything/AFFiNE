import { createIdentifier, type Memento } from '@toeverything/infra';

export interface AppSidebarState extends Memento {}

export const AppSidebarState =
  createIdentifier<AppSidebarState>('AppSidebarState');
