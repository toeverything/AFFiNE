import type { Text } from '@blocksuite/store';
import {
  BlockModel,
  BlockSchemaExtension,
  defineBlockSchema,
} from '@blocksuite/store';

export type RootBlockProps = {
  title: Text;
};

export class RootBlockModel extends BlockModel<RootBlockProps> {
  constructor() {
    super();
    const createdSubscription = this.created.subscribe(() => {
      createdSubscription.unsubscribe();
      this.store.slots.rootAdded.subscribe(id => {
        const model = this.store.getModelById(id);
        if (model instanceof RootBlockModel) {
          const newDocMeta = this.store.workspace.meta.getDocMeta(
            model.store.id
          );
          if (
            !newDocMeta ||
            newDocMeta.title !== model.props.title.toString()
          ) {
            this.store.workspace.meta.setDocMeta(model.store.id, {
              title: model.props.title.toString(),
            });
          }
        }
      });
    });
  }

  /**
   * A page is empty if it only contains one empty note and the canvas is empty
   */
  override isEmpty() {
    let numNotes = 0;
    let empty = true;
    for (const child of this.children) {
      empty = empty && child.isEmpty();

      if (child.flavour === 'affine:note') numNotes++;
      if (numNotes > 1) return false;
    }

    return empty;
  }
}

export const RootBlockSchema = defineBlockSchema({
  flavour: 'affine:page',
  props: (internal): RootBlockProps => ({
    title: internal.Text(),
  }),
  metadata: {
    version: 2,
    role: 'root',
  },
  toModel: () => new RootBlockModel(),
});

export const RootBlockSchemaExtension = BlockSchemaExtension(RootBlockSchema);
