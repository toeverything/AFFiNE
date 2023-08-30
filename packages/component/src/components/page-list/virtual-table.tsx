import { atom, useAtom, useAtomValue, useSetAtom } from 'jotai';
import {
  type ComponentType,
  forwardRef,
  type HTMLProps,
  type ReactNode,
  useCallback,
  useRef,
} from 'react';
import type {
  ListChildComponentProps,
  ListOnItemsRenderedProps,
  VariableSizeList,
  VariableSizeListProps,
} from 'react-window';
import { VariableSizeList as List } from 'react-window';

import { Table, TableBody } from '../..';

const headerAtom = atom<ReactNode>(null);
const footerAtom = atom<ReactNode>(null);
const topAtom = atom<number>(0);

const Inner = forwardRef<HTMLDivElement, HTMLProps<HTMLDivElement>>(
  function Inner({ children, ...rest }, ref) {
    const [header] = useAtom(headerAtom);
    const [footer] = useAtom(footerAtom);
    const top = useAtomValue(topAtom);

    return (
      <div {...rest} ref={ref}>
        <Table>
          {header}
          <TableBody
            style={{
              top,
              position: 'absolute',
              display: 'table',
              width: '100%',
            }}
          >
            {children}
          </TableBody>
          {footer}
        </Table>
      </div>
    );
  }
);

Inner.displayName = 'Inner';

type VirtualTableProps<T> = {
  header?: ReactNode;
  footer?: ReactNode;
  children: ComponentType<ListChildComponentProps<T>>;
} & Omit<VariableSizeListProps<T>, 'children' | 'innerElementType'>;

export function VirtualTable<T>({
  children,
  header,
  footer,
  ...rest
}: VirtualTableProps<T>) {
  const listRef = useRef<VariableSizeList | null>();
  const setTop = useSetAtom(topAtom);
  const [_header, setHeader] = useAtom(headerAtom);
  const [_footer, setFooter] = useAtom(footerAtom);
  if (header !== _header) setHeader(header);
  if (footer !== _footer) setFooter(footer);

  const onItemsRendered = useCallback(
    ({
      overscanStartIndex,
      overscanStopIndex,
      visibleStartIndex,
      visibleStopIndex,
    }: ListOnItemsRenderedProps) => {
      if (!listRef.current) return;

      const getItemStyle = (
        listRef.current as unknown as {
          _getItemStyle: (index: number) => { top: number };
        }
      )._getItemStyle;

      const { top } = getItemStyle(overscanStartIndex);
      setTop(top);
      if (rest.onItemsRendered)
        rest.onItemsRendered({
          overscanStartIndex,
          overscanStopIndex,
          visibleStartIndex,
          visibleStopIndex,
        });
    },
    [rest, setTop]
  );

  return (
    <List
      {...rest}
      innerElementType={Inner}
      onItemsRendered={onItemsRendered}
      ref={useCallback(
        (el: VariableSizeList | null) => (listRef.current = el),
        []
      )}
    >
      {children}
    </List>
  );
}
