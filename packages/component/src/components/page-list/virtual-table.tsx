import { atom, useAtom, useAtomValue, useSetAtom } from 'jotai';
import React, { type ComponentType, useCallback, useRef } from 'react';
import type {
  ListChildComponentProps,
  ListOnItemsRenderedProps,
  VariableSizeList,
  VariableSizeListProps,
} from 'react-window';
import { VariableSizeList as List } from 'react-window';

import { Table, TableBody } from '../..';

const headerAtom = atom<React.ReactNode>(null);
const footerAtom = atom<React.ReactNode>(null);
const topAtom = atom<number>(0);

const InnerElement = React.forwardRef<
  HTMLDivElement,
  React.HTMLProps<HTMLDivElement>
>(function Inner({ children, ...rest }, ref) {
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
});

type VirtualTableProps<T> = {
  header?: React.ReactNode;
  footer?: React.ReactNode;
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
  const setHeader = useSetAtom(headerAtom);
  const setFooter = useSetAtom(footerAtom);
  setHeader(header);
  setFooter(footer);

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
      innerElementType={InnerElement}
      onItemsRendered={onItemsRendered}
      ref={el => (listRef.current = el)}
    >
      {children}
    </List>
  );
}
