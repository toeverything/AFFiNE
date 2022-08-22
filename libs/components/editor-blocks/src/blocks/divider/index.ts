import {
    AsyncBlock,
    BaseView,
    SelectBlock,
} from '@toeverything/framework/virgo';
import { Protocol } from '@toeverything/datasource/db-service';
import { DividerView } from './divider-view';
import { Block2HtmlProps } from '../../utils/commonBlockClip';

export class DividerBlock extends BaseView {
    type = Protocol.Block.Type.divider;
    View = DividerView;
    override html2block(
        el: Element,
        parseEl: (el: Element) => any[]
    ): any[] | null {
        const tag_name = el.tagName;
        if (tag_name === 'HR') {
            return [
                {
                    type: this.type,
                    properties: {
                        text: {},
                    },
                    children: [],
                },
            ];
        }

        return null;
    }
    override async block2html(props: Block2HtmlProps) {
        return `<hr/>`;
    }
}
