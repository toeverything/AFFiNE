import type { ColumnBlockModel } from '@blocksuite/affine-model';
import { PlusIcon } from '@blocksuite/icons/lit';
import { BlockComponent } from '@blocksuite/std';
import { computed, signal } from '@preact/signals-core';
import { html, nothing } from 'lit';
import { classMap } from 'lit/directives/class-map.js';
import { styleMap } from 'lit/directives/style-map.js';
import { css } from '@emotion/css';

// 样式对象
const styles = {
  columnContainer: css({
    position: 'relative',
    minHeight: '20px',
    padding: '8px',
    border: '1px dashed transparent',
    borderRadius: '4px',
    transition: 'border-color 0.2s ease',
    '&:hover': {
      borderColor: 'var(--affine-border-color)',
    },
    '&.dragging-over': {
      borderColor: 'var(--affine-primary-color)',
      backgroundColor: 'var(--affine-hover-color)',
    },
    '&.empty': {
      minHeight: '60px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: 'var(--affine-text-secondary-color)',
      fontSize: '14px',
    },
  }),
  columnContent: css({
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  }),
  columnPlaceholder: css({
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '8px',
    padding: '20px',
    color: 'var(--affine-text-secondary-color)',
    fontSize: '14px',
    userSelect: 'none',
  }),
  placeholderIcon: css({
    width: '24px',
    height: '24px',
    opacity: 0.6,
  }),
  placeholderText: css({
    fontWeight: 500,
  }),
  placeholderHint: css({
    fontSize: '12px',
    opacity: 0.8,
  }),
};

export class ColumnBlockComponent extends BlockComponent<ColumnBlockModel> {
  private readonly _isDraggingOver = signal(false);

  private readonly _isEmpty = computed(() => {
    return this.model.children.length === 0;
  });

  override connectedCallback() {
    super.connectedCallback();
    this._setupDragAndDrop();
  }

  private _setupDragAndDrop() {
    this.addEventListener('dragover', this._handleDragOver);
    this.addEventListener('dragleave', this._handleDragLeave);
    this.addEventListener('drop', this._handleDrop);
  }

  private readonly _handleDragOver = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    this._isDraggingOver.value = true;
  };

  private readonly _handleDragLeave = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // 只有当离开整个列容器时才重置状态
    if (!this.contains(e.relatedTarget as Node)) {
      this._isDraggingOver.value = false;
    }
  };

  private readonly _handleDrop = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    this._isDraggingOver.value = false;

    const data = e.dataTransfer?.getData('text/plain');
    if (data) {
      try {
        const dragData = JSON.parse(data);
        if (dragData.type === 'block' && dragData.blockId) {
          this._addBlockToColumn(dragData.blockId);
        }
      } catch (error) {
        console.error('Failed to parse drag data:', error);
      }
    }
  };

  private _addBlockToColumn(blockId: string) {
    const targetIndex = this.model.children.length;
    this.std.store.moveBlocks([blockId], this.model, targetIndex);
  }

  private readonly _handleAddBlock = () => {
    const targetIndex = this.model.children.length;
    this.std.store.addBlock('affine:paragraph', {}, this.model, targetIndex);
  };

  private _renderPlaceholder() {
    return html`
      <div class="${styles.columnPlaceholder}">
        <div class="${styles.placeholderIcon}">${PlusIcon()}</div>
        <div class="${styles.placeholderText}">添加内容</div>
        <div class="${styles.placeholderHint}">拖拽 block 到此处或点击添加</div>
      </div>
    `;
  }

  private _renderContent() {
    if (this._isEmpty.value) {
      return this._renderPlaceholder();
    }

    return html`
      <div class="${styles.columnContent}">
        ${this.model.children.map(child => this.renderChildren(child))}
      </div>
    `;
  }

  override render() {
    const containerClasses = classMap({
      [styles.columnContainer]: true,
      'dragging-over': this._isDraggingOver.value,
      empty: this._isEmpty.value,
    });

    const containerStyles = styleMap({
      width: `${this.model.widthPercentage}%`,
    });

    return html`
      <div
        class="${containerClasses}"
        style="${containerStyles}"
        @click="${this._isEmpty.value ? this._handleAddBlock : nothing}"
      >
        ${this._renderContent()}
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'affine-column': ColumnBlockComponent;
  }
}
