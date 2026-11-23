export type MobileNavigationKind =
  | 'section'
  | 'doc'
  | 'collection'
  | 'folder'
  | 'tag'
  | 'action'
  | 'placeholder';

export type MobileNavigationNode = {
  kind: Exclude<MobileNavigationKind, 'section' | 'placeholder'>;
  entityId: string;
  relationId?: string;
  children?: readonly MobileNavigationNode[];
  expandable?: boolean;
  linked?: boolean;
  permission?: 'allowed' | 'loading' | 'denied';
  action?:
    | 'section'
    | 'folder-new-doc'
    | 'doc-new-linked'
    | 'collection-new-doc'
    | 'tag-new-doc';
};

export type MobileNavigationSection = {
  id: string;
  children: readonly MobileNavigationNode[];
};

export type MobileNavigationRow = {
  id: string;
  kind: MobileNavigationKind;
  depth: number;
  entityId?: string;
  expanded?: boolean;
  expandable?: boolean;
  linked?: boolean;
  relationId?: string;
  blocked?: 'loading' | 'denied';
  action?: MobileNavigationNode['action'];
};

const pathId = (parts: readonly string[]) =>
  parts.map(part => encodeURIComponent(part)).join('/');

export class MobileNavigationProjection {
  flatten(
    sections: readonly MobileNavigationSection[],
    expanded: ReadonlySet<string>
  ): MobileNavigationRow[] {
    const rows: MobileNavigationRow[] = [];
    for (const section of sections) {
      const sectionPath = [section.id];
      const sectionId = pathId(sectionPath);
      const sectionExpanded = expanded.has(sectionId);
      rows.push({
        id: sectionId,
        kind: 'section',
        depth: 0,
        entityId: section.id,
        expanded: sectionExpanded,
        expandable: true,
      });
      if (sectionExpanded) {
        this.append(
          rows,
          section.children,
          sectionPath,
          1,
          expanded,
          new Set()
        );
      }
    }
    return rows;
  }

  private append(
    rows: MobileNavigationRow[],
    nodes: readonly MobileNavigationNode[],
    parentPath: readonly string[],
    depth: number,
    expanded: ReadonlySet<string>,
    ancestors: ReadonlySet<string>
  ) {
    const occurrences = new Map<string, number>();
    for (const node of nodes) {
      const segment = `${node.kind}:${node.entityId}`;
      const occurrence = occurrences.get(segment) ?? 0;
      occurrences.set(segment, occurrence + 1);
      const path = [
        ...parentPath,
        occurrence === 0 ? segment : `${segment}#${occurrence}`,
      ];
      const id = pathId(path);
      if (node.permission && node.permission !== 'allowed') {
        rows.push({
          id: `${id}/permission`,
          kind: 'placeholder',
          depth,
          entityId: node.entityId,
          blocked: node.permission,
        });
        continue;
      }
      if (ancestors.has(segment)) {
        rows.push({
          id: `${id}/cycle`,
          kind: 'placeholder',
          depth,
          entityId: node.entityId,
        });
        continue;
      }
      const expandable = node.expandable ?? !!node.children?.length;
      const isExpanded = expandable && expanded.has(id);
      rows.push({
        id,
        kind: node.kind,
        depth,
        entityId: node.entityId,
        expanded: expandable ? isExpanded : undefined,
        expandable,
        linked: node.linked,
        relationId: node.relationId,
        action: node.action,
      });
      if (isExpanded && node.children?.length) {
        const nextAncestors = new Set(ancestors);
        nextAncestors.add(segment);
        this.append(
          rows,
          node.children,
          path,
          depth + 1,
          expanded,
          nextAncestors
        );
      }
    }
  }
}
