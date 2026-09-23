import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const PROJECT_ROOT = path.resolve(__dirname, '../../../../../../');

const JS_BOUNDARY_FILES = [
  path.join(PROJECT_ROOT, 'packages/common/nbstore/src/impls/disk/doc.ts'),
  path.join(
    PROJECT_ROOT,
    'packages/frontend/apps/electron/src/helper/disk-sync/handlers.ts'
  ),
];

const FORBIDDEN_PATTERNS = [
  /frontmatter/i,
  /gray-matter/i,
  /MarkdownAdapter/,
  /markdownToSnapshot/,
  /fromMarkdown/,
  /toMarkdown/,
];

describe('disk boundary', () => {
  it('keeps markdown/frontmatter parsing out of JS adapter layer', () => {
    for (const file of JS_BOUNDARY_FILES) {
      const content = fs.readFileSync(file, 'utf-8');

      for (const pattern of FORBIDDEN_PATTERNS) {
        expect(content).not.toMatch(pattern);
      }
    }
  });

  it('keeps JS layer focused on session orchestration APIs', () => {
    const adapter = fs.readFileSync(JS_BOUNDARY_FILES[0], 'utf-8');
    expect(adapter).toMatch(/applyLocalUpdate/);

    const helper = fs.readFileSync(JS_BOUNDARY_FILES[1], 'utf-8');
    expect(helper).toMatch(/startSession/);
    expect(helper).toMatch(/stopSession/);
    expect(helper).toMatch(/applyLocalUpdate/);
  });
});
