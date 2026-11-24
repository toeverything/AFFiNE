/**
 * @vitest-environment happy-dom
 */
import { ListBlockModel } from '@blocksuite/affine-model';
import { affine } from '@blocksuite/affine-shared/test-utils';
import { Text } from '@blocksuite/store';
import { describe, expect, it, vi } from 'vitest';

import { splitListCommand } from '../commands/split-list';

// Focus handling needs a rendered editor, which the test host does not have.
vi.mock('@blocksuite/affine-rich-text', async importOriginal => ({
  ...(await importOriginal<Record<string, unknown>>()),
  focusTextModel: vi.fn(),
}));

const setup = (collapsed: boolean) => {
  const host = affine`
    <affine-page id="page">
      <affine-note id="note">
        <affine-list id="parent">parent</affine-list>
      </affine-note>
    </affine-page>
  `;
  // The test host is not a Lit element, so it has no render lifecycle.
  Object.defineProperty(host, 'updateComplete', {
    value: Promise.resolve(true),
  });
  const { store } = host;
  store.addBlock('affine:list', { text: new Text('child') }, 'parent');
  store.updateBlock(store.getBlock('parent')!.model, { collapsed });
  return host;
};

const getLists = (host: ReturnType<typeof setup>) =>
  host.store
    .getBlock('note')!
    .model.children.filter(
      (model): model is ListBlockModel => model instanceof ListBlockModel
    );

describe('splitListCommand', () => {
  it.each([
    {
      name: 'moves the children with the text when a collapsed list is split at the start',
      collapsed: true,
      inlineIndex: 0,
      top: { text: '', children: 0, collapsed: false },
      bottom: { text: 'parent', children: 1, collapsed: true },
    },
    {
      name: 'moves the children with the text when an expanded list is split at the start',
      collapsed: false,
      inlineIndex: 0,
      top: { text: '', children: 0, collapsed: false },
      bottom: { text: 'parent', children: 1, collapsed: false },
    },
    {
      name: 'keeps the children under the first line when a collapsed list is split in the middle',
      collapsed: true,
      inlineIndex: 3,
      top: { text: 'par', children: 1, collapsed: true },
      bottom: { text: 'ent', children: 0, collapsed: false },
    },
  ])('$name', ({ collapsed, inlineIndex, top, bottom }) => {
    const host = setup(collapsed);

    host.command.exec(splitListCommand, { blockId: 'parent', inlineIndex });

    expect(
      getLists(host).map(list => ({
        text: list.props.text.toString(),
        children: list.children.length,
        collapsed: list.props.collapsed,
      }))
    ).toEqual([top, bottom]);
  });
});
