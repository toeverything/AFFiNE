import { describe, expect, test } from 'vitest';

import {
  createMirrorFrontmatter,
  encodeMirrorId,
  getMirrorDocPath,
  stableJson,
} from '../format';

describe('local mirror format', () => {
  test('stableJson sorts object keys recursively', () => {
    expect(stableJson({ z: 1, nested: { z: 2, a: 1 }, a: 2 })).toBe(
      '{\n  "a": 2,\n  "nested": {\n    "a": 1,\n    "z": 2\n  },\n  "z": 1\n}\n'
    );
  });

  test('encodes document ids as one safe path segment', () => {
    expect(encodeMirrorId('../doc:name*')).toBe('..%2Fdoc%3Aname%2A');
    expect(getMirrorDocPath('../doc:name*')).toBe('docs/..%2Fdoc%3Aname%2A.md');
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
