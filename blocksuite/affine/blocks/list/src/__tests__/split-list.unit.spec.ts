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
  it('moves the children with the text when a collapsed list is split at the start', () => {
    const host = setup(true);

    host.command.exec(splitListCommand, { blockId: 'parent', inlineIndex: 0 });

    const [top, bottom] = getLists(host);
    expect(getLists(host)).toHaveLength(2);
    expect(top.props.text.toString()).toBe('');
    expect(top.children).toHaveLength(0);
    expect(bottom.props.text.toString()).toBe('parent');
    expect(bottom.children).toHaveLength(1);
    expect(bottom.props.collapsed).toBe(true);
  });

  it('moves the children with the text when an expanded list is split at the start', () => {
    const host = setup(false);

    host.command.exec(splitListCommand, { blockId: 'parent', inlineIndex: 0 });

    const [top, bottom] = getLists(host);
    expect(top.props.text.toString()).toBe('');
    expect(top.children).toHaveLength(0);
    expect(bottom.props.text.toString()).toBe('parent');
    expect(bottom.children).toHaveLength(1);
  });

  it('keeps the children under the first line when a collapsed list is split in the middle', () => {
    const host = setup(true);

    host.command.exec(splitListCommand, { blockId: 'parent', inlineIndex: 3 });

    const [top, bottom] = getLists(host);
    expect(top.props.text.toString()).toBe('par');
    expect(top.children).toHaveLength(1);
    expect(bottom.props.text.toString()).toBe('ent');
    expect(bottom.children).toHaveLength(0);
  });
});
