import type { ColumnDataType } from '@blocksuite/affine-model';
import {
  arrayMove,
  insertPositionToIndex,
  type InsertToPosition,
} from '@blocksuite/affine-shared/utils';
import type { DataViewDataType } from '@blocksuite/data-view';
import {
  BlockModel,
  BlockSchemaExtension,
  defineBlockSchema,
} from '@blocksuite/store';

type Props = {
  title: string;
  views: DataViewDataType[];
  columns: ColumnDataType[];
  cells: Record<string, Record<string, unknown>>;
};

export class DataViewBlockModel extends BlockModel<Props> {
  constructor() {
    super();
  }

  applyViewsUpdate() {
    this.doc.updateBlock(this, {
      views: this.props.views,
    });
  }

  deleteView(id: string) {
    this.doc.captureSync();
    this.doc.transact(() => {
      this.props.views = this.props.views.filter(v => v.id !== id);
    });
  }

  duplicateView(id: string): string {
    const newId = this.doc.workspace.idGenerator();
    this.doc.transact(() => {
      const index = this.props.views.findIndex(v => v.id === id);
      const view = this.props.views[index];
      if (view) {
        this.props.views.splice(
          index + 1,
          0,
          JSON.parse(JSON.stringify({ ...view, id: newId }))
        );
      }
    });
    return newId;
  }

  moveViewTo(id: string, position: InsertToPosition) {
    this.doc.transact(() => {
      this.props.views = arrayMove(
        this.props.views,
        v => v.id === id,
        arr => insertPositionToIndex(position, arr)
      );
    });
    this.applyViewsUpdate();
  }

  updateView(
    id: string,
    update: (data: DataViewDataType) => Partial<DataViewDataType>
  ) {
    this.doc.transact(() => {
      this.props.views = this.props.views.map(v => {
        if (v.id !== id) {
          return v;
        }
        return { ...v, ...(update(v) as DataViewDataType) };
      });
    });
    this.applyViewsUpdate();
  }
}

export const DataViewBlockSchema = defineBlockSchema({
  flavour: 'affine:data-view',
  props: (): Props => ({
    views: [],
    title: '',
    columns: [],
    cells: {},
  }),
  metadata: {
    role: 'hub',
    version: 1,
    parent: ['affine:note'],
    children: ['affine:paragraph', 'affine:list'],
  },
  toModel: () => {
    return new DataViewBlockModel();
  },
});

export const DataViewBlockSchemaExtension =
  BlockSchemaExtension(DataViewBlockSchema);
