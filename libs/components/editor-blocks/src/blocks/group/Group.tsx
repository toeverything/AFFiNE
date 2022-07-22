import { withRecastTable } from '@toeverything/components/editor-core';
import { Protocol } from '@toeverything/datasource/db-service';
import {
    AsyncBlock,
    BaseView,
    SelectBlock,
} from '@toeverything/framework/virgo';
import { GroupView } from './GroupView';

export class Group extends BaseView {
    public override selectable = true;
    public override activatable = false;
    public override allowPendant = false;

    type = Protocol.Block.Type.group;
    View = withRecastTable(GroupView);

    override async onDeleteChild(block: AsyncBlock): Promise<boolean> {
        if (block.childrenIds.length === 0) {
            await block.remove();
        }
        return true;
    }

    override async onCreate(block: AsyncBlock): Promise<AsyncBlock> {
        return block;
    }

    override async block2html(
        block: AsyncBlock,
        children: SelectBlock[],
        generateHtml: (el: any[]) => Promise<string>
    ): Promise<string> {
        const content = await generateHtml(children);
        return `<div>${content}<div>`;
    }
}
