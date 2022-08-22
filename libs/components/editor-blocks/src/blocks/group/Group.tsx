import { withRecastBlock } from '@toeverything/components/editor-core';
import { Protocol } from '@toeverything/datasource/db-service';
import {
    AsyncBlock,
    BaseView,
    SelectBlock,
} from '@toeverything/framework/virgo';
import { GroupView } from './GroupView';
import {
    Block2HtmlProps,
    commonBlock2HtmlContent,
} from '../../utils/commonBlockClip';

export class Group extends BaseView {
    public override selectable = true;
    public override activatable = false;
    public override allowPendant = false;

    type = Protocol.Block.Type.group;
    View = withRecastBlock(GroupView);

    override async onDeleteChild(block: AsyncBlock): Promise<boolean> {
        if (block.childrenIds.length === 0) {
            await block.remove();
        }
        return true;
    }

    override async onCreate(block: AsyncBlock): Promise<AsyncBlock> {
        return block;
    }
    override async block2html({ editor, selectInfo, block }: Block2HtmlProps) {
        const childrenHtml =
            await editor.clipboard.clipboardUtils.convertBlock2HtmlBySelectInfos(
                block,
                selectInfo?.children
            );
        return `<div>${childrenHtml}<code/>`;
    }
}
