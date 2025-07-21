import type {
  ColumnBlockModel,
  MultiColumnContainerBlockModel,
} from '@blocksuite/affine-model';
import { PlusIcon } from '@blocksuite/icons/lit';
import { BlockComponent } from '@blocksuite/std';
import { css } from '@emotion/css';
import { computed, signal } from '@preact/signals-core';
import { html, nothing } from 'lit';
import { classMap } from 'lit/directives/class-map.js';

// 样式对象
const styles = {
  multiColumnContainer: css({
    position: 'relative',
    display: 'flex',
    width: '100%',
    minHeight: '60px',
    border: '1px dashed transparent',
    borderRadius: '8px',
    transition: 'border-color 0.2s ease',
    '&.dragging': {
      borderColor: 'var(--affine-primary-color)',
    },
    '&.empty': {
      minHeight: '120px',
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'column',
      color: 'var(--affine-text-secondary-color)',
    },
  }),
  containerToolbar: css({
    position: 'absolute',
    top: '-32px',
    right: '0',
    display: 'flex',
    gap: '4px',
    opacity: 0,
    transition: 'opacity 0.2s ease',
    zIndex: 10,
  }),
  toolbarButton: css({
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '24px',
    height: '24px',
    border: '1px solid var(--affine-border-color)',
    borderRadius: '4px',
    background: 'var(--affine-background-primary-color)',
    color: 'var(--affine-text-primary-color)',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    '&:hover': {
      background: 'var(--affine-hover-color)',
      borderColor: 'var(--affine-primary-color)',
    },
    '& svg': {
      width: '16px',
      height: '16px',
    },
  }),
  columnsContainer: css({
    display: 'flex',
    width: '100%',
    minWidth: 0,
  }),
  resizeHandle: css({
    position: 'absolute',
    top: '0',
    bottom: '0',
    width: '4px',
    cursor: 'col-resize',
    zIndex: 5,
    '&:hover .resize-line': {
      opacity: 1,
    },
  }),
  resizeLine: css({
    position: 'absolute',
    top: '0',
    bottom: '0',
    left: '50%',
    width: '2px',
    background: 'var(--affine-primary-color)',
    opacity: 0,
    transition: 'opacity 0.2s ease',
    transform: 'translateX(-50%)',
  }),
  widthIndicator: css({
    position: 'absolute',
    top: '-20px',
    left: '50%',
    transform: 'translateX(-50%)',
    padding: '2px 6px',
    background: 'var(--affine-background-primary-color)',
    border: '1px solid var(--affine-border-color)',
    borderRadius: '4px',
    fontSize: '12px',
    color: 'var(--affine-text-secondary-color)',
    whiteSpace: 'nowrap',
    zIndex: 10,
  }),
  emptyPlaceholder: css({
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '12px',
    padding: '40px 20px',
    color: 'var(--affine-text-secondary-color)',
    fontSize: '14px',
    userSelect: 'none',
  }),
  placeholderIcon: css({
    width: '32px',
    height: '32px',
    opacity: 0.6,
  }),
  placeholderText: css({
    fontWeight: 500,
    fontSize: '16px',
  }),
  placeholderHint: css({
    fontSize: '12px',
    opacity: 0.8,
    textAlign: 'center',
  }),
  addColumnButton: css({
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: '120px',
    height: '60px',
    border: '2px dashed var(--affine-border-color)',
    borderRadius: '8px',
    background: 'transparent',
    color: 'var(--affine-text-secondary-color)',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    flexShrink: 0,
    '&:hover': {
      borderColor: 'var(--affine-primary-color)',
      color: 'var(--affine-primary-color)',
      background: 'var(--affine-hover-color)',
    },
    '& svg': {
      width: '20px',
      height: '20px',
    },
  }),
};

export class MultiColumnContainerBlockComponent extends BlockComponent<MultiColumnContainerBlockModel> {
  private readonly _isDragging = signal(false);
  private readonly _isResizing = signal(false);
  private readonly _resizingColumnIndex = signal(-1);
  private readonly _showWidthIndicator = signal(false);
  private readonly _indicatorWidth = signal('');

  private readonly _columns = computed(() => {
    return this.model.columns;
  });

  private readonly _isEmpty = computed(() => {
    return this._columns.value.length === 0;
  });

  override connectedCallback() {
    super.connectedCallback();
    this._setupEventListeners();
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    this._cleanupEventListeners();
  }

  private _setupEventListeners() {
    document.addEventListener('mousemove', this._handleMouseMove);
    document.addEventListener('mouseup', this._handleMouseUp);
  }

  private _cleanupEventListeners() {
    document.removeEventListener('mousemove', this._handleMouseMove);
    document.removeEventListener('mouseup', this._handleMouseUp);
  }

  private readonly _handleMouseMove = (e: MouseEvent) => {
    if (!this._isResizing.value) return;

    const containerRect = this.getBoundingClientRect();
    const relativeX = e.clientX - containerRect.left;
    const containerWidth = containerRect.width;
    const newWidth = (relativeX / containerWidth) * 100;

    // 限制宽度范围（这里的宽度是权重，不是实际百分比）
    const clampedWidth = Math.max(10, Math.min(90, newWidth));
    this._indicatorWidth.value = `${Math.round(clampedWidth)}%`;
  };

  private readonly _handleMouseUp = () => {
    if (!this._isResizing.value) return;

    const columnIndex = this._resizingColumnIndex.value;
    const columns = this._columns.value;

    if (columnIndex >= 0 && columnIndex < columns.length - 1) {
      const newWeight = parseFloat(this._indicatorWidth.value);
      const currentColumn = columns[columnIndex];
      const nextColumn = columns[columnIndex + 1];

      // 保持两列的权重总和不变，重新分配权重
      const totalWeight =
        currentColumn.widthPercentage + nextColumn.widthPercentage;
      const nextWeight = totalWeight - newWeight;

      // 确保权重不为负数
      if (nextWeight > 0) {
        this.model.resizeColumns([
          { columnId: currentColumn.id, width: newWeight },
          { columnId: nextColumn.id, width: nextWeight },
        ]);
      }
    }

    this._isResizing.value = false;
    this._resizingColumnIndex.value = -1;
    this._showWidthIndicator.value = false;
  };

  private readonly _handleResizeStart = (
    e: MouseEvent,
    columnIndex: number
  ) => {
    e.preventDefault();
    e.stopPropagation();

    this._isResizing.value = true;
    this._resizingColumnIndex.value = columnIndex;
    this._showWidthIndicator.value = true;

    const column = this._columns.value[columnIndex];
    // 显示当前列的实际宽度而不是权重
    const actualWidth = this._calculateActualWidth(column);
    this._indicatorWidth.value = `${Math.round(actualWidth)}%`;
  };

  // 移除操作按钮相关的处理函数

  // 移除工具栏渲染

  private _renderResizeHandle(columnIndex: number) {
    const columns = this._columns.value;
    if (columnIndex >= columns.length - 1) return nothing;

    const showIndicator =
      this._showWidthIndicator.value &&
      this._resizingColumnIndex.value === columnIndex;

    return html`
      <div
        class="${styles.resizeHandle}"
        @mousedown="${(e: MouseEvent) =>
          this._handleResizeStart(e, columnIndex)}"
        style="right: -8px;"
      >
        <div class="${styles.resizeLine} resize-line"></div>
        ${showIndicator
          ? html`
              <div class="${styles.widthIndicator}">
                ${this._indicatorWidth.value}
              </div>
            `
          : nothing}
      </div>
    `;
  }

  private _renderColumn(column: ColumnBlockModel, index: number) {
    // 计算权重分配后的实际宽度
    const actualWidth = this._calculateActualWidth(column);

    return html`
      <div
        style="flex: 0 0 ${actualWidth}%; max-width: 100%; word-wrap: break-word; overflow-wrap: break-word;"
      >
        <div style="width: 100%;">${this.renderChildren(column)}</div>
        ${this._renderResizeHandle(index)}
      </div>
    `;
  }

  /**
   * 计算列的实际宽度（基于权重分配）
   */
  private _calculateActualWidth(column: ColumnBlockModel): number {
    const columns = this._columns.value;
    if (columns.length === 0) return 100;

    // 计算所有列的权重总和
    const totalWeight = columns.reduce(
      (sum, col) => sum + col.widthPercentage,
      0
    );

    if (totalWeight === 0) {
      // 如果总权重为0，平均分配
      return 100 / columns.length;
    }

    // 根据权重比例计算实际宽度
    return (column.widthPercentage / totalWeight) * 100;
  }

  private _renderColumns() {
    const columns = this._columns.value;

    return html`
      <div class="${styles.columnsContainer}">
        ${columns.map((column, index) => this._renderColumn(column, index))}
      </div>
    `;
  }

  private _renderEmptyState() {
    return html` <div class="${styles.emptyPlaceholder}"></div> `;
  }

  override render() {
    const containerClasses = classMap({
      [styles.multiColumnContainer]: true,
      dragging: this._isDragging.value,
      empty: this._isEmpty.value,
    });

    return html`
      <div class="${containerClasses}">
        ${this._isEmpty.value
          ? this._renderEmptyState()
          : this._renderColumns()}
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'affine-multi-column-container': MultiColumnContainerBlockComponent;
  }
}
