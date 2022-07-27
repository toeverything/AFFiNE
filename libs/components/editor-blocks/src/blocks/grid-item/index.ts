import { GridItem, GRID_ITEM_CLASS_NAME } from './GridItem';

import { Protocol } from '@toeverything/datasource/db-service';
import { AsyncBlock, BaseView } from '@toeverything/framework/virgo';
import { GridItemRender } from './GridItemRender';

export class GridItemBlock extends BaseView {
    public override selectable = false;
    public override activatable = false;
    public override allowPendant = false;
    public override layoutOnly = true;

    type = Protocol.Block.Type.grid;
    View = GridItemRender(GridItem);

    override async onCreate(block: AsyncBlock): Promise<AsyncBlock> {
        return block;
    }

    override async onDeleteChild(block: AsyncBlock): Promise<boolean> {
        if (block.childrenIds.length === 0) {
            await block.remove();
        }
        return true;
    }
}
