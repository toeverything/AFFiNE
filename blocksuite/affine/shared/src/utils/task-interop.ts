export type TaskIdentityInput = {
  docId: string;
  blockId: string;
  spaceId?: string;
};

export type TaskInteropLink = {
  taskIdentity: string;
  docId: string;
  blockId: string;
  sourceFlavor: string;
  title?: string;
  cost?: number;
  databaseId?: string;
  databaseRowId?: string;
};

export type TaskInteropChangedField = 'title' | 'checked' | 'cost';

export type TaskInteropUpdatedDetail = {
  link: TaskInteropLink;
  changed: TaskInteropChangedField[];
};

export const TASK_INTEROP_UPDATED_EVENT = 'affine:task-interop-updated';

export const TASK_HIERARCHY_LEVEL_COLUMN_NAME = 'Hierarchy Level';
export const TASK_PARENT_IDENTIFIER_COLUMN_NAME = 'Parent Identifier';
export const TASK_ANCESTOR_IDENTIFIERS_COLUMN_NAME = 'Ancestor Identifiers';

const TASK_ID_SEPARATOR = ':';
const TASK_ANCESTOR_TOKEN_DELIMITER = '|';

const encodePart = (value: string) => encodeURIComponent(value);
const decodePart = (value: string) => decodeURIComponent(value);

export function createTaskIdentity({
  docId,
  blockId,
  spaceId,
}: TaskIdentityInput) {
  const parts = [spaceId, docId, blockId]
    .filter((part): part is string => Boolean(part))
    .map(encodePart);
  return parts.join(TASK_ID_SEPARATOR);
}

export function parseTaskIdentity(taskIdentity: string) {
  const parts = taskIdentity.split(TASK_ID_SEPARATOR);
  if (parts.length === 2) {
    return {
      spaceId: undefined,
      docId: decodePart(parts[0] ?? ''),
      blockId: decodePart(parts[1] ?? ''),
    };
  }

  if (parts.length === 3) {
    return {
      spaceId: decodePart(parts[0] ?? ''),
      docId: decodePart(parts[1] ?? ''),
      blockId: decodePart(parts[2] ?? ''),
    };
  }

  return null;
}

export function encodeTaskAncestorIdentities(taskIdentities: string[]) {
  if (taskIdentities.length === 0) {
    return '';
  }
  return `${TASK_ANCESTOR_TOKEN_DELIMITER}${taskIdentities.join(TASK_ANCESTOR_TOKEN_DELIMITER)}${TASK_ANCESTOR_TOKEN_DELIMITER}`;
}

export function encodeTaskAncestorIdentityToken(taskIdentity: string) {
  return `${TASK_ANCESTOR_TOKEN_DELIMITER}${taskIdentity}${TASK_ANCESTOR_TOKEN_DELIMITER}`;
}

export function createTodoTaskInteropLink(
  input: TaskIdentityInput & {
    sourceFlavor?: string;
    title?: string;
    cost?: number;
    databaseId?: string;
    databaseRowId?: string;
  }
): TaskInteropLink {
  return {
    taskIdentity: createTaskIdentity(input),
    docId: input.docId,
    blockId: input.blockId,
    sourceFlavor: input.sourceFlavor ?? 'affine:list',
    title: input.title,
    cost: input.cost,
    databaseId: input.databaseId,
    databaseRowId: input.databaseRowId,
  };
}

export function createDatabaseRowTaskInteropLink(
  input: TaskIdentityInput & {
    databaseId: string;
    sourceFlavor?: string;
  }
): TaskInteropLink {
  return {
    taskIdentity: createTaskIdentity(input),
    docId: input.docId,
    blockId: input.blockId,
    sourceFlavor: input.sourceFlavor ?? 'affine:paragraph',
    databaseId: input.databaseId,
    databaseRowId: input.blockId,
  };
}

export function hasSameTaskIdentity(
  left: Pick<TaskInteropLink, 'taskIdentity'>,
  right: Pick<TaskInteropLink, 'taskIdentity'>
) {
  return left.taskIdentity === right.taskIdentity;
}

export function findDuplicateTaskIdentities(links: TaskInteropLink[]) {
  const counts = new Map<string, number>();
  for (const link of links) {
    counts.set(link.taskIdentity, (counts.get(link.taskIdentity) ?? 0) + 1);
  }
  return [...counts.entries()]
    .filter(([, count]) => count > 1)
    .map(([taskIdentity]) => taskIdentity);
}

export function computeTodoParentCheckedFromChildren(
  childrenChecked: boolean[]
): boolean | null {
  if (childrenChecked.length === 0) {
    return null;
  }
  return childrenChecked.every(Boolean);
}

export function computeTodoParentCheckedFromChildModels(
  children: Array<{ id: string; checked: boolean }>,
  updatedChild?: { id: string; checked: boolean }
): boolean | null {
  return computeTodoParentCheckedFromChildren(
    children.map(child =>
      updatedChild && child.id === updatedChild.id
        ? updatedChild.checked
        : child.checked
    )
  );
}

export function createTodoCheckedTransitionTracker() {
  let initialized = false;
  let lastChecked = false;

  return {
    shouldRecompute(type: string, checked: boolean) {
      if (type !== 'todo') {
        initialized = false;
        return false;
      }

      if (!initialized) {
        lastChecked = checked;
        initialized = true;
        return false;
      }

      if (checked === lastChecked) {
        return false;
      }

      lastChecked = checked;
      return true;
    },
  };
}
