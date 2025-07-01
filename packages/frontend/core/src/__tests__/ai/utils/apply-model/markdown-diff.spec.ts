import { describe, expect, test } from 'vitest';

import { diffMarkdown } from '../../../../blocksuite/ai/utils/apply-model/markdown-diff';

describe('diffMarkdown', () => {
  test('should diff block insertion', () => {
    // Only a new block is inserted
    const oldMd = `
<!-- block_id=block-001 flavour=title -->
# Title
`;
    const newMd = `
<!-- block_id=block-001 flavour=title -->
# Title

<!-- block_id=block-002 flavour=paragraph -->
This is a new paragraph.
`;
    const { patches } = diffMarkdown(oldMd, newMd);
    expect(patches).toEqual([
      {
        op: 'insert',
        index: 1,
        block: {
          id: 'block-002',
          type: 'paragraph',
          content: 'This is a new paragraph.',
        },
      },
    ]);
  });

  test('should diff block deletion', () => {
    // A block is deleted
    const oldMd = `
<!-- block_id=block-001 flavour=title -->
# Title

<!-- block_id=block-002 flavour=paragraph -->
This paragraph will be deleted.
`;
    const newMd = `
<!-- block_id=block-001 flavour=title -->
# Title
`;
    const { patches } = diffMarkdown(oldMd, newMd);
    expect(patches).toEqual([
      {
        op: 'delete',
        id: 'block-002',
      },
    ]);
  });

  test('should diff block replacement', () => {
    // Only content of a block is changed
    const oldMd = `
<!-- block_id=block-001 flavour=title -->
# Old Title
`;
    const newMd = `
<!-- block_id=block-001 flavour=title -->
# New Title
`;
    const { patches } = diffMarkdown(oldMd, newMd);
    expect(patches).toEqual([
      {
        op: 'replace',
        id: 'block-001',
        content: '# New Title',
      },
    ]);
  });

  test('should diff mixed changes', () => {
    // Mixed: delete, insert, replace
    const oldMd = `
<!-- block_id=block-001 flavour=title -->
# Title

<!-- block_id=block-002 flavour=paragraph -->
Old paragraph.

<!-- block_id=block-003 flavour=paragraph -->
To be deleted.
`;
    const newMd = `
<!-- block_id=block-001 flavour=title -->
# Title

<!-- block_id=block-002 flavour=paragraph -->
Updated paragraph.

<!-- block_id=block-004 flavour=paragraph -->
New paragraph.
`;
    const { patches } = diffMarkdown(oldMd, newMd);
    expect(patches).toEqual([
      {
        op: 'replace',
        id: 'block-002',
        content: 'Updated paragraph.',
      },
      {
        op: 'insert',
        index: 2,
        block: {
          id: 'block-004',
          type: 'paragraph',
          content: 'New paragraph.',
        },
      },
      {
        op: 'delete',
        id: 'block-003',
      },
    ]);
  });

  test('should diff consecutive block insertions', () => {
    // Two new blocks are inserted consecutively
    const oldMd = `
<!-- block_id=block-001 flavour=title -->
# Title
`;
    const newMd = `
<!-- block_id=block-001 flavour=title -->
# Title

<!-- block_id=block-002 flavour=paragraph -->
First inserted paragraph.

<!-- block_id=block-003 flavour=paragraph -->
Second inserted paragraph.
`;
    const { patches } = diffMarkdown(oldMd, newMd);
    expect(patches).toEqual([
      {
        op: 'insert',
        index: 1,
        block: {
          id: 'block-002',
          type: 'paragraph',
          content: 'First inserted paragraph.',
        },
      },
      {
        op: 'insert',
        index: 2,
        block: {
          id: 'block-003',
          type: 'paragraph',
          content: 'Second inserted paragraph.',
        },
      },
    ]);
  });

  test('should diff consecutive block deletions', () => {
    // Two blocks are deleted consecutively
    const oldMd = `
<!-- block_id=block-001 flavour=title -->
# Title

<!-- block_id=block-002 flavour=paragraph -->
First paragraph to be deleted.

<!-- block_id=block-003 flavour=paragraph -->
Second paragraph to be deleted.
`;
    const newMd = `
<!-- block_id=block-001 flavour=title -->
# Title
`;
    const { patches } = diffMarkdown(oldMd, newMd);
    expect(patches).toEqual([
      {
        op: 'delete',
        id: 'block-002',
      },
      {
        op: 'delete',
        id: 'block-003',
      },
    ]);
  });

  test('should diff deletion followed by insertion at the same position', () => {
    // A block is deleted and a new block is inserted at the end
    const oldMd = `
<!-- block_id=block-001 flavour=title -->
# Title

<!-- block_id=block-002 flavour=paragraph -->
This paragraph will be deleted

<!-- block_id=block-003 flavour=paragraph -->
HelloWorld
`;

    const newMd = `
<!-- block_id=block-001 flavour=title -->
# Title

<!-- block_id=block-003 flavour=paragraph -->
HelloWorld

<!-- block_id=block-004 flavour=paragraph -->
This is a new paragraph inserted after deletion.
`;
    const { patches } = diffMarkdown(oldMd, newMd);
    expect(patches).toEqual([
      {
        op: 'insert',
        index: 2,
        block: {
          id: 'block-004',
          type: 'paragraph',
          content: 'This is a new paragraph inserted after deletion.',
        },
      },
      {
        op: 'delete',
        id: 'block-002',
      },
    ]);
  });
});
