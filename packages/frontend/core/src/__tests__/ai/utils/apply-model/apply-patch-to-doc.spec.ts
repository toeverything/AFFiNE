/**
 * @vitest-environment happy-dom
 */
import '@blocksuite/affine-shared/test-utils';

import { getInternalStoreExtensions } from '@blocksuite/affine/extensions/store';
import { StoreExtensionManager } from '@blocksuite/affine-ext-loader';
import { createAffineTemplate } from '@blocksuite/affine-shared/test-utils';
import type { Store } from '@blocksuite/store';
import { describe, expect, it } from 'vitest';

import { applyPatchToDoc } from '../../../../blocksuite/ai/utils/apply-model/apply-patch-to-doc';
import type { PatchOp } from '../../../../blocksuite/ai/utils/apply-model/markdown-diff';

declare module 'vitest' {
  interface Assertion<T = any> {
    toEqualDoc(expected: Store, options?: { compareId?: boolean }): T;
  }
}

const manager = new StoreExtensionManager(getInternalStoreExtensions());
const { affine } = createAffineTemplate(manager.get('store'));

describe('applyPatchToDoc', () => {
  it('should delete a block', async () => {
    const host = affine`
    <affine-page id="page">
      <affine-note id="note">
        <affine-paragraph id="paragraph-1">Hello</affine-paragraph>
        <affine-paragraph id="paragraph-2">World</affine-paragraph>
      </affine-note>
    </affine-page>
  `;

    const patch: PatchOp[] = [{ op: 'delete', id: 'paragraph-1' }];
    await applyPatchToDoc(host.store, patch);

    const expected = affine`
      <affine-page id="page">
        <affine-note id="note">
          <affine-paragraph id="paragraph-2">World</affine-paragraph>
        </affine-note>
      </affine-page>
    `;

    expect(host.store).toEqualDoc(expected.store, {
      compareId: true,
    });
  });

  // FIXME: markdown parse error in test mode
  it.skip('should replace a block', async () => {
    const host = affine`
    <affine-page id="page">
      <affine-note id="note">
        <affine-paragraph id="paragraph-1">Hello</affine-paragraph>
        <affine-paragraph id="paragraph-2">World</affine-paragraph>
      </affine-note>
    </affine-page>
  `;

    const patch: PatchOp[] = [
      {
        op: 'replace',
        id: 'paragraph-1',
        content: 'New content',
      },
    ];

    await applyPatchToDoc(host.store, patch);

    const expected = affine`
      <affine-page id="page">
        <affine-note id="note">
          <affine-paragraph id="paragraph-1">New content</affine-paragraph>
          <affine-paragraph id="paragraph-2">World</affine-paragraph>
        </affine-note>
      </affine-page>
    `;

    expect(host.store).toEqualDoc(expected.store, {
      compareId: true,
    });
  });

  // FIXME: markdown parse error in test mode
  it.skip('should insert a block at index', async () => {
    const host = affine`
    <affine-page id="page">
      <affine-note id="note">
        <affine-paragraph id="paragraph-1">Hello</affine-paragraph>
        <affine-paragraph id="paragraph-2">World</affine-paragraph>
      </affine-note>
    </affine-page>
  `;

    const patch: PatchOp[] = [
      {
        op: 'insert',
        index: 2,
        after: 'paragraph-1',
        block: {
          id: 'paragraph-3',
          type: 'affine:paragraph',
          content: 'Inserted',
        },
      },
    ];

    await applyPatchToDoc(host.store, patch);

    const expected = affine`
      <affine-page id="page">
        <affine-note id="note">
          <affine-paragraph id="paragraph-1">Hello</affine-paragraph>
          <affine-paragraph id="paragraph-2">World</affine-paragraph>
          <affine-paragraph id="paragraph-3">Inserted</affine-paragraph>
        </affine-note>
      </affine-page>
    `;

    expect(host.store).toEqualDoc(expected.store, {
      compareId: true,
    });
  });
});
