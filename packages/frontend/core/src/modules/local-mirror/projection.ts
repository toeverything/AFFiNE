import {
  createMirrorDocPathMap,
  getMirrorSnapshotPath,
  stableJson,
} from './format';
import {
  LOCAL_MIRROR_FORMAT_VERSION,
  type LocalMirrorDocMetadata,
  type LocalMirrorFolderRecord,
  type LocalMirrorWorkspaceProjection,
  LocalMirrorWorkspaceProjectionSchema,
} from './types';

type CreateLocalMirrorProjectionOptions = {
  workspace: LocalMirrorWorkspaceProjection['workspace'];
  generatedAt: string;
  docs: LocalMirrorDocMetadata[];
  docPaths?: ReadonlyMap<string, string>;
  folders: LocalMirrorFolderRecord[];
  tags: LocalMirrorWorkspaceProjection['tags'];
};

function compareFolderRecords(
  left: LocalMirrorFolderRecord,
  right: LocalMirrorFolderRecord
) {
  return (
    left.index.localeCompare(right.index) || left.id.localeCompare(right.id)
  );
}

function markdownText(value: string, fallback: string) {
  const normalized = value.replace(/\s+/g, ' ').trim() || fallback;
  return normalized.replace(/([\\[\]*_])/g, '\\$1');
}

function documentLink(
  doc: LocalMirrorDocMetadata,
  docPaths: ReadonlyMap<string, string>
) {
  return `[${markdownText(doc.title, 'Untitled')}](${documentPath(
    doc.id,
    docPaths
  )})`;
}

function documentPath(docId: string, docPaths: ReadonlyMap<string, string>) {
  const path = docPaths.get(docId);
  if (!path) throw new Error(`Missing local mirror path for ${docId}`);
  return path;
}

export function createLocalMirrorProjection({
  workspace,
  generatedAt,
  docs,
  docPaths: suppliedDocPaths,
  folders,
  tags,
}: CreateLocalMirrorProjectionOptions) {
  const sortedDocs = [...docs].sort(
    (left, right) =>
      left.title.localeCompare(right.title) || left.id.localeCompare(right.id)
  );
  const docPaths = suppliedDocPaths ?? createMirrorDocPathMap(sortedDocs);
  const sortedFolders = [...folders].sort(compareFolderRecords);
  const projection: LocalMirrorWorkspaceProjection = {
    formatVersion: LOCAL_MIRROR_FORMAT_VERSION,
    workspace,
    generatedAt,
    docs: sortedDocs.map(doc => ({
      ...doc,
      path: documentPath(doc.id, docPaths),
      snapshotPath: getMirrorSnapshotPath(doc.id),
    })),
    folders: sortedFolders,
    tags: [...tags].sort(
      (left, right) =>
        left.value.localeCompare(right.value) || left.id.localeCompare(right.id)
    ),
  };

  const docsById = new Map(sortedDocs.map(doc => [doc.id, doc]));
  const childrenByParent = new Map<string | null, LocalMirrorFolderRecord[]>();
  for (const record of sortedFolders) {
    const parentId = record.parentId ?? null;
    const children = childrenByParent.get(parentId) ?? [];
    children.push(record);
    childrenByParent.set(parentId, children);
  }
  const renderedDocIds = new Set<string>();
  const emittedFolders = new Set<string>();

  const renderChildren = (
    parentId: string | null,
    depth: number,
    ancestry: ReadonlySet<string>
  ): string[] => {
    const lines: string[] = [];
    for (const record of childrenByParent.get(parentId) ?? []) {
      const indentation = '  '.repeat(depth);
      if (record.type === 'folder') {
        lines.push(
          `${indentation}- **${markdownText(record.data, 'Untitled folder')}**`
        );
        if (ancestry.has(record.id)) {
          lines.push(`${indentation}  - _Folder cycle omitted_`);
          continue;
        }
        emittedFolders.add(record.id);
        lines.push(
          ...renderChildren(
            record.id,
            depth + 1,
            new Set([...ancestry, record.id])
          )
        );
      } else if (record.type === 'doc') {
        const doc = docsById.get(record.data);
        if (doc && !doc.trash) {
          lines.push(`${indentation}- ${documentLink(doc, docPaths)}`);
          renderedDocIds.add(doc.id);
        }
      }
    }
    return lines;
  };

  const navigation = renderChildren(null, 0, new Set());
  const orphanedFolders = sortedFolders.filter(
    record => record.type === 'folder' && !emittedFolders.has(record.id)
  );
  if (orphanedFolders.length > 0) {
    navigation.push('- **Unlinked folders**');
    for (const folder of orphanedFolders) {
      if (emittedFolders.has(folder.id)) continue;
      navigation.push(
        `  - **${markdownText(folder.data, 'Untitled folder')}**`
      );
      emittedFolders.add(folder.id);
      navigation.push(...renderChildren(folder.id, 2, new Set([folder.id])));
    }
  }

  const unfiled = sortedDocs.filter(
    doc => !doc.trash && !renderedDocIds.has(doc.id)
  );
  const trash = sortedDocs.filter(doc => doc.trash);
  const indexLines = [
    `# ${markdownText(workspace.name, 'Untitled workspace')}`,
    '',
    `Generated from AFFiNE at ${generatedAt}. Cloud/local workspace data remains canonical.`,
    '',
    '## Workspace',
    '',
    ...(navigation.length > 0 ? navigation : ['_No filed documents._']),
    '',
    '## Unfiled',
    '',
    ...(unfiled.length > 0
      ? unfiled.map(doc => `- ${documentLink(doc, docPaths)}`)
      : ['_No unfiled documents._']),
    '',
    '## Trash',
    '',
    ...(trash.length > 0
      ? trash.map(doc => `- ${documentLink(doc, docPaths)}`)
      : ['_Trash is empty._']),
    '',
  ];

  LocalMirrorWorkspaceProjectionSchema.parse(projection);
  return {
    workspaceJson: stableJson(projection),
    indexMarkdown: indexLines.join('\n'),
  };
}
