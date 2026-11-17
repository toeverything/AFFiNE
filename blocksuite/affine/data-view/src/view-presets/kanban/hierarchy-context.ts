import {
  parseTaskIdentity,
  TASK_HIERARCHY_LEVEL_COLUMN_NAME,
  TASK_PARENT_IDENTIFIER_COLUMN_NAME,
} from '@blocksuite/affine-shared/utils';

export type KanbanHierarchyProperty = {
  id: string;
  name$: { value: string };
  stringValueGet: (rowId: string) => string | undefined;
  cellGetOrCreate?: (rowId: string) => {
    jsonValue$?: { value: unknown };
  };
};

export type KanbanParentContext = {
  parentId: string;
  parentIdentifier: string;
  parentTitle: string;
  parentDisplayName: string;
  level?: number;
};

const getPropertyByName = (
  properties: KanbanHierarchyProperty[],
  name: string
) => properties.find(property => property.name$.value === name);

const getTitleProperty = (properties: KanbanHierarchyProperty[]) =>
  properties.find(property => property.id === 'title') ??
  properties.find(property => property.name$.value === 'Title');

const getTitleValue = (property: KanbanHierarchyProperty, rowId: string) => {
  const jsonValue = property.cellGetOrCreate?.(rowId).jsonValue$?.value;
  if (typeof jsonValue === 'string') {
    return jsonValue.trim();
  }
  return property.stringValueGet(rowId)?.trim();
};

const normalizeLevel = (value: string | undefined) => {
  if (!value?.trim()) {
    return;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : undefined;
};

const getParentIdFromIdentifier = (identifier: string, docId: string) => {
  let parsed: ReturnType<typeof parseTaskIdentity>;
  try {
    parsed = parseTaskIdentity(identifier);
  } catch {
    return;
  }
  if (!parsed || parsed.docId !== docId) {
    return;
  }
  return parsed.blockId;
};

export const getKanbanParentContext = (options: {
  rowId: string;
  docId: string;
  properties: KanbanHierarchyProperty[];
  rowIds?: string[];
}): KanbanParentContext | undefined => {
  const parentProperty = getPropertyByName(
    options.properties,
    TASK_PARENT_IDENTIFIER_COLUMN_NAME
  );
  const titleProperty = getTitleProperty(options.properties);
  if (!parentProperty || !titleProperty) {
    return;
  }

  const parentIdentifier = parentProperty.stringValueGet(options.rowId)?.trim();
  if (!parentIdentifier) {
    return;
  }

  const parentId = getParentIdFromIdentifier(parentIdentifier, options.docId);
  if (
    !parentId ||
    parentId === options.rowId ||
    (options.rowIds && !options.rowIds.includes(parentId))
  ) {
    return;
  }

  const parentTitle = getTitleValue(titleProperty, parentId);
  if (!parentTitle) {
    return;
  }

  const levelProperty = getPropertyByName(
    options.properties,
    TASK_HIERARCHY_LEVEL_COLUMN_NAME
  );

  return {
    parentId,
    parentIdentifier,
    parentTitle,
    parentDisplayName: parentTitle,
    level: normalizeLevel(levelProperty?.stringValueGet(options.rowId)),
  };
};
