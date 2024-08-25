import { registerEnumType } from '@nestjs/graphql';

export enum DocVariant {
  Workspace = 'workspace',
  Page = 'page',
  Space = 'space',
  Settings = 'settings',
  Unknown = 'unknown',
}

registerEnumType(DocVariant, {
  name: 'DocVariant',
});

export class DocID {
  raw: string;
  workspace: string;
  variant: DocVariant;
  private readonly sub: string | null;

  static parse(raw: string): DocID | null {
    try {
      return new DocID(raw);
    } catch {
      return null;
    }
  }

  /**
   * pure guid for workspace and subdoc without any prefix
   */
  get guid(): string {
    return this.variant === DocVariant.Workspace
      ? this.workspace
      : // sub is always truthy when variant is not workspace
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        this.sub!;
  }

  get full(): string {
    return this.variant === DocVariant.Workspace
      ? this.workspace
      : `${this.workspace}:${this.variant}:${this.sub}`;
  }

  get isWorkspace(): boolean {
    return this.variant === DocVariant.Workspace;
  }

  constructor(raw: string, workspaceId?: string) {
    if (!raw.length) {
      throw new Error('Invalid Empty Doc ID');
    }

    let parts = raw.split(':');

    if (parts.length > 3) {
      // special adapt case `wsId:space:page:pageId`
      if (parts[1] === DocVariant.Space && parts[2] === DocVariant.Page) {
        parts = [workspaceId ?? parts[0], DocVariant.Space, parts[3]];
      } else {
        throw new Error(`Invalid format of Doc ID: ${raw}`);
      }
    } else if (parts.length === 2) {
      // `${variant}:${guid}`
      if (!workspaceId) {
        throw new Error('Workspace is required');
      }

      parts.unshift(workspaceId);
    } else if (parts.length === 1) {
      // ${ws} or ${pageId}
      if (workspaceId && parts[0] !== workspaceId) {
        parts = [workspaceId, DocVariant.Unknown, parts[0]];
      } else {
        // parts:[ws] equals [workspaceId]
      }
    }

    let workspace = parts.at(0);

    // fix for `${non-workspaceId}:${variant}:${guid}`
    if (workspaceId) {
      workspace = workspaceId;
    }

    const variant = parts.at(1);
    const docId = parts.at(2);

    if (!workspace) {
      throw new Error('Workspace is required');
    }

    if (variant) {
      if (!Object.values(DocVariant).includes(variant as any)) {
        throw new Error(`Invalid ID variant: ${variant}`);
      }

      if (!docId) {
        throw new Error('ID is required for non-workspace doc');
      }
    } else if (docId) {
      throw new Error('Variant is required for non-workspace doc');
    }

    this.raw = raw;
    this.workspace = workspace;
    this.variant = (variant as DocVariant | undefined) ?? DocVariant.Workspace;
    this.sub = docId || null;
  }

  toString() {
    return this.full;
  }

  fixWorkspace(workspaceId: string) {
    if (!this.isWorkspace && this.workspace !== workspaceId) {
      this.workspace = workspaceId;
    }
  }
}
