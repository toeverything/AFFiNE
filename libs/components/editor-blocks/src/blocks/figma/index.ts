import {
    AsyncBlock,
    BaseView,
    SelectBlock,
} from '@toeverything/framework/virgo';
import { Protocol, services } from '@toeverything/datasource/db-service';
import { FigmaView } from './FigmaView';

export class FigmaBlock extends BaseView {
    public override selectable = true;
    public override activatable = false;
    type = Protocol.Block.Type.figma;
    View = FigmaView;

    override html2block(
        el: Element,
        parseEl: (el: Element) => any[]
    ): any[] | null {
        const tag_name = el.tagName;
        if (tag_name === 'A' && el.parentElement?.childElementCount === 1) {
            const href = el.getAttribute('href');
            if (href.indexOf('.figma.com') !== -1) {
                return [
                    {
                        type: this.type,
                        properties: {
                            // TODO: Not sure what value to fill for name
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

    override async block2html(
        block: AsyncBlock,
        children: SelectBlock[],
        generateHtml: (el: any[]) => Promise<string>
    ): Promise<string> {
        const figma_url = block.getProperty('embedLink')?.value;
        return `<p><a src=${figma_url}>${figma_url}</p>`;
    }
}
