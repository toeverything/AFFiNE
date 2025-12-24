import {
  DatabaseBlockDataSource,
  databasePropertyConverts,
} from '@blocksuite/affine-block-database';
import type { ColumnDataType } from '@blocksuite/affine-model';
import {
  insertPositionToIndex,
  type InsertToPosition,
} from '@blocksuite/affine-shared/utils';
import { DataSourceBase, type PropertyMetaConfig } from '@blocksuite/data-view';
import { propertyPresets } from '@blocksuite/data-view/property-presets';
import { BlockSuiteError } from '@blocksuite/global/exceptions';
import type { EditorHost } from '@blocksuite/std';
import type { Block, Store } from '@blocksuite/store';
import { Subject } from 'rxjs';

import type { BlockMeta } from './block-meta/base.js';
import { blockMetaMap } from './block-meta/index.js';
import { queryBlockAllColumnMap, queryBlockColumns } from './columns/index.js';
import type { DataViewBlockModel } from './data-view-model.js';

export type BlockQueryDataSourceConfig = {
  type: keyof typeof blockMetaMap;
};

// @ts-expect-error FIXME: ts error
export class BlockQueryDataSource extends DataSourceBase {
  private readonly columnMetaMap = new Map<
    string,
    PropertyMetaConfig<any, any, any>
  >();

  private readonly meta: BlockMeta;

  blockMap = new Map<string, Block>();

  docDisposeMap = new Map<string, () => void>();

  slots = {
    update: new Subject(),
  };

  private get blocks() {
    return [...this.blockMap.values()];
  }

  get properties(): string[] {
    return [
      ...this.meta.properties.map(v => v.key),
      ...this.block.props.columns.map(v => v.id),
    ];
  }

  get propertyMetas(): PropertyMetaConfig[] {
    return queryBlockColumns as PropertyMetaConfig[];
  }

  get rows(): string[] {
    return this.blocks.map(v => v.id);
  }

  get workspace() {
    return this.host.store.workspace;
  }

  constructor(
    private readonly host: EditorHost,
    private readonly block: DataViewBlockModel,
    config: BlockQueryDataSourceConfig
  ) {
    super();
    this.meta = blockMetaMap[config.type];
    for (const property of this.meta.properties) {
      this.columnMetaMap.set(property.metaConfig.type, property.metaConfig);
    }
    for (const collection of this.workspace.docs.values()) {
      for (const block of Object.values(collection.getStore().blocks.peek())) {
        if (this.meta.selector(block)) {
          this.blockMap.set(block.id, block);
        }
      }
    }
    this.workspace.docs.forEach(doc => {
      this.listenToDoc(doc.getStore());
    });
    this.workspace.slots.docListUpdated.subscribe(() => {
      this.workspace.docs.forEach(doc => {
        if (!this.docDisposeMap.has(doc.id)) {
          this.listenToDoc(doc.getStore());
        }
      });
      this.docDisposeMap.forEach((_, id) => {
        if (!this.workspace.docs.has(id)) {
          this.docDisposeMap.get(id)?.();
          this.docDisposeMap.delete(id);
        }
      });
    });
  }

  private getProperty(propertyId: string) {
    const property = this.meta.properties.find(v => v.key === propertyId);
    if (!property) {
      throw new BlockSuiteError(
        BlockSuiteError.ErrorCode.ValueNotExists,
        `property ${propertyId} not found`
      );
    }
    return property;
  }

  private newColumnName() {
    let i = 1;
    while (
      this.block.props.columns.some(column => column.name === `Column ${i}`)
    ) {
      i++;
    }
    return `Column ${i}`;
  }

  cellValueChange(rowId: string, propertyId: string, value: unknown): void {
    const viewColumn = this.getViewColumn(propertyId);
    if (viewColumn) {
      this.block.props.cells[rowId] = {
        ...this.block.props.cells[rowId],
        [propertyId]: value,
      };
      return;
    }
    const block = this.blockMap.get(rowId);
    if (block) {
      this.meta.properties
        .find(v => v.key === propertyId)
        ?.set?.(block.model, value);
    }
  }

  cellValueGet(rowId: string, propertyId: string): unknown {
    const viewColumn = this.getViewColumn(propertyId);
    if (viewColumn) {
      return this.block.props.cells[rowId]?.[propertyId];
    }
    const block = this.blockMap.get(rowId);
    if (block) {
      return this.getProperty(propertyId)?.get(block.model);
    }
    return;
  }

  getViewColumn(id: string) {
    return this.block.props.columns.find(v => v.id === id);
  }

  listenToDoc(doc: Store) {
    this.docDisposeMap.set(
      doc.id,
      doc.slots.blockUpdated.subscribe(v => {
        if (v.type === 'add') {
          const blockById = doc.getBlock(v.id);
          if (blockById && this.meta.selector(blockById)) {
            this.blockMap.set(v.id, blockById);
          }
        } else if (v.type === 'delete') {
          this.blockMap.delete(v.id);
        }
        this.slots.update.next(undefined);
      }).unsubscribe
    );
  }

  propertyAdd(
    insertToPosition: InsertToPosition,
    ops?: {
      type?: string;
      name?: string;
    }
  ): string {
    const { type } = ops ?? {};
    const doc = this.block.store;
    doc.captureSync();
    const column = DatabaseBlockDataSource.propertiesMap.value[
      type ?? propertyPresets.multiSelectPropertyConfig.type
    ].create(this.newColumnName());

    const id = doc.workspace.idGenerator();
    if (this.block.props.columns.some(v => v.id === id)) {
      return id;
    }
    doc.transact(() => {
      const col: ColumnDataType = {
        ...column,
        id,
      };
      this.block.props.columns.splice(
        insertPositionToIndex(insertToPosition, this.block.props.columns),
        0,
        col
      );
    });
    return id;
  }

  propertyDataGet(propertyId: string): Record<string, unknown> {
    const viewColumn = this.getViewColumn(propertyId);
    if (viewColumn) {
      return viewColumn.data;
    }
    const property = this.getProperty(propertyId);
    return (
      property.getColumnData?.(this.blocks[0].model) ??
      property.metaConfig.config.propertyData.default()
    );
  }

  propertyDataSet(propertyId: string, data: Record<string, unknown>): void {
    const viewColumn = this.getViewColumn(propertyId);
    if (viewColumn) {
      viewColumn.data = data;
    }
  }

  propertyDelete(_id: string): void {
    const index = this.block.props.columns.findIndex(v => v.id === _id);
    if (index >= 0) {
      this.block.props.columns.splice(index, 1);
    }
  }

  propertyDuplicate(_columnId: string): string | undefined {
    throw new Error('Method not implemented.');
  }

  propertyMetaGet(type: string): PropertyMetaConfig {
    const meta = this.columnMetaMap.get(type);
    if (meta) {
      return meta;
    }
    return queryBlockAllColumnMap[type];
  }

  propertyNameGet(propertyId: string): string {
    const viewColumn = this.getViewColumn(propertyId);
    if (viewColumn) {
      return viewColumn.name;
    }
    if (propertyId === 'type') {
      return 'Block Type';
    }
    return this.getProperty(propertyId)?.name ?? '';
  }

  propertyNameSet(propertyId: string, name: string): void {
    const viewColumn = this.getViewColumn(propertyId);
    if (viewColumn) {
      viewColumn.name = name;
    }
  }

  override propertyReadonlyGet(propertyId: string): boolean {
    const viewColumn = this.getViewColumn(propertyId);
    if (viewColumn) {
      return false;
    }
    if (propertyId === 'type') return true;
    return this.getProperty(propertyId)?.set == null;
  }

  propertyTypeGet(propertyId: string): string {
    const viewColumn = this.getViewColumn(propertyId);
    if (viewColumn) {
      return viewColumn.type;
    }
    if (propertyId === 'type') {
      return 'image';
    }
    return this.getProperty(propertyId).metaConfig.type;
  }

  propertyTypeSet(propertyId: string, toType: string): void {
    const viewColumn = this.getViewColumn(propertyId);
    if (viewColumn) {
      const currentType = viewColumn.type;
      const currentData = viewColumn.data;
      const rows = this.rows$.value;
      const currentCells = rows.map(rowId =>
        this.cellValueGet(rowId, propertyId)
      );
      const convertFunction = databasePropertyConverts.find(
        v => v.from === currentType && v.to === toType
      )?.convert;
      const result = convertFunction?.(
        currentData as any,

        currentCells as any
      ) ?? {
        property:
          DatabaseBlockDataSource.propertiesMap.value[
            toType
          ].config.propertyData.default(),
        cells: currentCells.map(() => undefined),
      };
      this.block.store.captureSync();
      viewColumn.type = toType;
      viewColumn.data = result.property;
      currentCells.forEach((value, i) => {
        if (value != null || result.cells[i] != null) {
          this.block.props.cells[rows[i]] = {
            ...this.block.props.cells[rows[i]],
            [propertyId]: result.cells[i],
          };
        }
      });
    }
  }

  rowAdd(_insertPosition: InsertToPosition | number): string {
    throw new Error('Method not implemented.');
  }

  rowDelete(_ids: string[]): void {
    throw new Error('Method not implemented.');
  }

  rowMove(_rowId: string, _position: InsertToPosition): void {}
}
