import type { OffsetList } from './types';

type CellOffsets = {
  rows: OffsetList;
  columns: OffsetList;
};
export const domToOffsets = (
  element: HTMLElement,
  rowSelector: string,
  cellSelector: string
): CellOffsets | undefined => {
  const rowDoms = Array.from(element.querySelectorAll(rowSelector));
  const firstRowDom = rowDoms[0];
  if (!firstRowDom) return;
  const columnDoms = Array.from(firstRowDom.querySelectorAll(cellSelector));
  const rows: OffsetList = [];
  const columns: OffsetList = [];
  for (let i = 0; i < rowDoms.length; i++) {
    const rect = rowDoms[i].getBoundingClientRect();
    if (!rect) continue;
    if (i === 0) {
      rows.push(rect.top);
    }
    rows.push(rect.bottom);
  }
  for (let i = 0; i < columnDoms.length; i++) {
    const rect = columnDoms[i].getBoundingClientRect();
    if (!rect) continue;
    if (i === 0) {
      columns.push(rect.left);
    }
    columns.push(rect.right);
  }

  return {
    rows,
    columns,
  };
};

export const getIndexByPosition = (
  positions: OffsetList,
  offset: number,
  reverse = false
) => {
  if (reverse) {
    return positions.slice(1).findIndex(p => offset <= p);
  }
  return positions.slice(0, -1).findLastIndex(p => offset >= p);
};

export const getRangeByPositions = (
  positions: OffsetList,
  start: number,
  end: number
) => {
  const startIndex = getIndexByPosition(positions, start, true);
  const endIndex = getIndexByPosition(positions, end);
  return {
    start: startIndex,
    end: endIndex,
  };
};

export const getAreaByOffsets = (
  offsets: CellOffsets,
  top: number,
  bottom: number,
  left: number,
  right: number
) => {
  const { rows, columns } = offsets;
  const startRow = getIndexByPosition(rows, top, true);
  const endRow = getIndexByPosition(rows, bottom);
  const startColumn = getIndexByPosition(columns, left, true);
  const endColumn = getIndexByPosition(columns, right);
  return {
    top: startRow,
    bottom: endRow,
    left: startColumn,
    right: endColumn,
  };
};
