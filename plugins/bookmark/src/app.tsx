import { MenuItem, PureMenu } from '@affine/component';
import { MuiClickAwayListener } from '@affine/component';
import type { SerializedBlock } from '@blocksuite/blocks';
import type { BaseBlockModel } from '@blocksuite/store';
import type { Page } from '@blocksuite/store';
import type { VEditor } from '@blocksuite/virgo';
import type { ReactElement } from 'react';
import { StrictMode } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';

export type BookMarkProps = {
  page: Page;
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

const shouldShowBookmarkMenu = (pastedBlocks: SerializedBlock[]) => {
  if (!pastedBlocks.length || pastedBlocks.length > 1) {
    return;
  }
  const [firstBlock] = pastedBlocks;
  if (
    !firstBlock.text ||
    !firstBlock.text.length ||
    firstBlock.text.length > 1
  ) {
    return;
  }
  return !!firstBlock.text[0].attributes?.link;
};

const BookMarkUI = ({ page }: BookMarkProps) => {
  const [anchor, setAnchor] = useState<Range | null>(null);
  const [selectedOption, setSelectedOption] = useState<string>(
    menuOptions[0].id
  );
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
            setAnchor(null);
          },
        }),
      Escape: () => {
        setAnchor(null);
      },
    }),
    [page, selectedOption]
  );
  const onKeydown = useCallback(
    (e: KeyboardEvent) => {
      const shortcut = shortcutMap[e.key];
      if (shortcut) {
        e.stopPropagation();
        e.preventDefault();
        shortcut(e, page);
      } else {
        setAnchor(null);
      }
    },
    [page, shortcutMap]
  );

  useEffect(() => {
    const disposer = page.slots.pasted.on(pastedBlocks => {
      if (!shouldShowBookmarkMenu(pastedBlocks)) {
        return;
      }
      setTimeout(() => {
        setAnchor(getCurrentNativeRange());
      }, 100);
    });

    return () => {
      disposer.dispose();
    };
  }, [onKeydown, page, shortcutMap]);

  useEffect(() => {
    if (anchor) {
      document.addEventListener('keydown', onKeydown, { capture: true });
    } else {
      // reset status and remove event
      setSelectedOption(menuOptions[0].id);
      document.removeEventListener('keydown', onKeydown, { capture: true });
    }

    return () => {
      document.removeEventListener('keydown', onKeydown, { capture: true });
    };
  }, [anchor, onKeydown]);

  return anchor ? (
    <MuiClickAwayListener
      onClickAway={() => {
        setAnchor(null);
        setSelectedOption('');
      }}
    >
      <div>
        <PureMenu open={!!anchor} anchorEl={anchor} placement="bottom-start">
          {menuOptions.map(({ id, label }) => {
            return (
              <MenuItem
                key={id}
                active={selectedOption === id}
                onClick={() => {
                  handleEnter({
                    page,
                    selectedOption: id,
                    callback: () => {
                      setAnchor(null);
                    },
                  });
                }}
                disableHover={true}
                onMouseEnter={() => {
                  setSelectedOption(id);
                }}
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

type AppProps = {
  page: Page;
};

export const App = (props: AppProps): ReactElement => {
  return (
    <StrictMode>
      <BookMarkUI page={props.page} />
    </StrictMode>
  );
};
