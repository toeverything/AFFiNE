import type { ForwardedRef, PropsWithChildren } from 'react';
import { memo, useEffect, useImperativeHandle } from 'react';

import {
  listPropsAtom,
  selectionStateAtom,
  useAtom,
  useSetAtom,
} from './scoped-atoms';
import type { ItemListHandle, ListItem, ListProps } from './types';

// when pressing ESC or double clicking outside of the page list, close the selection mode
// TODO(@Peng): use jotai-effect instead but it seems it does not work with jotai-scope?
const useItemSelectionStateEffect = () => {
  const [selectionState, setSelectionActive] = useAtom(selectionStateAtom);
  useEffect(() => {
    if (
      selectionState.selectionActive &&
      selectionState.selectable === 'toggle'
    ) {
      const startTime = Date.now();
      const dblClickHandler = (e: MouseEvent) => {
        if (Date.now() - startTime < 200) {
          return;
        }
        const target = e.target as HTMLElement;
        // skip if event target is inside of a button or input
        // or within a toolbar (like page list floating toolbar)
        if (
          target.tagName === 'BUTTON' ||
          target.tagName === 'INPUT' ||
          (e.target as HTMLElement).closest(
            'button, input, [role="toolbar"], [role="list-item"]'
          )
        ) {
          return;
        }
        setSelectionActive(false);
        selectionState.onSelectedIdsChange?.([]);
      };

      const escHandler = (e: KeyboardEvent) => {
        if (Date.now() - startTime < 200) {
          return;
        }
        if (e.key === 'Escape') {
          setSelectionActive(false);
          selectionState.onSelectedIdsChange?.([]);
        }
      };

      document.addEventListener('dblclick', dblClickHandler);
      document.addEventListener('keydown', escHandler);

      return () => {
        document.removeEventListener('dblclick', dblClickHandler);
        document.removeEventListener('keydown', escHandler);
      };
    }
    return;
  }, [
    selectionState,
    selectionState.selectable,
    selectionState.selectionActive,
    setSelectionActive,
  ]);
};

export const ListInnerWrapper = memo(
  ({
    handleRef,
    children,
    onSelectionActiveChange,
    ...props
  }: PropsWithChildren<
    ListProps<ListItem> & { handleRef: ForwardedRef<ItemListHandle> }
  >) => {
    const setListPropsAtom = useSetAtom(listPropsAtom);
    const [selectionState, setListSelectionState] = useAtom(selectionStateAtom);
    useItemSelectionStateEffect();

    useEffect(() => {
      setListPropsAtom(props);
    }, [props, setListPropsAtom]);

    useEffect(() => {
      onSelectionActiveChange?.(!!selectionState.selectionActive);
    }, [onSelectionActiveChange, selectionState.selectionActive]);

    useImperativeHandle(handleRef, () => {
      return {
        toggleSelectable: () => {
          setListSelectionState(false);
        },
      };
    }, [setListSelectionState]);
    return children;
  }
);

ListInnerWrapper.displayName = 'ListInnerWrapper';
