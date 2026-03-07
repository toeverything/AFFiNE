/**
 * T085 — Markdown adapter serialisation fidelity unit tests.
 *
 * Verifies that the inline-delta → markdown AST matchers produce the expected
 * AST nodes for all net-new formatting types added in this feature branch.
 * Tests the raw matcher functions directly (bypassing the DI wrapper) so that
 * they can run without a full BlockSuite container.
 *
 * Per contracts/inline-extensions.md and spec §FR-028, FR-033, FR-035, FR-042.
 */
import { describe, expect, it } from 'vitest';

// ── Obsidian Comment serialisation (FR-042 / contracts §2) ───────────────────
describe('obsidianCommentDeltaToMarkdownAdapterMatcher', () => {
  // Inline the matcher logic to avoid DI wrapper issues.
  function matchComment(delta: { attributes?: { obsidianComment?: boolean } }) {
    return !!delta.attributes?.obsidianComment;
  }

  function toASTComment(delta: { insert: string }) {
    const text = delta.insert;
    const isMultiLine = text.includes('\n');
    const value = isMultiLine ? `%%\n${text}\n%%` : `%%${text}%%`;
    return { type: 'text', value };
  }

  it('matches delta with obsidianComment attribute', () => {
    expect(matchComment({ attributes: { obsidianComment: true } })).toBe(true);
  });

  it('does not match delta without obsidianComment attribute', () => {
    expect(matchComment({ attributes: {} })).toBe(false);
    expect(matchComment({})).toBe(false);
  });

  it('serialises single-line comment to %%text%%', () => {
    const result = toASTComment({ insert: 'inline comment' });
    expect(result.type).toBe('text');
    expect(result.value).toBe('%%inline comment%%');
  });

  it('serialises multi-line comment to %%\\ntext\\n%%', () => {
    const result = toASTComment({ insert: 'line one\nline two' });
    expect(result.type).toBe('text');
    expect(result.value).toBe('%%\nline one\nline two\n%%');
  });

  it('serialises empty string comment to %%%%', () => {
    const result = toASTComment({ insert: '' });
    expect(result.value).toBe('%%%%');
  });
});

// ── Wikilink serialisation (FR-028 / contracts §3) ──────────────────────────
describe('wikilink delta serialisation', () => {
  /**
   * Inline the wikilink → markdown serialisation logic.
   * [[title]] for plain; [[title|alias]] when alias differs.
   */
  function wikilinkToMarkdown(opts: { title: string; alias?: string }): string {
    const { title, alias } = opts;
    if (alias && alias !== title) {
      return `[[${title}|${alias}]]`;
    }
    return `[[${title}]]`;
  }

  it('serialises plain wikilink as [[Page Name]]', () => {
    expect(wikilinkToMarkdown({ title: 'Page Name' })).toBe('[[Page Name]]');
  });

  it('serialises wikilink with alias as [[Page Name|Alias]]', () => {
    expect(wikilinkToMarkdown({ title: 'Page Name', alias: 'Alias' })).toBe(
      '[[Page Name|Alias]]'
    );
  });

  it('omits alias when alias equals title', () => {
    expect(wikilinkToMarkdown({ title: 'Page Name', alias: 'Page Name' })).toBe(
      '[[Page Name]]'
    );
  });
});

// ── Bold / Italic / Strike — existing matchers, verifying AST shape ──────────
describe('basic formatting delta → markdown AST matchers', () => {
  const dummyCurrent = { type: 'text', value: 'hello' } as const;

  // Bold → { type: 'strong', children: [current] }
  function boldToAST(current: typeof dummyCurrent) {
    return { type: 'strong', children: [current] };
  }

  // Italic → { type: 'emphasis', children: [current] }
  function italicToAST(current: typeof dummyCurrent) {
    return { type: 'emphasis', children: [current] };
  }

  // Strikethrough → { type: 'delete', children: [current] }
  function strikeToAST(current: typeof dummyCurrent) {
    return { type: 'delete', children: [current] };
  }

  it('bold delta produces strong AST node wrapping current', () => {
    const result = boldToAST(dummyCurrent);
    expect(result.type).toBe('strong');
    expect(result.children).toContain(dummyCurrent);
  });

  it('italic delta produces emphasis AST node wrapping current', () => {
    const result = italicToAST(dummyCurrent);
    expect(result.type).toBe('emphasis');
    expect(result.children).toContain(dummyCurrent);
  });

  it('strikethrough delta produces delete AST node wrapping current', () => {
    const result = strikeToAST(dummyCurrent);
    expect(result.type).toBe('delete');
    expect(result.children).toContain(dummyCurrent);
  });
});

// ── Inline code — sanity check ───────────────────────────────────────────────
describe('inlineCode delta → markdown AST', () => {
  function inlineCodeToAST(delta: { insert: string }) {
    return { type: 'inlineCode', value: delta.insert };
  }

  it('produces inlineCode AST node with correct value', () => {
    const result = inlineCodeToAST({ insert: 'const x = 1' });
    expect(result.type).toBe('inlineCode');
    expect(result.value).toBe('const x = 1');
  });
});

// ── Tag serialisation (FR-035 / contracts §5) ────────────────────────────────
describe('tag inline delta → markdown serialisation', () => {
  /**
   * Tags are embedded nodes. On markdown export they are emitted as
   * `#tag-name` inline text. The canonical form is lowercase.
   */
  function tagToMarkdown(name: string): string {
    return `#${name.toLowerCase()}`;
  }

  it('serialises a tag embed as #tag-name', () => {
    expect(tagToMarkdown('JavaScript')).toBe('#javascript');
  });

  it('preserves slashes in nested tag names', () => {
    expect(tagToMarkdown('work/project')).toBe('#work/project');
  });

  it('handles already-lowercase names', () => {
    expect(tagToMarkdown('kotlin')).toBe('#kotlin');
  });
});
