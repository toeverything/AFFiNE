import { describe, expect, test } from 'vitest';

import { generateRenderDiff } from '../../../../blocksuite/ai/utils/apply-model/generate-render-diff';

describe('generateRenderDiff', () => {
  test('should handle block insertion', () => {
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
    const diff = generateRenderDiff(oldMd, newMd);
    expect(diff).toEqual({
      deletes: [],
      inserts: {
        'block-001': [
          {
            id: 'block-002',
            type: 'paragraph',
            content: 'This is a new paragraph.',
          },
        ],
      },
      updates: {},
    });
  });

  test('should handle block deletion', () => {
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
    const diff = generateRenderDiff(oldMd, newMd);
    expect(diff).toEqual({
      deletes: ['block-002'],
      inserts: {},
      updates: {},
    });
  });

  test('should handle block replacement', () => {
    const oldMd = `
<!-- block_id=block-001 flavour=title -->
# Old Title
`;
    const newMd = `
<!-- block_id=block-001 flavour=title -->
# New Title
`;
    const diff = generateRenderDiff(oldMd, newMd);
    expect(diff).toEqual({
      deletes: [],
      inserts: {},
      updates: {
        'block-001': '# New Title',
      },
    });
  });

  test('should handle mixed changes', () => {
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
    const diff = generateRenderDiff(oldMd, newMd);
    expect(diff).toEqual({
      deletes: ['block-003'],
      inserts: {
        'block-002': [
          {
            id: 'block-004',
            type: 'paragraph',
            content: 'New paragraph.',
          },
        ],
      },
      updates: {
        'block-002': 'Updated paragraph.',
      },
    });
  });

  test('should handle consecutive block insertions', () => {
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
    const diff = generateRenderDiff(oldMd, newMd);
    expect(diff).toEqual({
      deletes: [],
      inserts: {
        'block-001': [
          {
            id: 'block-002',
            type: 'paragraph',
            content: 'First inserted paragraph.',
          },
          {
            id: 'block-003',
            type: 'paragraph',
            content: 'Second inserted paragraph.',
          },
        ],
      },
      updates: {},
    });
  });

  test('should handle consecutive block deletions', () => {
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
    const diff = generateRenderDiff(oldMd, newMd);
    expect(diff).toEqual({
      deletes: ['block-002', 'block-003'],
      inserts: {},
      updates: {},
    });
  });

  test('should handle block insertion at the head', () => {
    const oldMd = `
<!-- block_id=block-001 flavour=title -->
# Title
`;
    const newMd = `
<!-- block_id=block-000 flavour=paragraph -->
Head paragraph.

<!-- block_id=block-001 flavour=title -->
# Title
`;
    const diff = generateRenderDiff(oldMd, newMd);
    expect(diff).toEqual({
      deletes: [],
      inserts: {
        HEAD: [
          {
            id: 'block-000',
            type: 'paragraph',
            content: 'Head paragraph.',
          },
        ],
      },
      updates: {},
    });
  });

  test('should handle block insertion at the tail', () => {
    const oldMd = `
<!-- block_id=block-001 flavour=title -->
# Title
`;
    const newMd = `
<!-- block_id=block-001 flavour=title -->
# Title

<!-- block_id=block-002 flavour=paragraph -->
Tail paragraph.
`;
    const diff = generateRenderDiff(oldMd, newMd);
    expect(diff).toEqual({
      deletes: [],
      inserts: {
        'block-001': [
          {
            id: 'block-002',
            type: 'paragraph',
            content: 'Tail paragraph.',
          },
        ],
      },
      updates: {},
    });
  });

  test('should handle delete then insert after', () => {
    const oldMd = `
<!-- block_id=block-001 flavour=title -->
# Title

<!-- block_id=block-002 flavour=paragraph -->
To be deleted.
`;
    const newMd = `
<!-- block_id=block-001 flavour=title -->
# Title

<!-- block_id=block-003 flavour=paragraph -->
Inserted after delete.
`;
    const diff = generateRenderDiff(oldMd, newMd);
    expect(diff).toEqual({
      deletes: ['block-002'],
      inserts: {
        'block-001': [
          {
            id: 'block-003',
            type: 'paragraph',
            content: 'Inserted after delete.',
          },
        ],
      },
      updates: {},
    });
  });

  test('should handle consecutive insertions', () => {
    const oldMd = `
<!-- block_id=block-001 flavour=title -->
# Title
`;
    const newMd = `
<!-- block_id=block-001 flavour=title -->
# Title

<!-- block_id=block-002 flavour=paragraph -->
First insert.

<!-- block_id=block-003 flavour=paragraph -->
Second insert.
`;
    const diff = generateRenderDiff(oldMd, newMd);
    expect(diff).toEqual({
      deletes: [],
      inserts: {
        'block-001': [
          {
            id: 'block-002',
            type: 'paragraph',
            content: 'First insert.',
          },
          {
            id: 'block-003',
            type: 'paragraph',
            content: 'Second insert.',
          },
        ],
      },
      updates: {},
    });
  });

  test('should handle interval insertions', () => {
    const oldMd = `
<!-- block_id=block-001 flavour=title -->
# Title

<!-- block_id=block-002 flavour=paragraph -->
Paragraph.
`;
    const newMd = `
<!-- block_id=block-001 flavour=title -->
# Title

<!-- block_id=block-003 flavour=paragraph -->
Inserted between.

<!-- block_id=block-002 flavour=paragraph -->
Paragraph.

<!-- block_id=block-004 flavour=paragraph -->
Inserted at tail.
`;
    const diff = generateRenderDiff(oldMd, newMd);
    expect(diff).toEqual({
      deletes: [],
      inserts: {
        'block-001': [
          {
            id: 'block-003',
            type: 'paragraph',
            content: 'Inserted between.',
          },
        ],
        'block-002': [
          {
            id: 'block-004',
            type: 'paragraph',
            content: 'Inserted at tail.',
          },
        ],
      },
      updates: {},
    });
  });

  test('should handle interval insertions & deletions', () => {
    const oldMd = `
<!-- block_id=block-001 flavour=title -->
# 1

<!-- block_id=block-002 flavour=paragraph -->
2

<!-- block_id=block-003 flavour=paragraph -->
3

<!-- block_id=block-004 flavour=paragraph -->
4

<!-- block_id=block-005 flavour=paragraph -->
5
`;
    const newMd = `
<!-- block_id=block-001 flavour=title -->
# 1

<!-- block_id=block-002 flavour=paragraph -->
2

<!-- block_id=block-004 flavour=paragraph -->
4

<!-- block_id=block-006 flavour=paragraph -->
6

<!-- block_id=block-007 flavour=paragraph -->
7
`;
    const diff = generateRenderDiff(oldMd, newMd);
    expect(diff).toEqual({
      deletes: ['block-003', 'block-005'],
      inserts: {
        'block-004': [
          {
            id: 'block-006',
            type: 'paragraph',
            content: '6',
          },
          {
            id: 'block-007',
            type: 'paragraph',
            content: '7',
          },
        ],
      },
      updates: {},
    });
  });
});
