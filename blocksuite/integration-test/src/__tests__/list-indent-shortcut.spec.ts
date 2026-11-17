import { IS_MAC } from '@blocksuite/global/env';
import { Text } from '@blocksuite/store';
import { beforeEach, describe, expect, test } from 'vitest';
import { userEvent } from 'vitest/browser';

import { wait } from './utils/common.js';
import { addNote } from './utils/edgeless.js';
import { setupEditor } from './utils/setup.js';

// F-05 (inbox, 2026-11-13): the list block's Mod-Shift-. / Mod-Shift-,
// indent and outdent shortcuts were bound as `Mod-Shift-Period` /
// `Mod-Shift-Comma`, names the keymap never produces, so they never fired.
describe('list block: Mod-Shift-. and Mod-Shift-, indent and outdent', () => {
  beforeEach(async () => {
    const cleanup = await setupEditor('page');
    return cleanup;
  });

  test('the second list item indents under the first and back', async () => {
    const noteId = addNote(doc);
    doc.addBlock(
      'affine:list',
      { type: 'bulleted', text: new Text('One') },
      noteId
    );
    const secondId = doc.addBlock(
      'affine:list',
      { type: 'bulleted', text: new Text('Two') },
      noteId
    );
    await wait(200);
    const richText = document.querySelector(
      `[data-block-id="${secondId}"] rich-text`
    ) as HTMLElement;
    await userEvent.click(richText);
    await wait(100);
    const mod = IS_MAC ? 'Meta' : 'Control';
    const parentFlavour = () => doc.getParent(secondId)?.flavour;

    const before = parentFlavour();
    await userEvent.keyboard(`{${mod}>}{Shift>}.{/Shift}{/${mod}}`);
    await wait(150);
    const indented = parentFlavour();
    await userEvent.keyboard(`{${mod}>}{Shift>},{/Shift}{/${mod}}`);
    await wait(150);
    expect({ before, indented, outdented: parentFlavour() }).toEqual({
      before: 'affine:note',
      indented: 'affine:list',
      outdented: 'affine:note',
    });
  });
});
