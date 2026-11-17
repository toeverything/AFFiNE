import {
  createTaskIdentity,
  encodeTaskAncestorIdentities,
  TASK_ANCESTOR_IDENTIFIERS_COLUMN_NAME,
  TASK_HIERARCHY_LEVEL_COLUMN_NAME,
  TASK_PARENT_IDENTIFIER_COLUMN_NAME,
} from '@blocksuite/affine-shared/utils';
import type { ReadonlySignal } from '@preact/signals-core';

import { multiSelectPropertyType } from '../../property-presets/multi-select/define.js';
import { selectPropertyType } from '../../property-presets/select/define.js';
import type { TableViewSelectionWithType } from './selection';
import { TableViewRowSelection } from './selection';

export interface TableCell {
  rowId: string;
  setTagDraft?(value: string): void;
}

const TAG_COLUMN_TYPES = new Set<string>([
  selectPropertyType.type,
  multiSelectPropertyType.type,
]);

export type ColumnAccessor<T extends TableCell> = (cell: T) =>
  | {
      valueSetFromString(rowId: string, value: string): void;
      type$: ReadonlySignal<string>;
    }
  | undefined;

export interface StartEditOptions<T extends TableCell> {
  event: KeyboardEvent;
  selection: TableViewSelectionWithType | undefined;
  getCellContainer: (
    groupKey: string | undefined,
    rowIndex: number,
    columnIndex: number
  ) => T | undefined;
  updateSelection: (sel: TableViewSelectionWithType) => void;
  getColumn: ColumnAccessor<T>;
}

export function handleCharStartEdit<T extends TableCell>(
  options: StartEditOptions<T>
): boolean {
  const { event, selection, getCellContainer, updateSelection, getColumn } =
    options;

  const target = event.target as HTMLElement | null;
  if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
    return false;
  }

  if (
    selection &&
    !TableViewRowSelection.is(selection) &&
    !selection.isEditing &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.altKey &&
    event.key.length === 1
  ) {
    const cell = getCellContainer(
      selection.groupKey,
      selection.focus.rowIndex,
      selection.focus.columnIndex
    );
    if (cell) {
      const column = getColumn(cell);
      if (column) {
        if (TAG_COLUMN_TYPES.has(column.type$.value) && cell.setTagDraft) {
          cell.setTagDraft(event.key);
        } else {
          column.valueSetFromString(cell.rowId, event.key);
        }
      }
      updateSelection({ ...selection, isEditing: true });
      event.preventDefault();
      return true;
    }
  }
  return false;
}

export function normalizeHierarchyLevel(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(0, Math.floor(value));
  }
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return Math.max(0, Math.floor(parsed));
    }
  }
  return 0;
}

export function calculateHierarchyIndent(level: number): number {
  const step = 12;
  const max = 96;
  return Math.min(Math.max(0, level) * step, max);
}

const normalizeHierarchyTextValue = (value: unknown): string => {
  if (typeof value === 'string') {
    return value;
  }
  if (
    value &&
    typeof value === 'object' &&
    'toString' in value &&
    typeof value.toString === 'function'
  ) {
    return value.toString();
  }
  return '';
};

const decodeAncestorIdentities = (value: unknown): string[] => {
  const normalized = normalizeHierarchyTextValue(value);
  if (!normalized) {
    return [];
  }
  return normalized
    .split('|')
    .map(token => token.trim())
    .filter(Boolean);
};

type HierarchyMutationContext = {
  rowIds: string[];
  rowId: string;
  docId: string;
  properties: Array<{
    id: string;
    name$: { value: string };
    valueSetFromString: (rowId: string, value: string) => void;
    cellGetOrCreate: (rowId: string) => { jsonValue$: { value: unknown } };
  }>;
};

type HierarchyMutationResult = {
  movedRowId: string;
  movedRange: string[];
  beforeId?: string;
  afterId?: string;
  updatedLevels: Map<string, number>;
  updatedParents: Map<string, string | undefined>;
  updatedAncestors: Map<string, string>;
} | null;

const getHierarchyProps = (
  properties: HierarchyMutationContext['properties']
) => {
  const levelProperty = properties.find(
    property => property.name$.value === TASK_HIERARCHY_LEVEL_COLUMN_NAME
  );
  const parentProperty = properties.find(
    property => property.name$.value === TASK_PARENT_IDENTIFIER_COLUMN_NAME
  );
  const ancestorProperty = properties.find(
    property => property.name$.value === TASK_ANCESTOR_IDENTIFIERS_COLUMN_NAME
  );
  if (!levelProperty || !parentProperty || !ancestorProperty) {
    return null;
  }
  return { levelProperty, parentProperty, ancestorProperty };
};

const subtreeEndIndex = (levels: number[], startIndex: number): number => {
  const rootLevel = levels[startIndex] ?? 0;
  let endIndex = startIndex + 1;
  while (endIndex < levels.length) {
    const level = levels[endIndex] ?? 0;
    if (level <= rootLevel) {
      break;
    }
    endIndex += 1;
  }
  return endIndex;
};

const buildTaskIdentity = (docId: string, rowId: string) =>
  createTaskIdentity({ docId, blockId: rowId });

const applyHierarchyMaps = (
  context: HierarchyMutationContext,
  updatedLevels: Map<string, number>,
  updatedParents: Map<string, string | undefined>,
  updatedAncestors: Map<string, string>
) => {
  const props = getHierarchyProps(context.properties);
  if (!props) {
    return;
  }
  const { levelProperty, parentProperty, ancestorProperty } = props;
  for (const rowId of context.rowIds) {
    const level = updatedLevels.get(rowId);
    if (level != null) {
      levelProperty.valueSetFromString(rowId, `${level}`);
    }

    const parent = updatedParents.get(rowId);
    parentProperty.valueSetFromString(rowId, parent ?? '');

    const ancestors = updatedAncestors.get(rowId) ?? '';
    ancestorProperty.valueSetFromString(rowId, ancestors);
  }
};

export const computeIndentMutation = (
  context: HierarchyMutationContext
): HierarchyMutationResult => {
  const props = getHierarchyProps(context.properties);
  if (!props) {
    return null;
  }
  const { levelProperty, ancestorProperty } = props;
  const rowIndex = context.rowIds.indexOf(context.rowId);
  if (rowIndex <= 0) {
    return null;
  }

  const levels = context.rowIds.map(rowId =>
    normalizeHierarchyLevel(
      levelProperty.cellGetOrCreate(rowId).jsonValue$.value
    )
  );
  const rootLevel = levels[rowIndex] ?? 0;
  const prevIndex = rowIndex - 1;
  const prevLevel = levels[prevIndex] ?? 0;
  const nextRootLevel =
    rootLevel === 0 && prevLevel > 0 ? prevLevel : prevLevel + 1;
  if (nextRootLevel === rootLevel) {
    return null;
  }

  const endIndex = subtreeEndIndex(levels, rowIndex);
  const movedRange = context.rowIds.slice(rowIndex, endIndex);
  const movedSet = new Set(movedRange);
  const rootRowId = context.rowId;
  const rootIdentity = buildTaskIdentity(context.docId, rootRowId);
  const parentRowId = context.rowIds[prevIndex];
  const parentIdentity = parentRowId
    ? buildTaskIdentity(context.docId, parentRowId)
    : undefined;
  const parentAncestors = parentRowId
    ? decodeAncestorIdentities(
        ancestorProperty.cellGetOrCreate(parentRowId).jsonValue$.value
      )
    : [];
  const rootAncestors = [
    ...parentAncestors,
    ...(parentIdentity ? [parentIdentity] : []),
  ];

  const oldRootAncestors = decodeAncestorIdentities(
    ancestorProperty.cellGetOrCreate(rootRowId).jsonValue$.value
  );
  const oldRootPrefix = [...oldRootAncestors, rootIdentity];
  const rootDelta = nextRootLevel - rootLevel;

  const updatedLevels = new Map<string, number>();
  const updatedParents = new Map<string, string | undefined>();
  const updatedAncestors = new Map<string, string>();

  const nextLevelMap = new Map<string, number>();
  for (const rowId of context.rowIds) {
    const currentLevel = levels[context.rowIds.indexOf(rowId)] ?? 0;
    const next = movedSet.has(rowId) ? currentLevel + rootDelta : currentLevel;
    nextLevelMap.set(rowId, next);
    updatedLevels.set(rowId, next);
  }

  for (let i = 0; i < context.rowIds.length; i++) {
    const rowId = context.rowIds[i];
    if (!rowId) continue;
    if (rowId === rootRowId) {
      updatedParents.set(rowId, parentIdentity);
      updatedAncestors.set(rowId, encodeTaskAncestorIdentities(rootAncestors));
      continue;
    }

    const currentAncestors = decodeAncestorIdentities(
      ancestorProperty.cellGetOrCreate(rowId).jsonValue$.value
    );
    if (movedSet.has(rowId)) {
      const replaced =
        oldRootPrefix.length > 0 &&
        oldRootPrefix.every((token, idx) => currentAncestors[idx] === token)
          ? [
              ...rootAncestors,
              rootIdentity,
              ...currentAncestors.slice(oldRootPrefix.length),
            ]
          : currentAncestors;
      updatedAncestors.set(rowId, encodeTaskAncestorIdentities(replaced));
    } else {
      updatedAncestors.set(
        rowId,
        encodeTaskAncestorIdentities(currentAncestors)
      );
    }

    const level = nextLevelMap.get(rowId) ?? 0;
    let directParent: string | undefined;
    for (let j = i - 1; j >= 0; j--) {
      const candidateId = context.rowIds[j];
      if (!candidateId) continue;
      const candidateLevel = nextLevelMap.get(candidateId) ?? 0;
      if (candidateLevel < level) {
        directParent = buildTaskIdentity(context.docId, candidateId);
        break;
      }
    }
    updatedParents.set(rowId, directParent);
  }

  const afterId = context.rowIds[endIndex];
  return {
    movedRowId: rootRowId,
    movedRange,
    beforeId: undefined,
    afterId,
    updatedLevels,
    updatedParents,
    updatedAncestors,
  };
};

export const computeUnindentMutation = (
  context: HierarchyMutationContext
): HierarchyMutationResult => {
  const props = getHierarchyProps(context.properties);
  if (!props) {
    return null;
  }
  const { levelProperty, ancestorProperty } = props;
  const rowIndex = context.rowIds.indexOf(context.rowId);
  if (rowIndex < 0) {
    return null;
  }
  const levels = context.rowIds.map(rowId =>
    normalizeHierarchyLevel(
      levelProperty.cellGetOrCreate(rowId).jsonValue$.value
    )
  );
  const rootLevel = levels[rowIndex] ?? 0;
  if (rootLevel <= 0) {
    return null;
  }

  const endIndex = subtreeEndIndex(levels, rowIndex);
  const movedRange = context.rowIds.slice(rowIndex, endIndex);
  const movedSet = new Set(movedRange);
  const rootRowId = context.rowId;
  const rootIdentity = buildTaskIdentity(context.docId, rootRowId);
  const rootAncestors = decodeAncestorIdentities(
    ancestorProperty.cellGetOrCreate(rootRowId).jsonValue$.value
  );
  const nextRootAncestors = rootAncestors.slice(0, -1);
  const nextParentIdentity = nextRootAncestors.at(-1);
  const oldRootPrefix = [...rootAncestors, rootIdentity];
  const rootDelta = -1;

  const updatedLevels = new Map<string, number>();
  const updatedParents = new Map<string, string | undefined>();
  const updatedAncestors = new Map<string, string>();

  const nextLevelMap = new Map<string, number>();
  for (const rowId of context.rowIds) {
    const currentLevel = levels[context.rowIds.indexOf(rowId)] ?? 0;
    const next = movedSet.has(rowId)
      ? Math.max(0, currentLevel + rootDelta)
      : currentLevel;
    nextLevelMap.set(rowId, next);
    updatedLevels.set(rowId, next);
  }

  for (let i = 0; i < context.rowIds.length; i++) {
    const rowId = context.rowIds[i];
    if (!rowId) continue;
    if (rowId === rootRowId) {
      updatedParents.set(rowId, nextParentIdentity);
      updatedAncestors.set(
        rowId,
        encodeTaskAncestorIdentities(nextRootAncestors)
      );
      continue;
    }

    const currentAncestors = decodeAncestorIdentities(
      ancestorProperty.cellGetOrCreate(rowId).jsonValue$.value
    );
    if (movedSet.has(rowId)) {
      const replaced =
        oldRootPrefix.length > 0 &&
        oldRootPrefix.every((token, idx) => currentAncestors[idx] === token)
          ? [
              ...nextRootAncestors,
              rootIdentity,
              ...currentAncestors.slice(oldRootPrefix.length),
            ]
          : currentAncestors;
      updatedAncestors.set(rowId, encodeTaskAncestorIdentities(replaced));
    } else {
      updatedAncestors.set(
        rowId,
        encodeTaskAncestorIdentities(currentAncestors)
      );
    }

    const level = nextLevelMap.get(rowId) ?? 0;
    let directParent: string | undefined;
    for (let j = i - 1; j >= 0; j--) {
      const candidateId = context.rowIds[j];
      if (!candidateId) continue;
      const candidateLevel = nextLevelMap.get(candidateId) ?? 0;
      if (candidateLevel < level) {
        directParent = buildTaskIdentity(context.docId, candidateId);
        break;
      }
    }
    updatedParents.set(rowId, directParent);
  }

  applyHierarchyMaps(context, updatedLevels, updatedParents, updatedAncestors);

  return {
    movedRowId: rootRowId,
    movedRange,
    updatedLevels,
    updatedParents,
    updatedAncestors,
  };
};

export const applyHierarchyMutation = (
  context: HierarchyMutationContext,
  result: HierarchyMutationResult
) => {
  if (!result) {
    return;
  }
  applyHierarchyMaps(
    context,
    result.updatedLevels,
    result.updatedParents,
    result.updatedAncestors
  );
};
