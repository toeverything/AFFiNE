import { LiveData } from '@toeverything/infra';
import { uniq } from 'lodash-es';
import { createContext } from 'react';

import type { ExplorerDisplayPreference } from './types';

const DefaultDisplayPreference: ExplorerDisplayPreference = {
  view: 'list',
  displayProperties: [
    'system:createdAt',
    'system:updatedAt',
    'system:createdBy',
    'system:tags',
  ],
  showDocIcon: true,
  showDocPreview: true,
  quickFavorite: true,
};

export type DocExplorerContextType = {
  groups$: LiveData<Array<{ key: string; items: string[] }>>;
  collapsedGroups$: LiveData<string[]>;
  selectMode$?: LiveData<boolean>;
  selectedDocIds$: LiveData<string[]>;
  prevCheckAnchorId$?: LiveData<string | null>;
  displayPreference$: LiveData<ExplorerDisplayPreference>;
} & {
  [K in keyof ExplorerDisplayPreference as `${K}$`]: LiveData<
    ExplorerDisplayPreference[K]
  >;
};

export const DocExplorerContext = createContext<DocExplorerContextType>(
  {} as any
);

export const createDocExplorerContext = (
  initialState?: ExplorerDisplayPreference
) => {
  const displayPreference$ = new LiveData<ExplorerDisplayPreference>({
    ...DefaultDisplayPreference,
    ...initialState,
    displayProperties: uniq([
      ...(DefaultDisplayPreference.displayProperties ?? []),
      ...(initialState?.displayProperties ?? []),
    ]),
  });
  return {
    groups$: new LiveData<Array<{ key: string; items: string[] }>>([]),
    collapsedGroups$: new LiveData<string[]>([]),
    selectMode$: new LiveData<boolean>(false),
    selectedDocIds$: new LiveData<string[]>([]),
    prevCheckAnchorId$: new LiveData<string | null>(null),
    displayPreference$: displayPreference$,
    view$: displayPreference$.selector(
      displayPreference => displayPreference.view
    ),
    groupBy$: displayPreference$.selector(
      displayPreference => displayPreference.groupBy
    ),
    orderBy$: displayPreference$.selector(
      displayPreference => displayPreference.orderBy
    ),
    displayProperties$: displayPreference$.selector(
      displayPreference => displayPreference.displayProperties
    ),
    showDocIcon$: displayPreference$.selector(
      displayPreference => displayPreference.showDocIcon
    ),
    showDocPreview$: displayPreference$.selector(
      displayPreference => displayPreference.showDocPreview
    ),
    quickFavorite$: displayPreference$.selector(
      displayPreference => displayPreference.quickFavorite
    ),
    quickSelect$: displayPreference$.selector(
      displayPreference => displayPreference.quickSelect
    ),
    quickSplit$: displayPreference$.selector(
      displayPreference => displayPreference.quickSplit
    ),
    quickTrash$: displayPreference$.selector(
      displayPreference => displayPreference.quickTrash
    ),
    quickTab$: displayPreference$.selector(
      displayPreference => displayPreference.quickTab
    ),
  } satisfies DocExplorerContextType;
};
