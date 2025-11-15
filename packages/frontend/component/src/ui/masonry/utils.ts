import type {
  MasonryGroup,
  MasonryItem,
  MasonryItemXYWH,
  MasonryPX,
} from './type';

export const calcPX = (px: MasonryPX, totalWidth: number) =>
  typeof px === 'number' ? px : px(totalWidth);

export const calcColumns = (
  totalWidth: number,
  itemWidth: number | 'stretch',
  itemWidthMin: number,
  gapX: number,
  _paddingX: MasonryPX,
  columns?: number
) => {
  const paddingX = calcPX(_paddingX, totalWidth);
  const availableWidth = totalWidth - paddingX * 2;

  if (columns) {
    const width = (availableWidth - (columns - 1) * gapX) / columns;
    return { columns, width };
  }

  if (itemWidth === 'stretch') {
    let columns = 1;
    while (columns * itemWidthMin + (columns - 1) * gapX < availableWidth) {
      columns++;
    }
    const finalColumns = columns - 1;
    const finalWidth =
      (availableWidth - (finalColumns - 1) * gapX) / finalColumns;
    return {
      columns: finalColumns,
      width: finalWidth,
    };
  } else {
    let columns = 1;
    while (columns * itemWidth + (columns - 1) * gapX < availableWidth) {
      columns++;
    }
    return {
      columns: columns - 1,
      width: itemWidth,
    };
  }
};

export const calcLayout = (
  groups: MasonryGroup[],
  options: {
    totalWidth: number;
    columns: number;
    width: number;
    gapX: number;
    gapY: number;
    paddingX: MasonryPX;
    paddingY: number;
    groupsGap: number;
    groupHeaderGapWithItems: number;
    collapsedGroups: string[];
  }
) => {
  const {
    totalWidth,
    columns,
    width,
    gapX,
    gapY,
    paddingX: _paddingX,
    paddingY,
    groupsGap,
    groupHeaderGapWithItems,
    collapsedGroups,
  } = options;
  const paddingX = calcPX(_paddingX, totalWidth);

  const layout = new Map<string, MasonryItemXYWH>();
  let finalHeight = paddingY;

  groups.forEach((group, index) => {
    const heightStack = Array.from({ length: columns }, () => 0);
    const ratioStack = Array.from({ length: columns }, () => 0);
    if (index !== 0) {
      finalHeight += groupsGap;
    }

    // calculate group header
    const groupHeaderLayout: MasonryItemXYWH = {
      type: 'group',
      x: 0,
      y: finalHeight,
      w: totalWidth,
      h: group.height,
    };
    layout.set(group.id, groupHeaderLayout);

    if (collapsedGroups.includes(group.id)) {
      finalHeight += groupHeaderLayout.h;
      return;
    }

    finalHeight +=
      groupHeaderLayout.h +
      // if group header is empty, don't add gap
      (groupHeaderLayout.h > 0 ? groupHeaderGapWithItems : 0);
    // calculate group items
    group.items.forEach(item => {
      const itemId = group.id ? `${group.id}:${item.id}` : item.id;
      const ratioMode = 'ratio' in item;
      const height = ratioMode ? item.ratio * width : item.height;

      const aroundGapXValue =
        columns > 1
          ? (totalWidth - paddingX * 2 - width * columns) / (columns - 1)
          : 0;
      const gapXValue = Math.max(gapX, aroundGapXValue);

      if (ratioMode) {
        const minRatio = Math.min(...ratioStack);
        const minRatioIndex = ratioStack.indexOf(minRatio);
        const minHeight = heightStack[minRatioIndex];
        const hasGap = heightStack[minRatioIndex] ? gapY : 0;
        const x = minRatioIndex * (width + gapXValue) + paddingX;
        const y = finalHeight + minHeight + hasGap;

        ratioStack[minRatioIndex] += item.ratio * 10000;
        heightStack[minRatioIndex] += height + hasGap;
        layout.set(itemId, {
          type: 'item',
          x,
          y,
          w: width,
          h: height,
        });
      } else {
        const minHeight = Math.min(...heightStack);
        const minHeightIndex = heightStack.indexOf(minHeight);
        const hasGap = heightStack[minHeightIndex] ? gapY : 0;
        const x = minHeightIndex * (width + gapXValue) + paddingX;
        const y = finalHeight + minHeight + hasGap;

        const ratio = height / width;
        heightStack[minHeightIndex] += height + hasGap;
        ratioStack[minHeightIndex] += ratio * 10000;

        layout.set(itemId, {
          type: 'item',
          x,
          y,
          w: width,
          h: height,
        });
      }
    });

    const groupHeight = Math.max(...heightStack) + paddingY;
    finalHeight += groupHeight;
  });

  return { layout, height: finalHeight };
};

export const calcActive = (options: {
  viewportHeight: number;
  scrollY: number;
  layoutMap: Map<MasonryItem['id'], MasonryItemXYWH>;
  preloadHeight: number;
}) => {
  const { viewportHeight, scrollY, layoutMap, preloadHeight } = options;

  const activeMap = new Map<MasonryItem['id'], boolean>();

  layoutMap.forEach((layout, id) => {
    const { y, h } = layout;

    const isInView =
      y + h + preloadHeight > scrollY &&
      y - preloadHeight < scrollY + viewportHeight;

    if (isInView) {
      activeMap.set(id, true);
    }
  });

  return activeMap;
};

export const calcSticky = (options: {
  scrollY: number;
  layoutMap: Map<MasonryItem['id'], MasonryItemXYWH>;
}) => {
  const { scrollY, layoutMap } = options;
  // find sticky group header
  const entries = Array.from(layoutMap.entries());
  const groupEntries = entries.filter(([_, layout]) => layout.type === 'group');

  const stickyGroupEntry = groupEntries.find(([_, xywh], index) => {
    const next = groupEntries[index + 1];
    return xywh.y <= scrollY && (!next || next[1].y > scrollY);
  });

  return stickyGroupEntry
    ? stickyGroupEntry[0]
    : groupEntries.length > 0
      ? groupEntries[0][0]
      : '';
};
