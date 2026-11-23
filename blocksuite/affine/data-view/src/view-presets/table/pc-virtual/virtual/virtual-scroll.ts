import {
  computed,
  effect,
  type ReadonlySignal,
  signal,
} from '@preact/signals-core';

import { BatchTaskManager } from './batch-task-manager';
import { VirtualElementWrapper } from './virtual-cell';

export interface Disposable {
  dispose(): void;
}

export class NodeLifeCycle implements Disposable {
  disposables: (() => void)[] = [];
  init() {}
  isDisposed = false;
  dispose() {
    if (this.isDisposed) {
      return;
    }
    this.isDisposed = true;
    this.disposables.forEach(disposable => disposable());
  }
}

export class GridNode<Data> extends NodeLifeCycle {
  private _data?: Data;
  get data(): Data {
    if (!this._data) {
      this._data = this.initData();
    }
    return this._data;
  }
  constructor(private readonly initData: () => Data) {
    super();
  }
}

export class CacheManager<K, V extends Disposable> {
  constructor(readonly keyToString: (key: K) => string) {}
  protected readonly cache = new Map<string, V>();

  getOrCreate(key: K, create: () => V): V {
    const stringKey = this.keyToString(key);
    let value = this.cache.get(stringKey);
    if (!value) {
      value = create();
      this.cache.set(stringKey, value);
    }
    return value;
  }

  has(key: K): boolean {
    return this.cache.has(this.keyToString(key));
  }

  delete(key: K): void {
    const value = this.cache.get(this.keyToString(key));
    if (value) {
      value.dispose();
      this.cache.delete(this.keyToString(key));
    }
  }

  clear(): void {
    for (const value of this.cache.values()) {
      value.dispose();
    }
    this.cache.clear();
  }

  cleanup(activeKeys: Set<string>): void {
    const toDelete: string[] = [];
    for (const key of this.cache.keys()) {
      if (!activeKeys.has(key)) {
        toDelete.push(key);
      }
    }
    for (const key of toDelete) {
      this.cache.get(key)?.dispose();
      this.cache.delete(key);
    }
  }
}

export abstract class VirtualScroll extends NodeLifeCycle {
  readonly container: VirtualScrollContainer;

  constructor(containerOptions: VirtualScrollOptions) {
    super();
    this.container = new VirtualScrollContainer(containerOptions);
  }

  override dispose() {
    super.dispose();
    this.container.dispose();
  }
}

export class GridCell<GroupData, RowData, CellData> extends GridNode<CellData> {
  readonly renderTask;
  readonly element;
  readonly columnIndex$ = computed(() => {
    return this.row.grid.columns$.value.findIndex(
      column => column.id === this.columnId
    );
  });

  private readonly realHeight$ = signal<number>();
  readonly contentHeight$ = computed(() => {
    return this.realHeight$.value;
  });
  private readonly columnPosition$ = computed(() => {
    return this.row.grid.columnPosition$.value[this.columnIndex$.value];
  });
  readonly height$ = computed(
    () => this.grid.fixedRowHeight$.value ?? this.contentHeight$.value
  );
  readonly width$ = computed(() => this.columnPosition$.value?.width);
  readonly left$ = computed(() => this.columnPosition$.value?.left);
  readonly top$ = computed(() => this.row.top$.value);
  readonly right$ = computed(() => {
    return this.columnPosition$.value?.right;
  });
  readonly bottom$ = computed(() => {
    const top = this.top$.value;
    if (top == null) {
      return;
    }
    const height = this.height$.value;
    if (height == null) {
      return;
    }
    return top + height;
  });

  get rowIndex$() {
    return this.row.rowIndex$;
  }

  get grid() {
    return this.row.grid;
  }

  constructor(
    readonly row: GridRow<GroupData, RowData, CellData>,
    readonly columnId: string,
    createElement: (
      cell: GridCell<GroupData, RowData, CellData>,
      wrapper: VirtualElementWrapper
    ) => HTMLElement,
    initCellData: (cell: GridCell<GroupData, RowData, CellData>) => CellData
  ) {
    super(() => initCellData(this));
    this.element = new VirtualElementWrapper();
    this.element.rect = {
      left$: this.left$,
      top$: this.top$,
      width$: this.width$,
      height$: this.row.height$,
    };
    this.element.updateHeight = height => this.updateHeight(height);
    this.element.element = createElement(this, this.element);
    const isInit = computed(() => {
      return this.height$.value != null;
    });
    this.renderTask = this.grid.container.initElement(this.element, isInit);
    const cancel = effect(() => {
      if (isInit.value && !this.isVisible$.peek()) {
        this.renderTask.hide();
        cancel();
      }
    });
    this.disposables.push(cancel);
    this.disposables.push(
      effect(() => {
        this.checkRender();
      })
    );
  }

  isVisible$ = computed(() => {
    const height = this.realHeight$.value;
    if (height == null) {
      return false;
    }
    const offsetTop = this.top$.value;
    if (offsetTop == null) {
      return false;
    }
    const offsetBottom = this.bottom$.value;
    if (offsetBottom == null) {
      return false;
    }
    const offsetLeft = this.left$.value ?? 0;
    const offsetRight = this.right$.value ?? 0;
    const viewport = this.grid.container.viewport$.value;
    const xInView =
      offsetRight >= viewport.left && offsetLeft <= viewport.right;
    const yInView =
      offsetBottom >= viewport.top && offsetTop <= viewport.bottom;
    const isVisible = xInView && yInView;
    return isVisible;
  });

  checkRender() {
    const isVisible = this.isVisible$.value;
    if (isVisible && !this.element.isConnected) {
      this.renderTask.show();
    } else if (!isVisible && this.element.isConnected) {
      this.renderTask.hide();
    }
  }

  updateHeight(height: number) {
    this.realHeight$.value = height;
  }

  override dispose() {
    super.dispose();
    this.renderTask.cancel();
    this.element.remove();
  }
}

export class GridRow<GroupData, RowData, CellData> extends GridNode<RowData> {
  cells$ = computed(() => {
    return this.grid.columns$.value.map(column => {
      return this.grid.getOrCreateCell(this, column.id);
    });
  });

  rowIndex$ = computed(() => {
    return this.group.rows$.value.findIndex(row => row.rowId === this.rowId);
  });

  prevRow$ = computed(() => {
    return this.group.rows$.value[this.rowIndex$.value - 1];
  });

  get grid() {
    return this.group.grid;
  }

  top$: ReadonlySignal<number | undefined> = computed(() => {
    const prevRow = this.prevRow$.value;
    if (!prevRow) {
      return this.group.rowsTop$.value;
    }
    return prevRow.bottom$.value;
  });

  bottom$ = computed(() => {
    const top = this.top$.value;
    if (top == null) {
      return;
    }
    const height = this.height$.value;
    if (height == null) {
      return;
    }
    return top + height;
  });

  height$ = computed(() => {
    const fixedRowHeight = this.grid.fixedRowHeight$.value;
    if (fixedRowHeight != null) {
      return fixedRowHeight;
    }
    const cells = this.cells$.value
      .map(cell => cell.height$.value)
      .filter(v => v != null);
    if (cells.length > 0) {
      return Math.max(...cells);
    }
    return;
  });

  constructor(
    readonly group: GridGroup<GroupData, RowData, CellData>,
    readonly rowId: string,
    initRowData: (row: GridRow<GroupData, RowData, CellData>) => RowData
  ) {
    super(() => initRowData(this));
  }

  override dispose() {
    super.dispose();
  }
}
export class GroupNode<GroupData, RowData, CellData> extends NodeLifeCycle {
  readonly renderTask;
  readonly height$ = signal<number | undefined>();
  readonly bottom$ = computed(() => {
    const top = this.top$.value;
    const height = this.height$.value;
    if (top == null) {
      return;
    }
    if (height == null) {
      return;
    }
    return top + height;
  });
  constructor(
    public readonly group: GridGroup<GroupData, RowData, CellData>,
    public readonly top$: ReadonlySignal<number | undefined>,
    content: (
      group: GridGroup<GroupData, RowData, CellData>,
      wrapper: VirtualElementWrapper
    ) => HTMLElement,
    readonly visibleCheck: (
      node: GroupNode<GroupData, RowData, CellData>
    ) => boolean
  ) {
    super();
    const element = new VirtualElementWrapper();
    element.rect = {
      left$: signal(0),
      top$,
      width$: signal(),
      height$: this.height$,
    };
    element.element = content(this.group, element);
    element.updateHeight = height => {
      this.height$.value = height;
    };
    const isInit = computed(() => {
      return this.height$.value != null;
    });
    this.renderTask = this.container.initElement(element, isInit);
    const cancel = effect(() => {
      if (isInit.value && !this.isVisible$.peek()) {
        this.renderTask.hide();
        cancel();
      }
    });
    this.disposables.push(
      effect(() => {
        this.checkRender();
      })
    );
  }
  get container() {
    return this.group.grid.container;
  }

  isVisible$ = computed(() => {
    return this.visibleCheck(this);
  });

  checkRender() {
    const isVisible = this.isVisible$.value;
    if (isVisible) {
      this.renderTask.show();
    } else {
      this.renderTask.hide();
    }
  }
}

export class GridGroup<
  GroupData,
  RowData,
  CellData,
> extends GridNode<GroupData> {
  top$: ReadonlySignal<number | undefined> = computed(() => {
    const prevGroup = this.prevGroup$.value;
    if (!prevGroup) {
      return 0;
    }
    return prevGroup.bottom$.value;
  });
  topNode = new GroupNode(this, this.top$, this.topElement, node => {
    const height = node.height$.value;
    if (height == null) {
      return false;
    }
    const top = this.top$.value;
    if (top == null) {
      return false;
    }
    const bottom = this.lastRowBottom$.value ?? top + height;
    const groupInView =
      top < this.grid.container.viewport$.value.bottom &&
      bottom > this.grid.container.viewport$.value.top;
    return groupInView;
  });
  lastRowBottom$: ReadonlySignal<number | undefined> = computed(() => {
    if (this.rows$.value.length === 0) {
      return this.rowsTop$.value;
    }
    const lastRow = this.rows$.value.findLast(row => row.bottom$.value != null);
    if (lastRow == null) {
      return;
    }
    return lastRow.bottom$.value;
  });
  bottomNode = new GroupNode(
    this,
    this.lastRowBottom$,
    this.bottomElement,
    node => {
      const height = node.height$.value;
      if (height == null) {
        return false;
      }
      const top = this.lastRowBottom$.value;
      if (top == null) {
        return false;
      }
      const bottom = top + height;
      const groupInView =
        top < this.grid.container.viewport$.value.bottom &&
        bottom > this.grid.container.viewport$.value.top;
      return groupInView;
    }
  );
  rows$ = computed(() => {
    const group = this.grid.options.groups$.value.find(
      g => g.id === this.groupId
    );
    if (!group) {
      return [];
    }
    return group.rows.map(rowId => {
      return this.grid.getOrCreateRow(this, rowId);
    });
  });

  groupIndex$ = computed(() => {
    return this.grid.groups$.value.findIndex(
      group => group.groupId === this.groupId
    );
  });

  prevGroup$ = computed(() => {
    return this.grid.groups$.value[this.groupIndex$.value - 1];
  });

  get rowsTop$() {
    return this.topNode.bottom$;
  }

  get bottomNodeTop$() {
    return this.lastRowBottom$;
  }

  height$ = computed(() => {
    const bottom = this.bottom$.value;
    if (bottom == null) {
      return;
    }
    const top = this.top$.value;
    if (top == null) {
      return;
    }
    return bottom - top;
  });

  bottom$ = computed(() => {
    return this.bottomNode.bottom$.value;
  });

  constructor(
    readonly grid: GridVirtualScroll<GroupData, RowData, CellData>,
    readonly groupId: string,
    readonly topElement: (
      group: GridGroup<GroupData, RowData, CellData>,
      wrapper: VirtualElementWrapper
    ) => HTMLElement,
    readonly bottomElement: (
      group: GridGroup<GroupData, RowData, CellData>,
      wrapper: VirtualElementWrapper
    ) => HTMLElement,
    initGroupData: (group: GridGroup<GroupData, RowData, CellData>) => GroupData
  ) {
    super(() => initGroupData(this));
  }

  override dispose() {
    super.dispose();
  }
}

export interface GridGroupData {
  id: string;
  rows: string[];
}

export interface GridVirtualScrollOptions<
  GroupData,
  RowData,
  CellData,
> extends VirtualScrollOptions {
  initGroupData: (group: GridGroup<GroupData, RowData, CellData>) => GroupData;
  initRowData: (row: GridRow<GroupData, RowData, CellData>) => RowData;
  initCellData: (cell: GridCell<GroupData, RowData, CellData>) => CellData;
  columns$: ReadonlySignal<
    {
      id: string;
      width: number;
    }[]
  >;
  fixedRowHeight$: ReadonlySignal<number | undefined>;
  createGroup: {
    top: (
      group: GridGroup<GroupData, RowData, CellData>,
      wrapper: VirtualElementWrapper
    ) => HTMLElement;
    bottom: (
      group: GridGroup<GroupData, RowData, CellData>,
      wrapper: VirtualElementWrapper
    ) => HTMLElement;
  };
  createCell: (
    cell: GridCell<GroupData, RowData, CellData>,
    wrapper: VirtualElementWrapper
  ) => HTMLElement;
  groups$: ReadonlySignal<GridGroupData[]>;
}

export class GridVirtualScroll<
  GroupData,
  RowData,
  CellData,
> extends VirtualScroll {
  readonly cellsCache = new CacheManager<
    { groupId: string; columnId: string; rowId: string },
    GridCell<GroupData, RowData, CellData>
  >(cell => `${cell.groupId}-${cell.rowId}-${cell.columnId}`);
  readonly rowsCache = new CacheManager<
    { groupId: string; rowId: string },
    GridRow<GroupData, RowData, CellData>
  >(row => `${row.groupId}-${row.rowId}`);
  readonly groupsCache = new CacheManager<
    string,
    GridGroup<GroupData, RowData, CellData>
  >(groupId => groupId);

  readonly groups$ = computed(() => {
    return this.options.groups$.value.map(group => {
      return this.getOrCreateGroup(group.id);
    });
  });

  constructor(
    readonly options: GridVirtualScrollOptions<GroupData, RowData, CellData>
  ) {
    super(options);
  }

  getOrCreateRow(
    group: GridGroup<GroupData, RowData, CellData>,
    rowId: string
  ): GridRow<GroupData, RowData, CellData> {
    return this.rowsCache.getOrCreate({ groupId: group.groupId, rowId }, () => {
      return new GridRow(group, rowId, this.options.initRowData);
    });
  }

  getGroup(groupId: string) {
    return this.getOrCreateGroup(groupId);
  }

  getRow(groupId: string, rowId: string) {
    const group = this.getOrCreateGroup(groupId);
    return this.getOrCreateRow(group, rowId);
  }

  getCell(groupId: string, rowId: string, columnId: string) {
    const row = this.getRow(groupId, rowId);
    return this.getOrCreateCell(row, columnId);
  }

  getOrCreateCell(
    row: GridRow<GroupData, RowData, CellData>,
    columnId: string
  ): GridCell<GroupData, RowData, CellData> {
    return this.cellsCache.getOrCreate(
      { groupId: row.group.groupId, rowId: row.rowId, columnId },
      () => {
        return new GridCell(
          row,
          columnId,
          this.options.createCell,
          this.options.initCellData
        );
      }
    );
  }

  getOrCreateGroup(groupId: string): GridGroup<GroupData, RowData, CellData> {
    return this.groupsCache.getOrCreate(groupId, () => {
      return new GridGroup(
        this,
        groupId,
        this.options.createGroup.top,
        this.options.createGroup.bottom,
        this.options.initGroupData
      );
    });
  }

  private listenDataChange() {
    this.disposables.push(
      effect(() => {
        const activeGroupIds = new Set<string>();
        const activeRowIds = new Set<string>();
        const activeCellIds = new Set<string>();

        for (const group of this.groups$.value) {
          activeGroupIds.add(group.groupId);
          for (const row of group.rows$.value) {
            const rowKey = this.rowsCache.keyToString({
              groupId: group.groupId,
              rowId: row.rowId,
            });
            activeRowIds.add(rowKey);
            for (const cell of row.cells$.value) {
              const cellKey = this.cellsCache.keyToString({
                groupId: group.groupId,
                rowId: row.rowId,
                columnId: cell.columnId,
              });
              activeCellIds.add(cellKey);
            }
          }
        }

        this.cellsCache.cleanup(activeCellIds);
        this.rowsCache.cleanup(activeRowIds);
        this.groupsCache.cleanup(activeGroupIds);
      })
    );
  }

  lastGroupBottom$ = computed(() => {
    const lastGroup = this.groups$.value.findLast(
      group => group.bottom$.value != null
    );
    if (lastGroup == null) {
      return;
    }
    return lastGroup.bottom$.value;
  });

  override dispose() {
    super.dispose();
    this.cellsCache.clear();
    this.rowsCache.clear();
    this.groupsCache.clear();
  }

  get columns$() {
    return this.options.columns$;
  }

  get fixedRowHeight$() {
    return this.options.fixedRowHeight$;
  }

  columnPosition$ = computed(() => {
    const columns = this.options.columns$.value;
    const positions: { left: number; right: number; width: number }[] = [];
    let left = 0;
    for (const column of columns) {
      positions.push({
        left,
        right: left + column.width,
        width: column.width,
      });
      left += column.width ?? 0;
    }
    return positions;
  });

  totalWidth$ = computed(() => {
    const lastPosition =
      this.columnPosition$.value[this.columnPosition$.value.length - 1];
    if (lastPosition == null) {
      return 0;
    }
    return lastPosition.right;
  });

  get content() {
    return this.container.content;
  }

  override init() {
    super.init();
    this.container.init();
    this.listenSizeChange();
    this.listenDataChange();
  }

  private listenSizeChange() {
    this.disposables.push(
      effect(() => {
        const width = this.totalWidth$.value ?? 0;
        const height = this.lastGroupBottom$.value ?? 0;
        this.container.updateContentSize(width, height);
      })
    );
  }
}

export interface VirtualScrollOptions {
  xScrollContainer?: HTMLElement;
  yScrollContainer?: HTMLElement;
}

export const getScrollContainer = (
  element: HTMLElement,
  direction: 'x' | 'y'
) => {
  let current: HTMLElement | null = element;
  while (current) {
    const overflow = current
      .computedStyleMap()
      .get(`overflow-${direction}`)
      ?.toString();
    if (overflow === 'auto' || overflow === 'scroll') {
      return current;
    }
    current = current.parentElement;
  }
  return;
};

export class VirtualScrollContainer {
  private readonly options: VirtualScrollOptions;
  private xScrollContainer?: HTMLElement;
  private readonly xScrollContainerWidth$ = signal(0);
  private yScrollContainer?: HTMLElement;
  private readonly yScrollContainerHeight$ = signal(0);
  readonly content: HTMLElement = document.createElement('div');
  readonly scrollTop$ = signal(0);
  readonly scrollLeft$ = signal(0);
  private readonly disposables: (() => void)[] = [];
  private readonly preloadSize = signal({
    left: 100,
    right: 100,
    top: 100,
    bottom: 100,
  });
  private readonly offsetTop$ = signal(0);
  private readonly offsetLeft$ = signal(0);
  readonly viewport$ = computed(() => {
    const preloadSize = this.preloadSize.value;
    const offsetTop = this.offsetTop$.value;
    const offsetLeft = this.offsetLeft$.value;
    const scrollTop = this.scrollTop$.value;
    const scrollLeft = this.scrollLeft$.value;
    const xScrollContainerWidth = this.xScrollContainerWidth$.value;
    const yScrollContainerHeight = this.yScrollContainerHeight$.value;
    const top = scrollTop - offsetTop - preloadSize.top;
    const height =
      yScrollContainerHeight + preloadSize.top + preloadSize.bottom;
    const bottom = top + height;
    const left = scrollLeft - offsetLeft - preloadSize.left;
    const width = xScrollContainerWidth + preloadSize.left + preloadSize.right;
    const right = left + width;
    return {
      width,
      height,
      top,
      bottom,
      left,
      right,
    };
  });

  constructor(options: VirtualScrollOptions) {
    this.options = {
      ...options,
    };
  }

  init() {
    this.content.style.position = 'relative';
    this.content.style.overflow = 'hidden';
    this.xScrollContainer =
      this.options.xScrollContainer ??
      getScrollContainer(this.content, 'x') ??
      document.body;
    this.yScrollContainer =
      this.options.yScrollContainer ??
      getScrollContainer(this.content, 'y') ??
      document.body;
    this.listenScroll();
    this.listenResize();
    this.updateOffset();
  }

  private getOffset(
    container: HTMLElement,
    content: HTMLElement,
    direction: 'Top' | 'Left'
  ) {
    let current: HTMLElement | null = content;
    let offset = 0;
    while (current) {
      offset += current[`offset${direction}`];
      current =
        current.offsetParent instanceof HTMLElement
          ? current.offsetParent
          : null;
      if (current === container) {
        return offset;
      }
    }
    return;
  }
  private updateOffsetTask?: ReturnType<typeof setTimeout>;
  private updateOffset() {
    if (this.updateOffsetTask) {
      clearTimeout(this.updateOffsetTask);
      this.updateOffsetTask = undefined;
    }
    if (this.yScrollContainer) {
      this.offsetTop$.value =
        this.getOffset(this.yScrollContainer, this.content, 'Top') ?? 0;
    }
    if (this.xScrollContainer) {
      this.offsetLeft$.value =
        this.getOffset(this.xScrollContainer, this.content, 'Left') ?? 0;
    }
    this.updateOffsetTask = setTimeout(() => {
      this.updateOffsetTask = undefined;
      this.updateOffset();
    }, 1000);
  }

  private listenScroll() {
    const handlerX = () => {
      this.scrollLeft$.value = this.xScrollContainer?.scrollLeft ?? 0;
    };
    const handlerY = () => {
      this.scrollTop$.value = this.yScrollContainer?.scrollTop ?? 0;
    };
    this.yScrollContainer?.addEventListener('scroll', handlerY);
    this.xScrollContainer?.addEventListener('scroll', handlerX);
    this.disposables.push(() => {
      this.yScrollContainer?.removeEventListener('scroll', handlerY);
      this.xScrollContainer?.removeEventListener('scroll', handlerX);
    });
  }

  private listenResize() {
    if (this.xScrollContainer) {
      const handlerX = () => {
        this.xScrollContainerWidth$.value =
          this.xScrollContainer?.clientWidth ?? 0;
      };
      const resizeObserver = new ResizeObserver(handlerX);
      resizeObserver.observe(this.xScrollContainer);
      this.disposables.push(() => {
        resizeObserver.disconnect();
      });
    }
    if (this.yScrollContainer) {
      const handlerY = () => {
        this.yScrollContainerHeight$.value =
          this.yScrollContainer?.clientHeight ?? 0;
      };
      const resizeObserver = new ResizeObserver(handlerY);
      resizeObserver.observe(this.yScrollContainer);
      this.disposables.push(() => {
        resizeObserver.disconnect();
      });
    }
  }
  readonly batchTaskManager = new BatchTaskManager([5, 50], 50);

  initElement(element: HTMLElement, isInit: ReadonlySignal<boolean>) {
    const initTask = this.batchTaskManager.newTask();
    initTask.updateTask(
      0,
      () => {
        if (element.isConnected || isInit.value) {
          return false;
        }
        this.content.append(element);
        return;
      },
      true
    );
    const task = this.batchTaskManager.newTask();
    return {
      cancel: () => {
        initTask.cancel();
        task.cancel();
      },
      show: () => {
        task.updateTask(1, () => {
          if (element.isConnected) {
            return false;
          }
          this.content.append(element);
          return;
        });
      },
      hide: () => {
        task.updateTask(1, () => {
          if (!element.isConnected) {
            return false;
          }
          element.remove();
          return;
        });
      },
    };
  }

  dispose() {
    this.batchTaskManager.clean();
    this.disposables.forEach(disposable => disposable());
  }

  public updateContentSize(width: number, height: number) {
    this.content.style.width = `${width}px`;
    this.content.style.height = `${height}px`;
  }

  public scrollToPosition(
    x: number,
    y: number,
    behavior: ScrollBehavior = 'auto'
  ) {
    this.xScrollContainer?.scrollTo({
      left: x,
      behavior,
    });
    this.yScrollContainer?.scrollTo({
      top: y,
      behavior,
    });
  }
}

export interface ListVirtualScrollOptions extends VirtualScrollOptions {
  itemCount: number;
  itemHeight: number | ((index: number) => number);
}

export class ListVirtualScroll extends VirtualScroll {
  protected itemCount: number;
  protected itemHeight: number | ((index: number) => number);

  constructor(options: ListVirtualScrollOptions) {
    super(options);
    this.itemCount = options.itemCount;
    this.itemHeight = options.itemHeight;
    this.updateTotalSize();
  }

  private updateTotalSize() {}
}
