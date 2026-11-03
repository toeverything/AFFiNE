import type { EditorHost } from '@blocksuite/affine/std';
import type { Slice } from '@blocksuite/affine/store';
import { expect, test, vi } from 'vitest';

const adapter = vi.hoisted(() => ({ wait: Promise.resolve() }));
vi.mock('@affine/core/modules/workspace/impls/workspace', () => ({
  WorkspaceImpl: class {},
}));
vi.mock('@blocksuite/affine/std', () => ({
  BlockStdScope: class {},
  TextSelection: 'text',
}));
vi.mock('@blocksuite/affine/store', () => ({
  toDraftModel: (model: unknown) => model,
  Transformer: class {},
}));
vi.mock('yjs', () => ({ Doc: class {} }));
vi.mock('../../../manager/store', () => ({ getStoreManager: vi.fn() }));
vi.mock('@blocksuite/affine/shared/adapters', () => {
  class Adapter {
    async fromSliceSnapshot({
      snapshot,
    }: {
      snapshot: {
        content: Array<{
          props: { text: { delta: Array<{ insert: string }> } };
        }>;
      };
    }) {
      await adapter.wait;
      return {
        file: snapshot.content
          .map(item =>
            item.props.text.delta.map(delta => delta.insert).join('')
          )
          .join('\n'),
      };
    }
  }
  return {
    titleMiddleware: vi.fn(),
    embedSyncedDocMiddleware: vi.fn(),
    MarkdownAdapter: Adapter,
    PlainTextAdapter: Adapter,
  };
});

import { getContentFromSlice } from '../../../utils/markdown-utils';

function fixture() {
  const values = ['OUTSIDE FIRST', 'middle', 'LAST OUTSIDE'];
  const range = {
    from: { blockId: '0', index: 8, length: 5 },
    to: { blockId: '2', index: 0, length: 4 },
  };
  const models = values.map((value, index) => ({
    id: String(index),
    text: {
      sliceToDelta: (from: number, to: number) => [
        { insert: value.slice(from, to) },
      ],
    },
  }));
  const host = {
    selection: { find: () => range },
    store: { getModelById: (id: string) => models[Number(id)] },
    std: {
      store: {
        workspace: { meta: { docMetas: [] } },
        getTransformer: () => ({
          sliceToSnapshot: () => ({
            content: values.map((value, index) => ({
              id: String(index),
              props: { text: { delta: [{ insert: value }] } },
              children: [],
            })),
          }),
          assetsManager: {},
        }),
      },
    },
  };
  return { host: host as unknown as EditorHost, range };
}

test('native snapshot processing trims both selected endpoints', async () => {
  const { host } = fixture();
  expect(await getContentFromSlice(host, {} as Slice, 'plain-text')).toBe(
    'FIRST\nmiddle\nLAST'
  );
});

test('zero-length endpoint contributes no unselected paragraph text', async () => {
  const { host, range } = fixture();
  range.from.length = 0;
  expect(await getContentFromSlice(host, {} as Slice, 'markdown')).toBe(
    '\nmiddle\nLAST'
  );
});

test('native snapshot stays fixed when selection changes during adapter export', async () => {
  const { host, range } = fixture();
  let finish!: () => void;
  adapter.wait = new Promise(resolve => {
    finish = resolve;
  });
  const pending = getContentFromSlice(host, {} as Slice, 'plain-text');
  range.from = { blockId: '0', index: 0, length: 7 };
  range.to = { blockId: '2', index: 5, length: 7 };
  finish();
  expect(await pending).toBe('FIRST\nmiddle\nLAST');
  adapter.wait = Promise.resolve();
});
