import { LeafPaths, LeafVisitor } from '../../base';
import { DocRole, WorkspaceRole } from '../../models';

export { DocRole, WorkspaceRole };
/** Action names for Node callers; Rust owns permission decisions. */
export const Actions = {
  // Workspace Actions
  Workspace: {
    Read: '',
    Preview: '',
    Sync: '',
    CreateDoc: '',
    Delete: '',
    TransferOwner: '',
    Organize: {
      Read: '',
    },
    Users: {
      Read: '',
      Manage: '',
    },
    Administrators: {
      Manage: '',
    },
    Properties: {
      Read: '',
      Create: '',
      Update: '',
      Delete: '',
    },
    Settings: {
      Read: '',
      Update: '',
    },
    Blobs: {
      Upload: '',
      Manage: '',
    },
    Copilot: '',
    Payment: {
      Manage: '',
    },
  },

  // Doc Actions
  Doc: {
    Read: '',
    Preview: '',
    Copy: '',
    Duplicate: '',
    Trash: '',
    Restore: '',
    Delete: '',
    Update: '',
    Publish: '',
    Unpublish: '',
    History: {
      Read: '',
    },
    Analytics: {
      Read: '',
      Viewers: {
        Read: '',
      },
    },
    TransferOwner: '',
    Properties: {
      Read: '',
      Update: '',
    },
    Users: {
      Read: '',
      Manage: '',
    },
    Comments: {
      Read: '',
      Create: '',
      Moderate: '',
    },
  },
} as const;

type ResourceActionName<T extends keyof typeof Actions> =
  `${T}.${LeafPaths<(typeof Actions)[T]>}`;

export type WorkspaceAction = ResourceActionName<'Workspace'>;
export type DocAction = ResourceActionName<'Doc'>;
export type Action = WorkspaceAction | DocAction;
export type WorkspaceActionPermissions = Record<WorkspaceAction, boolean>;
export type DocActionPermissions = Record<DocAction, boolean>;

const cache = new WeakMap<object, any>();
const buildPathReader = (
  obj: any,
  isLeaf: (val: any) => boolean,
  prefix?: string
): any => {
  if (cache.has(obj)) {
    return cache.get(obj);
  }

  const reader = new Proxy(obj, {
    get(target, prop) {
      if (typeof prop === 'symbol') {
        return undefined;
      }

      const newPath = prefix ? `${prefix}.${prop}` : prop;

      if (isLeaf(target[prop])) {
        return newPath;
      }

      return buildPathReader(target[prop], isLeaf, newPath);
    },
  });

  cache.set(obj, reader);
  return reader;
};

// Create the proxy that returns the path string
export const Action: LeafVisitor<typeof Actions> = buildPathReader(
  Actions,
  val => typeof val === 'string'
);

export const WORKSPACE_ACTIONS = collectLeaves(
  Action.Workspace
) as WorkspaceAction[];
export const DOC_ACTIONS = collectLeaves(Action.Doc) as DocAction[];

function collectLeaves(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  return Object.values(value as Record<string, unknown>).flatMap(collectLeaves);
}
