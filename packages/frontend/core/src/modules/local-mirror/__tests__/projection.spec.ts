import { describe, expect, test } from 'vitest';

import { createLocalMirrorProjection } from '../projection';

describe('local mirror workspace projection', () => {
  test('renders linked, unfiled, duplicate-linked, and trashed docs', () => {
    const result = createLocalMirrorProjection({
      workspace: { id: 'space', name: 'Project', flavour: 'affine-cloud' },
      generatedAt: '2025-01-01T00:00:00.000Z',
      docs: [
        { id: 'a', title: 'Alpha', tags: [], primaryMode: 'page' },
        { id: 'b', title: 'Beta', tags: [], primaryMode: 'edgeless' },
        {
          id: 'trash',
          title: 'Old',
          tags: [],
          primaryMode: 'page',
          trash: true,
        },
      ],
      folders: [
        { id: 'folder', type: 'folder', data: 'Work', index: 'a' },
        {
          id: 'link-a',
          parentId: 'folder',
          type: 'doc',
          data: 'a',
          index: 'a',
        },
        {
          id: 'link-a-again',
          parentId: 'folder',
          type: 'doc',
          data: 'a',
          index: 'b',
        },
      ],
      tags: [],
    });

    expect(result.indexMarkdown.match(/docs\/a\.md/g)).toHaveLength(2);
    expect(result.indexMarkdown).toContain('## Unfiled\n\n- [Beta](docs/b.md)');
    expect(result.indexMarkdown).toContain(
      '## Trash\n\n- [Old](docs/trash.md)'
    );
    expect(result.workspaceJson).toContain(
      '"snapshotPath": "snapshots/a.snapshot.json"'
    );
  });

  test('does not recurse forever through malformed folder cycles', () => {
    const result = createLocalMirrorProjection({
      workspace: { id: 'space', name: 'Project', flavour: 'local' },
      generatedAt: '2025-01-01T00:00:00.000Z',
      docs: [],
      folders: [
        {
          id: 'a',
          parentId: 'b',
          type: 'folder',
          data: 'A',
          index: 'a',
        },
        {
          id: 'b',
          parentId: 'a',
          type: 'folder',
          data: 'B',
          index: 'b',
        },
      ],
      tags: [],
    });
    expect(result.indexMarkdown).toContain('Folder cycle omitted');
  });
});
