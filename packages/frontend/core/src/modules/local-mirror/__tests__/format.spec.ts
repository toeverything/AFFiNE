import { describe, expect, test } from 'vitest';

import {
  createMirrorDocFilename,
  createMirrorDocPathMap,
  createMirrorFrontmatter,
  encodeMirrorId,
  getMirrorDocPath,
  getMirrorSnapshotPath,
  stableJson,
} from '../format';

describe('local mirror format', () => {
  test('stableJson sorts object keys recursively', () => {
    expect(stableJson({ z: 1, nested: { z: 2, a: 1 }, a: 2 })).toBe(
      '{\n  "a": 2,\n  "nested": {\n    "a": 1,\n    "z": 2\n  },\n  "z": 1\n}\n'
    );
  });

  test('creates safe human-readable document paths', () => {
    expect(encodeMirrorId('../doc:name*')).toBe('..%2Fdoc%3Aname%2A');
    expect(getMirrorDocPath('How to use folder and Tags')).toBe(
      'docs/How-to-use-folder-and-Tags.md'
    );
    expect(createMirrorDocFilename('../CON')).toBe('_CON.md');
    expect(getMirrorSnapshotPath('../doc:name*')).toBe(
      '.metadata/snapshots/..%2Fdoc%3Aname%2A.snapshot.json'
    );
  });

  test('adds stable suffixes only when human-readable names collide', () => {
    const paths = createMirrorDocPathMap([
      { id: 'doc-b', title: 'Project Plan' },
      { id: 'doc-a', title: 'Project/Plan' },
      { id: 'notes', title: 'Notes' },
    ]);

    expect(paths.get('notes')).toBe('docs/Notes.md');
    expect(paths.get('doc-a')).toMatch(/^docs\/Project-Plan--[a-f\d]{8}\.md$/);
    expect(paths.get('doc-b')).toMatch(/^docs\/Project-Plan--[a-f\d]{8}\.md$/);
    expect(paths.get('doc-a')).not.toBe(paths.get('doc-b'));
  });

  test('disambiguates the rare case where stable suffix hashes collide', () => {
    const paths = createMirrorDocPathMap([
      { id: 'doc-1h3vssc-xz0', title: 'Project Plan' },
      { id: 'doc-cz599j-128p', title: 'Project/Plan' },
    ]);

    expect(paths.get('doc-1h3vssc-xz0')).toBe('docs/Project-Plan--47062430.md');
    expect(paths.get('doc-cz599j-128p')).toBe(
      'docs/Project-Plan--47062430-2.md'
    );
  });

  test('uses portable case folding for Unicode filename collisions', () => {
    const paths = createMirrorDocPathMap([
      { id: 'sigma', title: 'Project σ' },
      { id: 'final-sigma', title: 'Project ς' },
    ]);

    expect(paths.get('sigma')).toMatch(/^docs\/Project-σ--[a-f\d]{8}\.md$/);
    expect(paths.get('final-sigma')).toMatch(
      /^docs\/Project-ς--[a-f\d]{8}\.md$/
    );
  });

  test('keeps multibyte filenames within common component limits', () => {
    const filename = createMirrorDocFilename('頁'.repeat(200));

    expect(new TextEncoder().encode(filename).byteLength).toBeLessThanOrEqual(
      255
    );
    expect(filename.length).toBeLessThanOrEqual(255);
  });

  test('frontmatter preserves stable identity and mirror metadata', () => {
    const frontmatter = createMirrorFrontmatter(
      'workspace',
      {
        id: 'doc',
        title: 'A: title',
        createDate: Date.UTC(2025, 0, 1),
        tags: ['tag'],
        primaryMode: 'page',
      },
      'source-hash'
    );
    expect(frontmatter).toContain('workspaceId: "workspace"');
    expect(frontmatter).toContain('title: "A: title"');
    expect(frontmatter).toContain('tags: ["tag"]');
    expect(frontmatter).toContain('sourceHash: "source-hash"');
  });
});
