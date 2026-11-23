import type { ParagraphBlockModel } from '@blocksuite/affine-model';
import { type BlockComponent, BlockSelection } from '@blocksuite/std';
import { Text } from '@blocksuite/store';
import { beforeEach, expect, test } from 'vitest';

import {
  defaultKeyboardToolbarConfig,
  type KeyboardToolbarActionItem,
  type KeyboardToolPanelGroup,
} from '../../../../affine/widgets/keyboard-toolbar/src/config.js';
import { wait } from '../utils/common.js';
import { addNote } from '../utils/edgeless.js';
import { setupEditor } from '../utils/setup.js';

beforeEach(async () => {
  const cleanup = await setupEditor('page');
  return cleanup;
});

function findHighlightItem(
  groupName: string,
  name: string
): KeyboardToolbarActionItem {
  const groups = defaultKeyboardToolbarConfig.items
    .flatMap(item => ('items' in item ? item.items : [item]))
    .flatMap(item => ('groups' in item ? item.groups : []))
    .filter(
      (group): group is KeyboardToolPanelGroup => typeof group !== 'function'
    );
  const highlightGroups = groups.slice(
    groups.findIndex(group => group.name === 'Color')
  );
  const item = highlightGroups
    .find(group => group.name === groupName)
    ?.items.find(entry => entry.name === name);
  if (!item) {
    throw new Error(`Cannot find highlight item: ${groupName}/${name}`);
  }
  return item;
}

test.each([
  { group: 'Color', attribute: 'color' },
  { group: 'Background', attribute: 'background' },
] as const)(
  'keyboard toolbar default $group item removes the $attribute highlight',
  async ({ group, attribute }) => {
    const noteId = addNote(doc);
    const paragraph = doc.getBlock(noteId)!.model
      .children[0] as ParagraphBlockModel;
    doc.updateBlock(paragraph, { text: new Text('hello') });
    await wait();
    editor.host!.selection.setGroup('note', [
      editor.host!.selection.create(BlockSelection, {
        blockId: paragraph.id,
      }),
    ]);

    const ctx = {
      std: editor.std,
      rootComponent: editor.std.view.getBlock(doc.root!.id) as BlockComponent,
      closeToolPanel: () => {},
    };
    const highlight = () =>
      paragraph.props.text
        .toDelta()
        .map(delta => delta.attributes?.[attribute]);

    await findHighlightItem(group, 'Red').action?.(ctx);
    await wait();
    expect(highlight()).toEqual([expect.stringContaining('red')]);

    await findHighlightItem(group, 'Default Color').action?.(ctx);
    await wait();
    expect(highlight()).toEqual([undefined]);
  }
);
