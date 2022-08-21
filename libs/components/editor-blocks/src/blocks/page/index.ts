import { withRecastBlock } from '@toeverything/components/editor-core';
import {
    Protocol,
    DefaultColumnsValue,
} from '@toeverything/datasource/db-service';
import {
    AsyncBlock,
    BaseView,
    ChildrenView,
    getTextHtml,
    SelectBlock,
} from '@toeverything/framework/virgo';

import { PageView } from './PageView';

export const PageChildrenView: (prop: ChildrenView) => JSX.Element = props =>
    props.children;

export class PageBlock extends BaseView {
    type = Protocol.Block.Type.page;
    View = withRecastBlock(PageView);
    // override ChildrenView = withRecastTable(PageChildrenView);
    public override allowPendant = false;
    override async onCreate(block: AsyncBlock): Promise<AsyncBlock> {
        if (!block.getProperty('text')) {
            await block.setProperty('text', {
                value: [{ text: '' }],
            });
        }
        return block;
    }

    override onExport(content: any): string {
        return this.get_decoration<any>(content, 'text')?.value?.[0].text;
    }

    override async block2html(
        block: AsyncBlock,
        children: SelectBlock[],
        generateHtml: (el: any[]) => Promise<string>
    ): Promise<string> {
        const content = getTextHtml(block);
        const childrenContent = await generateHtml(children);
        return `<h1>${content}</h1> ${childrenContent}`;
    }
}
