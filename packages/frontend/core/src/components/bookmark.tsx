import { Menu, MenuItem } from '@affine/component/ui/menu';
import type { SerializedBlock } from '@blocksuite/blocks';
import type { BaseBlockModel } from '@blocksuite/store';
import type { Page } from '@blocksuite/store';
import type { VEditor } from '@blocksuite/virgo';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

type ShortcutMap = {
  [key: string]: (e: KeyboardEvent, page: Page) => void;
};

const menuOptions = [
  {
    id: 'dismiss',
    label: 'Dismiss',
  },
  {
    id: 'bookmark',
    label: 'Create bookmark',
  },
];

function getCurrentNativeRange(selection = window.getSelection()) {
  if (!selection) {
    return null;
  }
  if (selection.rangeCount === 0) {
    return null;
  }
  if (selection.rangeCount > 1) {
    console.warn('getCurrentRange may be wrong, rangeCount > 1');
  }
  return selection.getRangeAt(0);
}

const handleEnter = ({
  page,
  selectedOption,
  callback,
}: {
  page: Page;
  selectedOption: keyof ShortcutMap;
  callback: () => void;
}) => {
  if (selectedOption === 'dismiss') {
    return callback();
  }
  const native = getCurrentNativeRange();
  if (!native) {
    return callback();
  }
  const container = native.startContainer;
  const element =
    container instanceof Element ? container : container?.parentElement;
  const virgo = element?.closest<Element & { virgoEditor: VEditor }>(
    '[data-virgo-root]'
  )?.virgoEditor;
  if (!virgo) {
    return callback();
  }
  const linkInfo = virgo
    ?.getDeltasByVRange({
      index: native.startOffset,
      length: 0,
    })
    .find(delta => delta[0]?.attributes?.link);
  if (!linkInfo) {
    return;
  }
  const [, { index, length }] = linkInfo;
  const link = linkInfo[0]?.attributes?.link as string;

  const model = element?.closest<Element & { model: BaseBlockModel }>(
    '[data-block-id]'
  )?.model;
  if (!model) {
    return callback();
  }
  const parent = page.getParent(model);
  if (!parent) {
    return callback();
  }
  const currentBlockIndex = parent.children.indexOf(model);
  page.addBlock(
    'affine:bookmark',
    { url: link },
    parent,
    currentBlockIndex + 1
  );

  virgo?.deleteText({
    index,
    length,
  });

  if (model.isEmpty()) {
    page.deleteBlock(model);
  }
  return callback();
};

const shouldShowBookmarkMenu = (pastedBlocks: Record<string, unknown>[]) => {
  if (!pastedBlocks.length || pastedBlocks.length > 1) {
    return;
  }
  const [firstBlock] = pastedBlocks as [SerializedBlock];
  if (
    !firstBlock.text ||
    !firstBlock.text.length ||
    firstBlock.text.length > 1
  ) {
    return;
  }
  return !!firstBlock.text[0].attributes?.link;
};

export type BookmarkProps = {
  page: Page;
};

export const Bookmark = ({ page }: BookmarkProps) => {
  const [anchor, setAnchor] = useState<Range | null>(null);

  useEffect(() => {
    const disposer = page.slots.pasted.on(pastedBlocks => {
      if (!shouldShowBookmarkMenu(pastedBlocks)) {
        return;
      }
      window.setTimeout(() => {
        setAnchor(getCurrentNativeRange());
      }, 100);
    });

    return () => {
      disposer.dispose();
    };
  }, [page]);

  const portalContainer = anchor?.startContainer.parentElement;

  return anchor && portalContainer
    ? createPortal(
        <Menu
          rootOptions={{
            defaultOpen: true,
            onOpenChange: (e: boolean) => !e && setAnchor(null),
          }}
          items={menuOptions.map(({ id, label }) => (
            <MenuItem
              key={id}
              onClick={() =>
                handleEnter({
                  page,
                  selectedOption: id,
                  callback: () => setAnchor(null),
                })
              }
            >
              {label}
            </MenuItem>
          ))}
        >
          <span></span>
        </Menu>,
        portalContainer
      )
    : null;
};
