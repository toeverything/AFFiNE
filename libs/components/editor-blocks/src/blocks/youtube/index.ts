import { Protocol } from '@toeverything/datasource/db-service';
import {
    AsyncBlock,
    BaseView,
    SelectBlock,
} from '@toeverything/framework/virgo';
import { YoutubeView } from './YoutubeView';
import {
    Block2HtmlProps,
    commonBlock2HtmlContent,
} from '../../utils/commonBlockClip';

export class YoutubeBlock extends BaseView {
    public override selectable = true;
    public override activatable = false;
    type = Protocol.Block.Type.youtube;
    View = YoutubeView;

    override html2block(
        el: Element,
        parseEl: (el: Element) => any[]
    ): any[] | null {
        const tag_name = el.tagName;
        if (tag_name === 'A' && el.parentElement?.childElementCount === 1) {
            const href = el.getAttribute('href');
            const allowedHosts = ['www.youtu.be', 'www.youtube.com'];
            const host = new URL(href).host;

            if (allowedHosts.includes(host)) {
                return [
                    {
                        type: this.type,
                        properties: {
                            // TODO: is not sure what value to fill in name
                            embedLink: {
                                name: this.type,
                                value: el.getAttribute('href'),
                            },
                        },
                        children: [],
                    },
                ];
            }
        }

        return null;
    }
    override async block2Text(block: AsyncBlock, selectInfo: SelectBlock) {
        return block.getProperty('embedLink')?.value ?? '';
    }
    override async block2html({ block }: Block2HtmlProps) {
        const url = block.getProperty('embedLink')?.value;
        return `<p><a href="${url}">${url}</a></p>`;
    }
}
