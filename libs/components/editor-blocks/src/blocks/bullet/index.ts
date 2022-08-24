import {
    AsyncBlock,
    BaseView,
    BlockEditor,
    HTML2BlockResult,
} from '@toeverything/framework/virgo';
import { Protocol } from '@toeverything/datasource/db-service';
import { defaultBulletProps, BulletView } from './BulletView';
import {
    Block2HtmlProps,
    commonBlock2HtmlContent,
    commonHTML2block,
} from '../../utils/commonBlockClip';
export class BulletBlock extends BaseView {
    public type = Protocol.Block.Type.bullet;

    View = BulletView;

    // override ChildrenView = IndentWrapper;

    override async onCreate(block: AsyncBlock) {
        if (!block.getProperty('text')) {
            await block.setProperties(defaultBulletProps);
        }
        return block;
    }
    override async html2block2({
        element,
        editor,
    }: {
        element: Element;
        editor: BlockEditor;
    }): Promise<HTML2BlockResult> {
        if (element.tagName === 'UL') {
            const firstList = element.querySelector('li');

            if (!firstList || firstList.innerText.startsWith('[ ]  ')) {
                return null;
            }
            const children = Array.from(element.children);
            const childrenBlockInfos = (
                await Promise.all(
                    children.map(childElement =>
                        this.html2block2({
                            editor,
                            element: childElement,
                        })
                    )
                )
            )
                .flat()
                .filter(v => v);
            return childrenBlockInfos.length ? childrenBlockInfos : null;
        }

        return commonHTML2block({
            element,
            editor,
            type: this.type,
            tagName: 'LI',
        });
    }

    override async block2html(props: Block2HtmlProps) {
        return `<ul><li>${await commonBlock2HtmlContent(props)}</li></ul>`;
    }
}
