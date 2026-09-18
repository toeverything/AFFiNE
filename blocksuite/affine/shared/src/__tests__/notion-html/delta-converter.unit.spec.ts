import type { DeltaInsert } from '@blocksuite/store';
import type { ElementContent } from 'hast';
import { beforeEach, describe, expect, it } from 'vitest';

import { NotionHtmlDeltaConverter } from '../../adapters/notion-html/delta-converter.js';
import type { HtmlAST } from '../../adapters/types/hast.js';
import type { AffineTextAttributes } from '../../types/index.js';

describe('NotionHtmlDeltaConverter', () => {
  let converter: NotionHtmlDeltaConverter;

  beforeEach(() => {
    converter = new NotionHtmlDeltaConverter(new Map(), [], []);
  });

  it('should handle AST nodes with null children gracefully', () => {
    // This AST simulates a scenario where Notion might output a null child
    // perhaps due to an internal error or malformed content.
    const astWithNullChild: HtmlAST = {
      type: 'element',
      tagName: 'div',
      properties: {},
      children: [
        {
          type: 'element',
          tagName: 'p',
          properties: {},
          children: [{ type: 'text', value: 'Hello' }],
        },
        null as unknown as ElementContent, // Simulate a null child
        {
          type: 'element',
          tagName: 'p',
          properties: {},
          children: [{ type: 'text', value: 'World' }],
        },
      ],
    };

    // Expect no crash and correct processing where null is filtered out
    const delta = converter.astToDelta(astWithNullChild);

    const expectedDelta: DeltaInsert<AffineTextAttributes>[] = [
      { insert: 'Hello' },
      { insert: 'World' },
    ];

    expect(delta).toEqual(expectedDelta);
  });

  it('should handle AST nodes with undefined children gracefully', () => {
    // This AST simulates a scenario where Notion might output an undefined child
    const astWithUndefinedChild: HtmlAST = {
      type: 'element',
      tagName: 'div',
      properties: {},
      children: [
        {
          type: 'element',
          tagName: 'p',
          properties: {},
          children: [{ type: 'text', value: 'First' }],
        },
        undefined as unknown as ElementContent, // Simulate an undefined child
        {
          type: 'element',
          tagName: 'p',
          properties: {},
          children: [{ type: 'text', value: 'Second' }],
        },
      ],
    };

    const delta = converter.astToDelta(astWithUndefinedChild);

    const expectedDelta: DeltaInsert<AffineTextAttributes>[] = [
      { insert: 'First' },
      { insert: 'Second' },
    ];

    expect(delta).toEqual(expectedDelta);
  });
});
