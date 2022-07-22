import { Grid } from './Grid';
import { Protocol } from '@toeverything/datasource/db-service';
import { AsyncBlock, BaseView } from '@toeverything/framework/virgo';
import { GridItem } from '../grid-item/GridItem';
import { GridRender } from './GridRender';
export { GRID_ITEM_MIN_WIDTH, GRID_PROPERTY_KEY, removePercent } from './Grid';

export class GridBlock extends BaseView {
    public override selectable = false;
    public override activatable = false;
    public override allowPendant = false;

    type = Protocol.Block.Type.grid;
    View = GridRender(Grid);

    override ChildrenView = GridItem;

    override async onCreate(block: AsyncBlock): Promise<AsyncBlock> {
        return block;
    }

    override async onDeleteChild(block: AsyncBlock): Promise<boolean> {
        if (block.childrenIds.length === 1) {
            // the children of grid will always be a grid item
            const firstChildren = await block.childAt(0);
            const itemChildren = await firstChildren.children();
            const beforeBlock = await block.previousSibling();
            if (beforeBlock) {
                await beforeBlock.after(...itemChildren);
            } else {
                const parent = await block.parent();
                if (parent) {
                    await parent.prepend(...itemChildren);
                }
            }
            return block.remove();
        }
        return true;
    }
}
