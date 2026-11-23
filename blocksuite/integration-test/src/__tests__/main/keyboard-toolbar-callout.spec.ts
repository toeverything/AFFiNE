import { type BlockComponent, TextSelection } from '@blocksuite/std';
import { beforeEach, expect, test } from 'vitest';

import {
  defaultKeyboardToolbarConfig,
  type KeyboardToolPanelGroup,
} from '../../../../affine/widgets/keyboard-toolbar/src/config.js';
import { wait } from '../utils/common.js';
import { addNote } from '../utils/edgeless.js';
import { setupEditor } from '../utils/setup.js';

beforeEach(async () => {
  const cleanup = await setupEditor('page');
  return cleanup;
});

test('keyboard toolbar callout item inserts a callout after the selected block', async () => {
  const noteId = addNote(doc);
  const note = doc.getBlock(noteId)!.model;
  const paragraph = note.children[0];
  await wait();
  editor.host!.selection.setGroup('note', [
    editor.host!.selection.create(TextSelection, {
      from: { blockId: paragraph.id, index: 0, length: 0 },
      to: null,
    }),
  ]);

  const callout = defaultKeyboardToolbarConfig.items
    .flatMap(item => ('groups' in item ? item.groups : []))
    .filter(
      (group): group is KeyboardToolPanelGroup => typeof group !== 'function'
    )
    .find(group => group.name === 'Basic')
    ?.items.find(item => item.name === 'Callout');
  await callout?.action?.({
    std: editor.std,
    rootComponent: editor.std.view.getBlock(doc.root!.id) as BlockComponent,
    closeToolPanel: () => {},
  });
  await wait();

  expect(note.children.map(child => child.flavour)).toEqual([
    'affine:paragraph',
    'affine:callout',
  ]);
  expect(note.children[1].children.map(child => child.flavour)).toEqual([
    'affine:paragraph',
  ]);
});
