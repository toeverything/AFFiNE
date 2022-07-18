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
    getTextProperties,
    SelectBlock,
} from '@toeverything/framework/virgo';

import { PageView } from './PageView';
import { ComponentType, FC } from 'react';

export const PageChildrenView: FC<ChildrenView> = props => props.children;

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

    override getSelProperties(
        block: AsyncBlock,
        selectInfo: any
    ): DefaultColumnsValue {
        const properties = super.getSelProperties(block, selectInfo);
        return getTextProperties(properties, selectInfo);
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
