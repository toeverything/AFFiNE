import 'fake-indexeddb/auto';

import { getStoreManager } from '@affine/core/blocksuite/manager/store';
import { Text } from '@blocksuite/affine/store';
import { TestWorkspace } from '@blocksuite/affine/store/test';
import { describe, expect, test } from 'vitest';

import {
  applyMirrorReconciliation,
  applyPreparedMirrorPatch,
  parseMirrorMarkdown,
  planMirrorReconciliation,
  prepareMirrorApply,
} from './index';

const extensions = getStoreManager().config.init().value.get('store');

function blockText(model: unknown) {
  return (model as { props: { text?: Text } } | null)?.props.text;
}

function documentMarkdown(
  blocks: Array<{ id: string; flavour?: string; content: string }>,
  options: { title?: string; sourceHash?: string; extraField?: string } = {}
) {
  return [
    '---',
    'affineFormatVersion: 2',
    'markerGrammarVersion: 1',
    'workspaceId: "workspace"',
    'docId: "doc"',
    `title: ${JSON.stringify(options.title ?? 'Title')}`,
    'createdAt: null',
    'updatedAt: null',
    'trashed: false',
    'primaryMode: "page"',
    'tags: []',
    `sourceHash: ${JSON.stringify(options.sourceHash ?? 'source')}`,
    'generated: true',
    ...(options.extraField ? [options.extraField] : []),
    '---',
    ...blocks.flatMap(block => [
      `<!-- affine-mirror:block id="${block.id}" flavour="${block.flavour ?? 'affine:paragraph'}" -->`,
      block.content,
      '',
    ]),
  ].join('\n');
}

describe('local mirror parser and planner', () => {
  test('parses exact v2 control fields, line endings, and new markers', () => {
    const parsed = parseMirrorMarkdown(
      documentMarkdown([
        { id: 'block-1', content: 'Hello' },
        { id: 'new:draft_1', flavour: 'affine:code', content: '```ts\n1\n```' },
      ]).replaceAll('\n', '\r\n')
    );
    expect(parsed.blocks).toEqual([
      { id: 'block-1', flavour: 'affine:paragraph', content: 'Hello' },
      {
        id: 'new:draft_1',
        flavour: 'affine:code',
        content: '```ts\n1\n```',
      },
    ]);
  });

  test('rejects malformed control data and duplicate/tampered markers', () => {
    expect(() =>
      parseMirrorMarkdown(
        documentMarkdown([{ id: 'block-1', content: 'Hello' }], {
          extraField: 'unknown: true',
        })
      )
    ).toThrow('frontmatter fields');
    expect(() =>
      parseMirrorMarkdown(
        documentMarkdown([
          { id: 'block-1', content: 'A' },
          { id: 'block-1', content: 'B' },
        ])
      )
    ).toThrow('duplicated');
    expect(() =>
      parseMirrorMarkdown(documentMarkdown([{ id: 'new:', content: 'A' }]))
    ).toThrow('invalid');
    expect(() =>
      parseMirrorMarkdown(
        documentMarkdown([{ id: 'block-1', content: 'A' }]).replace(
          '\n---\n<!--',
          '\n<!--'
        )
      )
    ).toThrow();
  });

  test('plans disjoint updates and conflicts on the same block', () => {
    const base = parseMirrorMarkdown(
      documentMarkdown([
        { id: 'a', content: 'A' },
        { id: 'b', content: 'B' },
      ])
    );
    const local = parseMirrorMarkdown(
      documentMarkdown([
        { id: 'a', content: 'Local A' },
        { id: 'b', content: 'B' },
      ])
    );
    const remote = parseMirrorMarkdown(
      documentMarkdown(
        [
          { id: 'a', content: 'A' },
          { id: 'b', content: 'Remote B' },
        ],
        { sourceHash: 'remote-source' }
      )
    );
    expect(planMirrorReconciliation(base, local, remote)).toEqual({
      type: 'apply',
      operations: [
        {
          type: 'update',
          block: { id: 'a', flavour: 'affine:paragraph', content: 'Local A' },
        },
      ],
      title: undefined,
    });

    const sameRemote = parseMirrorMarkdown(
      documentMarkdown(
        [
          { id: 'a', content: 'Remote A' },
          { id: 'b', content: 'B' },
        ],
        { sourceHash: 'remote-source' }
      )
    );
    expect(planMirrorReconciliation(base, local, sameRemote)).toMatchObject({
      type: 'conflict',
      reason: 'same block changed: a',
    });
  });

  test('handles insert/delete/title, convergence, and unsupported reorder', () => {
    const base = parseMirrorMarkdown(
      documentMarkdown([
        { id: 'a', content: 'A' },
        { id: 'b', content: 'B' },
      ])
    );
    const local = parseMirrorMarkdown(
      documentMarkdown(
        [
          { id: 'a', content: 'A' },
          { id: 'new:draft', content: 'Inserted' },
        ],
        { title: 'Local title' }
      )
    );
    expect(planMirrorReconciliation(base, local, base)).toEqual({
      type: 'apply',
      operations: [
        { type: 'delete', id: 'b' },
        {
          type: 'insert',
          block: {
            id: 'new:draft',
            flavour: 'affine:paragraph',
            content: 'Inserted',
          },
          afterId: 'a',
        },
      ],
      title: 'Local title',
    });
    const converged = parseMirrorMarkdown(
      documentMarkdown([
        { id: 'a', content: 'Same edit' },
        { id: 'b', content: 'B' },
      ])
    );
    expect(planMirrorReconciliation(base, converged, converged)).toEqual({
      type: 'noop',
    });

    const reordered = parseMirrorMarkdown(
      documentMarkdown([
        { id: 'b', content: 'B' },
        { id: 'a', content: 'A' },
      ])
    );
    expect(planMirrorReconciliation(base, reordered, base)).toMatchObject({
      type: 'unsupported',
    });
  });

  test('allows remote-only stable insertions without planning destructive work', () => {
    const base = parseMirrorMarkdown(
      documentMarkdown([{ id: 'a', content: 'A' }])
    );
    const remote = parseMirrorMarkdown(
      documentMarkdown(
        [
          { id: 'remote', content: 'Remote insertion' },
          { id: 'a', content: 'A' },
        ],
        { sourceHash: 'remote-source' }
      )
    );
    expect(planMirrorReconciliation(base, base, remote)).toEqual({
      type: 'noop',
    });
  });
});

describe('local mirror prepared apply', () => {
  test('updates, deletes, and inserts only explicitly planned direct blocks', async () => {
    const workspace = new TestWorkspace({ id: 'workspace' });
    workspace.meta.initialize();
    const doc = workspace.createDoc('doc').getStore({ extensions });
    doc.load();
    const root = doc.addBlock('affine:page', { title: new Text('Title') });
    const note = doc.addBlock('affine:note', {}, root);
    const first = doc.addBlock(
      'affine:paragraph',
      { text: new Text('First') },
      note
    );
    const second = doc.addBlock(
      'affine:paragraph',
      { text: new Text('Second') },
      note
    );
    const remoteOnly = doc.addBlock(
      'affine:paragraph',
      { text: new Text('Remote only') },
      note
    );

    const prepared = await prepareMirrorApply(doc, note, [
      {
        type: 'update',
        block: {
          id: first,
          flavour: 'affine:paragraph',
          content: '**Changed**',
        },
      },
      { type: 'delete', id: second },
      {
        type: 'insert',
        block: {
          id: 'new:draft',
          flavour: 'affine:paragraph',
          content: 'Inserted',
        },
        afterId: first,
      },
    ]);
    applyPreparedMirrorPatch(doc, prepared);

    expect(blockText(doc.getModelById(first))?.toString()).toBe('Changed');
    expect(blockText(doc.getModelById(first))?.toDelta()[0]).toMatchObject({
      attributes: { bold: true },
    });
    expect(doc.getModelById(second)).toBeNull();
    expect(blockText(doc.getModelById(remoteOnly))?.toString()).toBe(
      'Remote only'
    );
    const children = doc.getModelById(note)?.children ?? [];
    expect(children.map(child => blockText(child)?.toString())).toEqual([
      'Changed',
      'Inserted',
      'Remote only',
    ]);
  });

  test('updates safe leaves that belong to different body notes', async () => {
    const workspace = new TestWorkspace({ id: 'workspace' });
    workspace.meta.initialize();
    const doc = workspace.createDoc('doc').getStore({ extensions });
    doc.load();
    const root = doc.addBlock('affine:page', { title: new Text('Title') });
    const firstNote = doc.addBlock('affine:note', {}, root);
    const first = doc.addBlock(
      'affine:paragraph',
      { text: new Text('First') },
      firstNote
    );
    const secondNote = doc.addBlock('affine:note', {}, root);
    const second = doc.addBlock(
      'affine:paragraph',
      { text: new Text('Second') },
      secondNote
    );

    await applyMirrorReconciliation({
      doc,
      parentId: firstNote,
      expectedParentIds: new Map([
        [first, firstNote],
        [second, secondNote],
      ]),
      result: {
        type: 'apply',
        operations: [
          {
            type: 'update',
            block: {
              id: first,
              flavour: 'affine:paragraph',
              content: 'First changed',
            },
          },
          {
            type: 'update',
            block: {
              id: second,
              flavour: 'affine:paragraph',
              content: 'Second changed',
            },
          },
        ],
      },
      canUpdate: async () => true,
      sourceStillCurrent: () => true,
      changeTitle: () => undefined,
    });

    expect(blockText(doc.getModelById(first))?.toString()).toBe(
      'First changed'
    );
    expect(blockText(doc.getModelById(second))?.toString()).toBe(
      'Second changed'
    );
  });

  test('rejects mismatched Markdown before changing the document', async () => {
    const workspace = new TestWorkspace({ id: 'workspace' });
    workspace.meta.initialize();
    const doc = workspace.createDoc('doc').getStore({ extensions });
    doc.load();
    const root = doc.addBlock('affine:page', { title: new Text('Title') });
    const note = doc.addBlock('affine:note', {}, root);
    const paragraph = doc.addBlock(
      'affine:paragraph',
      { text: new Text('Original') },
      note
    );

    await expect(
      prepareMirrorApply(doc, note, [
        {
          type: 'update',
          block: {
            id: paragraph,
            flavour: 'affine:code',
            content: 'plain paragraph',
          },
        },
      ])
    ).rejects.toThrow('matching leaf block');
    expect(blockText(doc.getModelById(paragraph))?.toString()).toBe('Original');
  });

  test('rejects a deleted insertion anchor before changing the document', async () => {
    const workspace = new TestWorkspace({ id: 'workspace' });
    workspace.meta.initialize();
    const doc = workspace.createDoc('doc').getStore({ extensions });
    doc.load();
    const root = doc.addBlock('affine:page', { title: new Text('Title') });
    const note = doc.addBlock('affine:note', {}, root);
    const paragraph = doc.addBlock(
      'affine:paragraph',
      { text: new Text('Original') },
      note
    );

    await expect(
      prepareMirrorApply(doc, note, [
        { type: 'delete', id: paragraph },
        {
          type: 'insert',
          block: {
            id: 'new:draft',
            flavour: 'affine:paragraph',
            content: 'Inserted',
          },
          afterId: paragraph,
        },
      ])
    ).rejects.toThrow('scheduled for deletion');
    expect(blockText(doc.getModelById(paragraph))?.toString()).toBe('Original');
  });

  test('checks permission and source immediately before apply', async () => {
    const workspace = new TestWorkspace({ id: 'workspace' });
    workspace.meta.initialize();
    const doc = workspace.createDoc('doc').getStore({ extensions });
    doc.load();
    const root = doc.addBlock('affine:page', { title: new Text('Title') });
    const note = doc.addBlock('affine:note', {}, root);
    const paragraph = doc.addBlock(
      'affine:paragraph',
      { text: new Text('Original') },
      note
    );
    const result = {
      type: 'apply' as const,
      operations: [
        {
          type: 'update' as const,
          block: {
            id: paragraph,
            flavour: 'affine:paragraph',
            content: 'Changed',
          },
        },
      ],
    };

    await expect(
      applyMirrorReconciliation({
        doc,
        parentId: note,
        result,
        canUpdate: async () => false,
        sourceStillCurrent: () => true,
        changeTitle: () => undefined,
      })
    ).rejects.toThrow('permission denied');
    expect(blockText(doc.getModelById(paragraph))?.toString()).toBe('Original');

    await expect(
      applyMirrorReconciliation({
        doc,
        parentId: note,
        result,
        canUpdate: async () => true,
        sourceStillCurrent: () => false,
        changeTitle: () => undefined,
      })
    ).rejects.toThrow('changed while applying');
    expect(blockText(doc.getModelById(paragraph))?.toString()).toBe('Original');
  });

  test('creates one undo item and leaves title retryable after metadata failure', async () => {
    const workspace = new TestWorkspace({ id: 'workspace' });
    workspace.meta.initialize();
    const doc = workspace.createDoc('doc').getStore({ extensions });
    doc.load();
    const root = doc.addBlock('affine:page', { title: new Text('Title') });
    const note = doc.addBlock('affine:note', {}, root);
    const paragraph = doc.addBlock(
      'affine:paragraph',
      { text: new Text('Original') },
      note
    );
    doc.resetHistory();

    await expect(
      applyMirrorReconciliation({
        doc,
        parentId: note,
        result: {
          type: 'apply',
          operations: [
            {
              type: 'update',
              block: {
                id: paragraph,
                flavour: 'affine:paragraph',
                content: 'Changed',
              },
            },
          ],
          title: 'New title',
        },
        canUpdate: async () => true,
        sourceStillCurrent: () => true,
        changeTitle: () => {
          throw new Error('metadata failed');
        },
      })
    ).rejects.toThrow('metadata failed');
    expect(blockText(doc.getModelById(paragraph))?.toString()).toBe('Changed');

    const base = parseMirrorMarkdown(
      documentMarkdown([{ id: paragraph, content: 'Original' }])
    );
    const local = parseMirrorMarkdown(
      documentMarkdown([{ id: paragraph, content: 'Changed' }], {
        title: 'New title',
      })
    );
    const remote = parseMirrorMarkdown(
      documentMarkdown([{ id: paragraph, content: 'Changed' }], {
        sourceHash: 'remote-source',
      })
    );
    const retry = planMirrorReconciliation(base, local, remote);
    expect(retry).toEqual({
      type: 'apply',
      operations: [],
      title: 'New title',
    });
    let retriedTitle = '';
    if (retry.type !== 'apply') throw new Error('Expected title retry plan');
    await applyMirrorReconciliation({
      doc,
      parentId: note,
      result: retry,
      canUpdate: async () => true,
      sourceStillCurrent: () => true,
      changeTitle: title => {
        retriedTitle = title;
      },
    });
    expect(retriedTitle).toBe('New title');
    expect(blockText(doc.getModelById(paragraph))?.toString()).toBe('Changed');
    doc.undo();
    expect(blockText(doc.getModelById(paragraph))?.toString()).toBe('Original');
  });
});
