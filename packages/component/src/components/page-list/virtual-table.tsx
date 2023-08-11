import React, { type ComponentType, useContext, useRef, useState } from 'react';
import type {
  ListChildComponentProps,
  VariableSizeList,
  VariableSizeListProps,
} from 'react-window';
import { VariableSizeList as List } from 'react-window';

import { Table, TableBody } from '../..';

const VirtualTableContext = React.createContext<{
  header: React.ReactNode;
  footer: React.ReactNode;
  top: number;
}>({
  header: <></>,
  footer: <></>,
  top: 0,
});

const InnerElement = React.forwardRef<
  HTMLDivElement,
  React.HTMLProps<HTMLDivElement>
>(function Inner({ children, ...rest }, ref) {
  const { header, footer, top } = useContext(VirtualTableContext);

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

export function VirtualTable<T>({
  children,
  header,
  footer,
  ...rest
}: {
  header?: React.ReactNode;
  footer?: React.ReactNode;
  children: ComponentType<ListChildComponentProps<T>>;
} & Omit<VariableSizeListProps<T>, 'children' | 'innerElementType'>) {
  const [top, setTop] = useState(0);
  const listRef = useRef<VariableSizeList | null>();

  return (
    <VirtualTableContext.Provider value={{ header, footer, top }}>
      <List
        {...rest}
        innerElementType={InnerElement}
        onItemsRendered={({
          overscanStartIndex,
          overscanStopIndex,
          visibleStartIndex,
          visibleStopIndex,
        }) => {
          if (!listRef.current) return;
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-ignore
          const { top } = listRef.current._getItemStyle(overscanStartIndex);
          setTop(top);
          rest.onItemsRendered &&
            rest.onItemsRendered({
              overscanStartIndex,
              overscanStopIndex,
              visibleStartIndex,
              visibleStopIndex,
            });
        }}
        ref={el => (listRef.current = el)}
      >
        {children}
      </List>
    </VirtualTableContext.Provider>
  );
}
