import { MenuItem, MuiClickAwayListener, PureMenu } from '@affine/component';
import type { EditorPlugin } from '@affine/component/block-suite-editor';
// eslint-disable-next-line @typescript-eslint/no-restricted-imports
import { getCurrentBlockRange } from '@blocksuite/blocks/dist/__internal__/utils/block-range.js';
// eslint-disable-next-line @typescript-eslint/no-restricted-imports
import { getVirgoByModel } from '@blocksuite/blocks/dist/__internal__/utils/query.js';
// eslint-disable-next-line @typescript-eslint/no-restricted-imports
import {
  getCurrentNativeRange,
  hasNativeSelection,
} from '@blocksuite/blocks/dist/__internal__/utils/selection.js';
import type { Page } from '@blocksuite/store';
import { assertExists } from '@blocksuite/store';
import { useEffect, useMemo, useRef, useState } from 'react';

const isCursorInLink = (page: Page) => {
  if (!hasNativeSelection()) return false;
  const blockRange = getCurrentBlockRange(page);
  if (
    !blockRange ||
    blockRange.type !== 'Native' ||
    blockRange.startOffset !== blockRange.endOffset
  ) {
    return false;
  }
  const {
    models: [model],
  } = blockRange;
  const vEditor = getVirgoByModel(model);
  const delta = vEditor?.getDeltaByRangeIndex(blockRange.startOffset);

  return delta?.attributes?.link;
};

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
  const blockRange = getCurrentBlockRange(page) as Exclude<
    ReturnType<typeof getCurrentBlockRange>,
    null
  >;
  const vEditor = getVirgoByModel(blockRange.models[0]);
  const linkInfo = vEditor!
    .getDeltasByVRange({
      index: blockRange.startOffset,
      length: 0,
    })
    .find(delta => delta[0]?.attributes?.link);
  if (!linkInfo) {
    return;
  }
  const [, { index, length }] = linkInfo;
  const link = linkInfo[0]?.attributes?.link as string;

  const model = blockRange.models[0];
  const parent = page.getParent(model);
  assertExists(parent);
  const currentBlockIndex = parent.children.indexOf(model);
  page.addBlock(
    'affine:bookmark',
    { url: link },
    parent,
    currentBlockIndex + 1
  );

  vEditor!.deleteText({
    index,
    length,
  });
  return callback();
};

const BookMarkMenu: EditorPlugin['render'] = ({ page }) => {
  const [anchor, setAnchor] = useState<Range | null>(null);
  const [selectedOption, setSelectedOption] = useState<string>('');
  const shouldHijack = useRef(false);
  const shortcutMap = useMemo<ShortcutMap>(
    () => ({
      ArrowUp: () => {
        const curIndex = menuOptions.findIndex(
          ({ id }) => id === selectedOption
        );
        if (menuOptions[curIndex - 1]) {
          setSelectedOption(menuOptions[curIndex - 1].id);
        } else if (curIndex === -1) {
          setSelectedOption(menuOptions[0].id);
        } else {
          setSelectedOption(menuOptions[menuOptions.length - 1].id);
        }
      },
      ArrowDown: () => {
        const curIndex = menuOptions.findIndex(
          ({ id }) => id === selectedOption
        );
        if (curIndex !== -1 && menuOptions[curIndex + 1]) {
          setSelectedOption(menuOptions[curIndex + 1].id);
        } else {
          setSelectedOption(menuOptions[0].id);
        }
      },
      Enter: () =>
        handleEnter({
          page,
          selectedOption,
          callback: () => {
            shouldHijack.current = false;
            setAnchor(null);
          },
        }),
    }),
    [page, selectedOption]
  );

  useEffect(() => {
    // TODO: textUpdated slot is not working
    // const disposer = page.slots.textUpdated.on(() => {
    //   console.log('text Updated', page);
    // });
    const disposer1 = page.slots.historyUpdated.on(() => {
      if (!isCursorInLink(page)) {
        return;
      }
      setAnchor(getCurrentNativeRange());
      shouldHijack.current = true;
    });

    return () => {
      // disposer.dispose();
      disposer1.dispose();
    };
  }, [page, shortcutMap]);

  useEffect(() => {
    const keydown = (e: KeyboardEvent) => {
      if (!shouldHijack.current) {
        return;
      }
      const shortcut = shortcutMap[e.key];
      if (shortcut) {
        e.stopPropagation();
        e.preventDefault();
        shortcut(e, page);
      }
    };
    document.addEventListener('keydown', keydown, { capture: true });

    return () => {
      document.removeEventListener('keydown', keydown, { capture: true });
    };
  }, [page, shortcutMap]);

  return anchor ? (
    <MuiClickAwayListener
      onClickAway={() => {
        setAnchor(null);
        setSelectedOption('');
      }}
    >
      <div>
        <PureMenu open={!!anchor} anchorEl={anchor}>
          {menuOptions.map(({ id, label }) => {
            return (
              <MenuItem
                key={id}
                active={selectedOption === id}
                onClick={() => {}}
              >
                {label}
              </MenuItem>
            );
          })}
        </PureMenu>
      </div>
    </MuiClickAwayListener>
  ) : null;
};

export const bookmarkPlugin: EditorPlugin = {
  flavour: 'bookmark',
  render: BookMarkMenu,
};
