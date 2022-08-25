import { withRecastBlock } from '@toeverything/components/editor-core';
import { Protocol } from '@toeverything/datasource/db-service';
import { AsyncBlock, BaseView } from '@toeverything/framework/virgo';

import { PageView } from './PageView';
import { Block2HtmlProps } from '../../utils/commonBlockClip';

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

    override async block2html({ block, editor, selectInfo }: Block2HtmlProps) {
        const header =
            await editor.clipboard.clipboardUtils.convertTextValue2HtmlBySelectInfo(
                block,
                selectInfo
            );
        const childrenHtml =
            await editor.clipboard.clipboardUtils.convertBlock2HtmlBySelectInfos(
                block,
                selectInfo?.children
            );
        return `<h1>${header}</h1>${childrenHtml}`;
    }
}
