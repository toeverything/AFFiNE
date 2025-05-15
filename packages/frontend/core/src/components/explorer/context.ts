import { LiveData } from '@toeverything/infra';
import { createContext } from 'react';

import type { DocListItemView } from './docs-view/doc-list-item';
import type { ExplorerPreference } from './types';

export type DocExplorerContextType = {
  view$: LiveData<DocListItemView>;
  groups$: LiveData<Array<{ key: string; items: string[] }>>;
  selectMode$?: LiveData<boolean>;
  selectedDocIds$: LiveData<string[]>;
  prevCheckAnchorId$?: LiveData<string | null>;
} & {
  [K in keyof Omit<ExplorerPreference, 'filters'> as `${K}$`]: LiveData<
    ExplorerPreference[K]
  >;
};

export const DocExplorerContext = createContext<DocExplorerContextType>(
  {} as any
);

export const createDocExplorerContext = () =>
  ({
    view$: new LiveData<DocListItemView>('list'),
    groups$: new LiveData<Array<{ key: string; items: string[] }>>([]),
    selectMode$: new LiveData<boolean>(false),
    selectedDocIds$: new LiveData<string[]>([]),
    prevCheckAnchorId$: new LiveData<string | null>(null),
    groupBy$: new LiveData<ExplorerPreference['groupBy']>(undefined),
    orderBy$: new LiveData<ExplorerPreference['orderBy']>(undefined),
    displayProperties$: new LiveData<ExplorerPreference['displayProperties']>(
      []
    ),
    showDocIcon$: new LiveData<ExplorerPreference['showDocIcon']>(true),
    showDocPreview$: new LiveData<ExplorerPreference['showDocPreview']>(true),
    quickFavorite$: new LiveData<ExplorerPreference['quickFavorite']>(false),
    quickSelect$: new LiveData<ExplorerPreference['quickSelect']>(false),
    quickSplit$: new LiveData<ExplorerPreference['quickSplit']>(false),
    quickTrash$: new LiveData<ExplorerPreference['quickTrash']>(false),
    quickTab$: new LiveData<ExplorerPreference['quickTab']>(false),
  }) satisfies DocExplorerContextType;
